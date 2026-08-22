'use server'

import { resumePourSolenne } from '@/domain/availability/conflits'
import { debutDeJour } from '@/domain/core/dates'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { LONGUEURS, schemaIdentifiant, validerEntree, z } from '@/domain/core/validation'
import { occupationSur } from '@/domain/occupancy/occupation'
import { evaluerAcceptation, type StatutDemande } from '@/domain/stays/decision'
import type { PrismaClient } from '@/generated/prisma/client'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireRole } from '@/server/auth/garde'
import { visibiliteParDefaut } from '@/server/confidentialite'
import { db } from '@/server/db'
import { contexteDisponibilite } from '@/server/disponibilite'
import { reglagesActuelsDeLaMaison } from '@/server/reglages'

/**
 * `STAYDEC` — arrêt `STAYDEC-A` : accepter une demande, et rien d'autre.
 *
 * Ce fichier tient la seule promesse difficile du lot 3 : deux acceptations
 * lancées à la même seconde sur la dernière place ne peuvent pas produire deux
 * séjours. Trois mécanismes s'empilent, du plus bavard au plus muet :
 *
 * 1. **La revalidation dans la transaction** (SDEC-R2). Le contexte que lit
 *    `evaluerAcceptation` est lu avec le client de la transaction, jamais avec
 *    `db`. Ce détail d'une ligne est tout l'arrêt : sous `Serializable`, ces
 *    lectures posent les verrous de prédicat qui permettent à PostgreSQL de
 *    voir la course. Lues hors transaction, elles seraient exactes, cohérentes
 *    — et invisibles au détecteur d'anomalies.
 * 2. **Le rejeu après anomalie de sérialisation** (`STAYDEC-C01`). Le perdant
 *    de la course ne reçoit pas une trace `40001` : sa transaction est rejouée,
 *    la revalidation voit alors le séjour du gagnant, et il obtient le refus
 *    métier qui correspond — `CAPACITY_EXCEEDED`, le plus souvent. C'est la
 *    différence entre « la base a refusé » et « la maison est pleine ».
 * 3. **Les contraintes d'exclusion** (`stays_sans_chevauchement_exclusif`,
 *    `stays_exclusif_sans_cohabitation`). Le filet sous le filet : si les deux
 *    premiers mécanismes échouaient, la base rendrait quand même l'état
 *    impossible impossible. Une violation est traitée comme une course et
 *    rejouée, pour la même raison qu'au point 2.
 */

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const schemaAcceptation = z.object({
  id: schemaIdentifiant,
  /** Mot d'accueil, facultatif — il part dans la notification du demandeur. */
  message: z.string().trim().max(LONGUEURS.longue).optional(),
  /** SDEC-R4 — « accepter quand même » une demande devenue incompatible. */
  confirme: z.boolean().optional(),
})

/** Nombre total de tentatives, rejeux compris. Deux suffisent à départager une
 * course à deux ; la troisième couvre le cas, rare, d'un troisième arrivant. */
const TENTATIVES_MAX = 3

/**
 * Une course perdue, quelle que soit la forme que PostgreSQL lui donne :
 * anomalie de sérialisation (`40001`), interblocage (`40P01`), violation d'une
 * contrainte d'exclusion (`23P01`), violation de l'unicité de `stays.request_id`
 * (`23505` / `P2002`), ou l'enveloppe Prisma de tout cela (`P2034`). Toutes
 * veulent dire la même chose — « recommence en regardant à nouveau » — et
 * aucune ne doit jamais atteindre un écran.
 *
 * L'unicité mérite un mot : c'est la forme que prend le **double clic** sur
 * « Accepter » (grille C6). Les deux transactions lisent la demande en
 * `PENDING`, les deux créent le séjour, et c'est l'index unique qui départage.
 * Rejouée, la perdante relit la demande — désormais `ACCEPTED` — et rend le
 * refus que SDEC-R6 prévoit, « cette demande a déjà été traitée », plutôt qu'un
 * `CONFLICT` générique qui n'apprend rien à Solenne.
 */
const COURSES: readonly string[] = ['P2034', 'P2002', '40001', '40P01', '23P01', '23505']

function estCourseDeTransaction(erreur: unknown): boolean {
  if (typeof erreur !== 'object' || erreur === null) return false
  const code = (erreur as { code?: unknown }).code
  if (typeof code === 'string' && COURSES.includes(code)) return true
  const message = (erreur as { message?: unknown }).message
  if (typeof message !== 'string') return false
  return (
    message.includes('40001') ||
    message.includes('40P01') ||
    message.includes('23P01') ||
    message.includes('23505') ||
    message.includes('could not serialize') ||
    message.includes('conflicting key value violates exclusion constraint') ||
    message.includes('Unique constraint failed')
  )
}

interface Acceptation {
  readonly sejourId: string
  readonly compatible: boolean
}

/**
 * SDEC-R1 / R3 / R7 — Solenne accepte : le statut change, le séjour naît, la
 * notification part et l'audit s'écrit **dans la même transaction**. Aucun de
 * ces quatre effets ne peut exister sans les trois autres (`STAYDEC-011`).
 */
export async function accepterDemandeSejour(
  entree: unknown,
): Promise<Resultat<Acceptation>> {
  return executerAction('demandeSejour.accepter', async () => {
    const solenne = await requireRole('ADMIN', 'demandeSejour.accepter')

    const validation = validerEntree(schemaAcceptation, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    let derniereCourse: unknown = null

    for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative += 1) {
      try {
        return await db.$transaction(
          (transaction) => accepterDansLaTransaction(transaction, donnees, solenne.id),
          { isolationLevel: 'Serializable' },
        )
      } catch (erreur) {
        if (!estCourseDeTransaction(erreur)) throw erreur
        derniereCourse = erreur
        // On repart de zéro : la revalidation du tour suivant lira l'état que
        // le gagnant vient de valider, et rendra un refus qui a du sens.
      }
    }

    throw derniereCourse
  })
}

async function accepterDansLaTransaction(
  transaction: Transaction,
  donnees: { readonly id: string; readonly message?: string; readonly confirme?: boolean },
  decideurId: string,
): Promise<Resultat<Acceptation>> {
  const demande = await transaction.stayRequest.findUnique({
    where: { id: donnees.id },
    include: { requester: { select: { id: true, role: true, firstName: true } } },
  })
  if (!demande) throw new ErreurMetier('NOT_FOUND')

  const maison = await transaction.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')

  const maintenant = new Date()
  const aPartirDe = debutDeJour(maintenant)

  // Lectures **dans la transaction** — voir le point 1 de l'en-tête.
  const reglages = await reglagesActuelsDeLaMaison(maison.id, transaction)
  const contexte = await contexteDisponibilite(transaction, maison.capacityMax, {
    aPartirDe,
  })

  const occupationPeriode = occupationSur(contexte.presences, {
    debut: demande.arrivalDate,
    fin: demande.departureDate,
  })

  const demandeurEstSolenne = demande.requester.role === 'ADMIN'

  const verdict = evaluerAcceptation(
    {
      arrivee: demande.arrivalDate,
      depart: demande.departureDate,
      adultes: demande.adults,
      enfants: demande.children,
      exclusif: demande.exclusive,
      statut: demande.status as StatutDemande,
      demandeurEstSolenne,
    },
    { ...contexte, reglages, periodeOccupee: occupationPeriode.total > 0 },
    { maintenant, ...(donnees.confirme !== undefined ? { confirme: donnees.confirme } : {}) },
  )

  if (verdict.refus) {
    return { ok: false, code: verdict.refus.code, message: verdict.refus.message }
  }

  const niveau = await visibiliteParDefaut(transaction, {
    sejourDeSolenne: demandeurEstSolenne,
  })

  const invites = await transaction.stayGuest.findMany({
    where: { stayRequestId: demande.id },
    select: { name: true, isChild: true },
  })

  const sejour = await transaction.stay.create({
    data: {
      houseId: maison.id,
      requestId: demande.id,
      userId: demande.requesterId,
      startDate: demande.arrivalDate,
      endDate: demande.departureDate,
      adults: demande.adults,
      children: demande.children,
      exclusive: demande.exclusive,
      isOwnerStay: demandeurEstSolenne,
      privacyLevel: niveau,
      status: 'CONFIRMED',
      ...(invites.length > 0
        ? { guests: { create: invites.map((i) => ({ name: i.name, isChild: i.isChild })) } }
        : {}),
    },
  })

  await transaction.stayRequest.update({
    where: { id: demande.id },
    data: {
      status: 'ACCEPTED',
      decidedById: decideurId,
      decidedAt: maintenant,
      decisionNote: donnees.message ?? null,
    },
  })

  // SDEC-R7 — notification interne. Elle ne contient que ce que le demandeur a
  // lui-même écrit : ni effectif d'autrui, ni motif de conflit (règle non
  // négociable n°4). L'envoi par courriel appartient au lot 6.
  await transaction.notification.create({
    data: {
      userId: demande.requesterId,
      type: 'sejour.accepte',
      title: 'Votre séjour est confirmé',
      body: donnees.message ?? null,
      entityType: 'StayRequest',
      entityId: demande.id,
      payload: { arrivee: demande.arrivalDate, depart: demande.departureDate },
    },
  })

  await journaliserAudit(
    {
      acteurId: decideurId,
      action: 'demandeSejour.accepter',
      entite: 'StayRequest',
      entiteId: demande.id,
      avant: { statut: demande.status },
      apres: { statut: 'ACCEPTED', sejourId: sejour.id },
      // Traçabilité de SDEC-R4 : si Solenne a passé outre, on garde de quoi.
      ...(verdict.disponibilite.compatible
        ? {}
        : {
            details: {
              forcee: true,
              // Le code d'abord : un message peut être réécrit, un code jamais
              // (`error-codes.ts`). La phrase suit, pour que la trace se lise
              // sans décoder.
              conflits: verdict.disponibilite.conflits.map((conflit) => ({
                code: conflit.code,
                resume: resumePourSolenne(conflit),
              })),
            },
          }),
    },
    transaction,
  )

  return succes({
    sejourId: sejour.id,
    compatible: verdict.disponibilite.compatible,
  })
}
