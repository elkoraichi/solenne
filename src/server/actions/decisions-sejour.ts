'use server'

import { resumePourSolenne } from '@/domain/availability/conflits'
import { debutDeJour } from '@/domain/core/dates'
import type { CodeErreur } from '@/domain/core/error-codes'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import {
  LONGUEURS,
  schemaIdentifiant,
  schemaJour,
  validerEntree,
  z,
} from '@/domain/core/validation'
import { periodeValide } from '@/domain/house/blocages'
import { occupationSur } from '@/domain/occupancy/occupation'
import {
  evaluerAcceptation,
  verifierDecidable,
  type StatutDemande,
} from '@/domain/stays/decision'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireRole } from '@/server/auth/garde'
import { visibiliteParDefaut } from '@/server/confidentialite'
import { db } from '@/server/db'
import { contexteDisponibilite } from '@/server/disponibilite'
import { reglagesActuelsDeLaMaison } from '@/server/reglages'
import { avecRejeuSerialisable, type Transaction } from '@/server/transaction-serialisable'

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

const schemaAcceptation = z.object({
  id: schemaIdentifiant,
  /** Mot d'accueil, facultatif — il part dans la notification du demandeur. */
  message: z.string().trim().max(LONGUEURS.longue).optional(),
  /** SDEC-R4 — « accepter quand même » une demande devenue incompatible. */
  confirme: z.boolean().optional(),
})

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

    return avecRejeuSerialisable((transaction) =>
      accepterDansLaTransaction(transaction, donnees, solenne.id),
    )
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

/**
 * `STAYDEC-B`.
 *
 * Trois pièces manquaient à l'arrêt `A`, qui ne tenait que l'acceptation :
 *
 * 1. **La file d'attente** (`STAYDEC-013`) : les demandes `PENDING`, triées
 *    pour que l'urgence (arrivée proche) et l'ancienneté (déposée tôt)
 *    remontent ensemble en tête — arrivée croissante d'abord, dépôt croissant
 *    à égalité.
 * 2. **Le verdict complet, en lecture seule** (`STAYDEC-002`, `STAYDEC-003`) :
 *    l'écran de décision a besoin de `confirmationSuffirait` et des chiffres
 *    d'occupation, qu'un refus d'écriture ne peut pas porter (`Echec` n'a de
 *    place que pour un code et un message). Même principe que
 *    `verifierDisponibiliteSejour` (`STAYREQ-B`) : un aperçu, pas une
 *    décision. SDEC-R2 reste entier — `accepterDemandeSejour` revalide pour de
 *    vrai, dans sa propre transaction.
 * 3. **Refus et contre-proposition** (SDEC-R5, SDEC-R8). Aucun des deux ne
 *    joue la course à la capacité que l'acceptation joue (§9 de la fiche ne
 *    les classe pas `CRITICAL`) : pas de `Serializable`, pas de rejeu — une
 *    transaction ordinaire suffit à garder l'écriture, la notification et
 *    l'audit solidaires (SDEC-R7). SDEC-R6 est vérifiée avant l'écriture, avec
 *    la fonction déjà éprouvée par `evaluerAcceptation`.
 */

export interface DemandeEnAttenteVue {
  readonly id: string
  readonly requesterId: string
  readonly requesterPrenom: string
  readonly arrivee: Date
  readonly depart: Date
  readonly adultes: number
  readonly enfants: number
  readonly exclusif: boolean
  readonly creeLe: Date
}

/** `STAYDEC-013` — la file d'attente de Solenne. */
export async function demandesEnAttente(): Promise<
  Resultat<readonly DemandeEnAttenteVue[]>
> {
  return executerAction('demandeSejour.fileAttente', async () => {
    await requireRole('ADMIN', 'demandeSejour.fileAttente')

    const demandes = await db.stayRequest.findMany({
      where: { status: 'PENDING' },
      include: { requester: { select: { firstName: true } } },
      orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }],
    })

    return succes(
      demandes.map((demande) => ({
        id: demande.id,
        requesterId: demande.requesterId,
        requesterPrenom: demande.requester.firstName,
        arrivee: demande.arrivalDate,
        depart: demande.departureDate,
        adultes: demande.adults,
        enfants: demande.children,
        exclusif: demande.exclusive,
        creeLe: demande.createdAt,
      })),
    )
  })
}

const schemaDecisionId = z.object({ id: schemaIdentifiant })

export interface VerdictDecisionVue {
  readonly compatible: boolean
  /** SDEC-R4 : vrai quand seule la confirmation manque. */
  readonly confirmationSuffirait: boolean
  readonly refus: { readonly code: CodeErreur; readonly message: string } | null
  /** Tous les conflits, chiffrés pour Solenne (`resumePourSolenne`). */
  readonly conflits: readonly { readonly code: CodeErreur; readonly message: string }[]
  readonly occupationAvantDemande: number
  readonly occupationAvecDemande: number
  readonly capacite: number
}

/**
 * `STAYDEC-002` / `STAYDEC-003` — le verdict que l'écran de décision affiche
 * en clair. Lecture seule : voir le point 2 de l'en-tête.
 */
export async function verifierDecisionSejour(
  entree: unknown,
): Promise<Resultat<VerdictDecisionVue>> {
  return executerAction('demandeSejour.verifierDecision', async () => {
    await requireRole('ADMIN', 'demandeSejour.verifierDecision')

    const validation = validerEntree(schemaDecisionId, entree)
    if (!validation.ok) return validation
    const { id } = validation.data

    const demande = await db.stayRequest.findUnique({
      where: { id },
      include: { requester: { select: { role: true } } },
    })
    if (!demande) throw new ErreurMetier('NOT_FOUND')

    const maison = await db.house.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!maison) throw new ErreurMetier('NOT_FOUND')

    const maintenant = new Date()
    const aPartirDe = debutDeJour(maintenant)

    const [reglages, contexte] = await Promise.all([
      reglagesActuelsDeLaMaison(maison.id),
      contexteDisponibilite(db, maison.capacityMax, { aPartirDe }),
    ])

    const occupationPeriode = occupationSur(contexte.presences, {
      debut: demande.arrivalDate,
      fin: demande.departureDate,
    })

    const verdict = evaluerAcceptation(
      {
        arrivee: demande.arrivalDate,
        depart: demande.departureDate,
        adultes: demande.adults,
        enfants: demande.children,
        exclusif: demande.exclusive,
        statut: demande.status as StatutDemande,
        demandeurEstSolenne: demande.requester.role === 'ADMIN',
      },
      { ...contexte, reglages, periodeOccupee: occupationPeriode.total > 0 },
      { maintenant },
    )

    return succes({
      compatible: verdict.disponibilite.compatible,
      confirmationSuffirait: verdict.confirmationSuffirait,
      refus: verdict.refus,
      conflits: verdict.disponibilite.conflits.map((conflit) => ({
        code: conflit.code,
        message: resumePourSolenne(conflit),
      })),
      occupationAvantDemande: occupationPeriode.total,
      occupationAvecDemande: occupationPeriode.total + demande.adults + demande.children,
      capacite: contexte.capacite,
    })
  })
}

const schemaRefus = z.object({
  id: schemaIdentifiant,
  motif: z
    .string({ error: 'Le motif est obligatoire.' })
    .trim()
    .min(1, { error: 'Le motif est obligatoire.' })
    .max(LONGUEURS.moyenne),
})

/** SDEC-R5 / R7 — un refus exige un motif ; il part avec la notification. */
export async function rejeterDemandeSejour(entree: unknown): Promise<Resultat<null>> {
  return executerAction('demandeSejour.rejeter', async () => {
    const solenne = await requireRole('ADMIN', 'demandeSejour.rejeter')

    const validation = validerEntree(schemaRefus, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    const demande = await db.stayRequest.findUnique({ where: { id: donnees.id } })
    if (!demande) throw new ErreurMetier('NOT_FOUND')

    const indecidable = verifierDecidable(demande.status as StatutDemande)
    if (indecidable) {
      return { ok: false, code: indecidable.code, message: indecidable.message }
    }

    const maintenant = new Date()

    await db.$transaction(async (transaction) => {
      await transaction.stayRequest.update({
        where: { id: demande.id },
        data: {
          status: 'REJECTED',
          decidedById: solenne.id,
          decidedAt: maintenant,
          decisionNote: donnees.motif,
        },
      })

      await transaction.notification.create({
        data: {
          userId: demande.requesterId,
          type: 'sejour.refuse',
          title: 'Votre demande de séjour a été refusée',
          body: donnees.motif,
          entityType: 'StayRequest',
          entityId: demande.id,
          payload: { arrivee: demande.arrivalDate, depart: demande.departureDate },
        },
      })

      await journaliserAudit(
        {
          acteurId: solenne.id,
          action: 'demandeSejour.rejeter',
          entite: 'StayRequest',
          entiteId: demande.id,
          avant: { statut: demande.status },
          apres: { statut: 'REJECTED' },
        },
        transaction,
      )
    })

    return succes(null)
  })
}

const schemaContreProposition = z.object({
  id: schemaIdentifiant,
  arrivee: schemaJour,
  depart: schemaJour,
  /** Part dans la notification, pour dire pourquoi. */
  message: z.string().trim().max(LONGUEURS.longue).optional(),
})

/**
 * SDEC-R8 — change les dates, ne décide rien : la demande reste `PENDING`,
 * dans le camp du demandeur. `decidedById`/`decidedAt` ne bougent pas — ce
 * n'est pas une décision.
 */
export async function contreProposerDemandeSejour(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('demandeSejour.contreProposer', async () => {
    const solenne = await requireRole('ADMIN', 'demandeSejour.contreProposer')

    const validation = validerEntree(schemaContreProposition, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    if (!periodeValide(donnees.arrivee, donnees.depart)) {
      throw new ErreurMetier('INVALID_DATES')
    }

    const demande = await db.stayRequest.findUnique({ where: { id: donnees.id } })
    if (!demande) throw new ErreurMetier('NOT_FOUND')

    const indecidable = verifierDecidable(demande.status as StatutDemande)
    if (indecidable) {
      return { ok: false, code: indecidable.code, message: indecidable.message }
    }

    await db.$transaction(async (transaction) => {
      await transaction.stayRequest.update({
        where: { id: demande.id },
        data: { arrivalDate: donnees.arrivee, departureDate: donnees.depart },
      })

      await transaction.notification.create({
        data: {
          userId: demande.requesterId,
          type: 'sejour.contre-proposition',
          title: 'Solenne propose d’autres dates',
          body: donnees.message ?? null,
          entityType: 'StayRequest',
          entityId: demande.id,
          payload: { arrivee: donnees.arrivee, depart: donnees.depart },
        },
      })

      await journaliserAudit(
        {
          acteurId: solenne.id,
          action: 'demandeSejour.contreProposer',
          entite: 'StayRequest',
          entiteId: demande.id,
          avant: { arrivee: demande.arrivalDate, depart: demande.departureDate },
          apres: { arrivee: donnees.arrivee, depart: donnees.depart },
        },
        transaction,
      )
    })

    return succes(null)
  })
}
