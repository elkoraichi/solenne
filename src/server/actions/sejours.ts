'use server'

import { debutDeJour } from '@/domain/core/dates'
import { messagePour } from '@/domain/core/messages'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import {
  LONGUEURS,
  schemaIdentifiant,
  schemaJour,
  validerEntree,
  z,
} from '@/domain/core/validation'
import { periodeValide } from '@/domain/house/blocages'
import { CAPACITE_MAX } from '@/domain/house/capacite'
import { occupationSur } from '@/domain/occupancy/occupation'
import { evaluerDemande } from '@/domain/stays/demande'
import { verifierAnnulable } from '@/domain/stays/sejour'
import type { StayStatus } from '@/generated/prisma/enums'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireRole, requireUser } from '@/server/auth/garde'
import { visibiliteParDefaut } from '@/server/confidentialite'
import { db } from '@/server/db'
import { contexteDisponibilite } from '@/server/disponibilite'
import { reglagesActuelsDeLaMaison } from '@/server/reglages'
import { avecRejeuSerialisable, type Transaction } from '@/server/transaction-serialisable'

/**
 * `STAY` — dernier module du lot 3 : la vie d'un séjour une fois confirmé.
 *
 * Trois idées portent ce fichier :
 *
 * 1. **La création directe dispute la même ressource que l'acceptation**
 *    (`STAYDEC-A`) : la capacité et l'exclusivité. `creerSejourPersonnel`
 *    rejoue donc `evaluerDemande` dans une transaction `Serializable`, avec
 *    le même rejeu de course (`avecRejeuSerialisable`, extrait de
 *    `decisions-sejour.ts`).
 * 2. **Annuler ne dispute rien.** Ça ne fait que retirer une occupation :
 *    aucune course possible, une transaction ordinaire suffit — même choix
 *    que le refus et la contre-proposition de `STAYDEC-B`.
 * 3. **« Passé » se lit sur la date, jamais sur le seul statut**
 *    (`verifierAnnulable`, `src/domain/stays/sejour.ts`) : le traitement
 *    quotidien qui bascule `CONFIRMED` en `COMPLETED`
 *    (`src/server/taches/cloture-sejours.ts`) n'a pas besoin d'être passé
 *    pour qu'un séjour terminé refuse déjà son annulation.
 */

const schemaCreationPersonnelle = z.object({
  arrivee: schemaJour,
  depart: schemaJour,
  adultes: z.number().int().min(1).max(CAPACITE_MAX),
  enfants: z.number().int().min(0).max(CAPACITE_MAX),
  exclusif: z.boolean().optional(),
})

interface SejourCree {
  readonly sejourId: string
}

/** STAY-002 / STAY-R1 — un séjour de Solenne, sans demande. */
export async function creerSejourPersonnel(entree: unknown): Promise<Resultat<SejourCree>> {
  return executerAction('sejour.creerPersonnel', async () => {
    const solenne = await requireRole('ADMIN', 'sejour.creerPersonnel')

    const validation = validerEntree(schemaCreationPersonnelle, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    if (!periodeValide(donnees.arrivee, donnees.depart)) {
      throw new ErreurMetier('INVALID_DATES')
    }

    return avecRejeuSerialisable((transaction) =>
      creerSejourPersonnelDansLaTransaction(transaction, donnees, solenne.id),
    )
  })
}

async function creerSejourPersonnelDansLaTransaction(
  transaction: Transaction,
  donnees: {
    readonly arrivee: Date
    readonly depart: Date
    readonly adultes: number
    readonly enfants: number
    readonly exclusif?: boolean
  },
  solenneId: string,
): Promise<Resultat<SejourCree>> {
  const maison = await transaction.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')

  const maintenant = new Date()
  const aPartirDe = debutDeJour(maintenant)

  const reglages = await reglagesActuelsDeLaMaison(maison.id, transaction)
  const contexte = await contexteDisponibilite(transaction, maison.capacityMax, { aPartirDe })
  const occupationPeriode = occupationSur(contexte.presences, {
    debut: donnees.arrivee,
    fin: donnees.depart,
  })

  const { prealables, disponibilite } = evaluerDemande(
    {
      arrivee: donnees.arrivee,
      depart: donnees.depart,
      adultes: donnees.adultes,
      enfants: donnees.enfants,
      invites: [],
      exclusif: donnees.exclusif ?? false,
      maintenant,
      reglesObligatoiresNonAcceptees: false,
    },
    { ...contexte, reglages, estSolenne: true, periodeOccupee: occupationPeriode.total > 0 },
  )

  const premierPrealable = prealables[0]
  if (premierPrealable) {
    return { ok: false, code: premierPrealable.code, message: premierPrealable.message }
  }

  if (!disponibilite.compatible) {
    const dominant = disponibilite.conflits[0]
    return dominant
      ? { ok: false, code: dominant.code, message: dominant.message }
      : { ok: false, code: 'CONFLICT', message: messagePour('CONFLICT') }
  }

  const niveau = await visibiliteParDefaut(transaction, { sejourDeSolenne: true })

  const sejour = await transaction.stay.create({
    data: {
      houseId: maison.id,
      userId: solenneId,
      startDate: donnees.arrivee,
      endDate: donnees.depart,
      adults: donnees.adultes,
      children: donnees.enfants,
      exclusive: donnees.exclusif ?? false,
      isOwnerStay: true,
      privacyLevel: niveau,
      status: 'CONFIRMED',
    },
  })

  await journaliserAudit(
    {
      acteurId: solenneId,
      action: 'sejour.creerPersonnel',
      entite: 'Stay',
      entiteId: sejour.id,
      apres: { statut: 'CONFIRMED', arrivee: donnees.arrivee, depart: donnees.depart },
    },
    transaction,
  )

  return succes({ sejourId: sejour.id })
}

export interface SejourVue {
  readonly id: string
  readonly arrivee: Date
  readonly depart: Date
  readonly adultes: number
  readonly enfants: number
  readonly exclusif: boolean
  readonly statut: StayStatus
  readonly isOwnerStay: boolean
  readonly cancelReason: string | null
}

function versSejourVue(sejour: {
  readonly id: string
  readonly startDate: Date
  readonly endDate: Date
  readonly adults: number
  readonly children: number
  readonly exclusive: boolean
  readonly status: StayStatus
  readonly isOwnerStay: boolean
  readonly cancelReason: string | null
}): SejourVue {
  return {
    id: sejour.id,
    arrivee: sejour.startDate,
    depart: sejour.endDate,
    adultes: sejour.adults,
    enfants: sejour.children,
    exclusif: sejour.exclusive,
    statut: sejour.status,
    isOwnerStay: sejour.isOwnerStay,
    cancelReason: sejour.cancelReason,
  }
}

/** STAY-001 / STAY-009 — mes séjours, tous statuts confondus (l'historique inclus). */
export async function mesSejours(): Promise<Resultat<readonly SejourVue[]>> {
  return executerAction('sejour.mesSejours', async () => {
    const utilisateur = await requireUser('sejour.mesSejours')

    const sejours = await db.stay.findMany({
      where: { userId: utilisateur.id },
      orderBy: { startDate: 'desc' },
    })

    return succes(sejours.map(versSejourVue))
  })
}

export interface SejourAdminVue extends SejourVue {
  readonly proprietaireId: string
  readonly proprietairePrenom: string
}

/**
 * Console de Solenne (§5 de la fiche : elle voit tout). Les séjours vivants
 * seulement — `chargerSejours` (`PRIV`) fait le même choix pour l'agenda.
 */
export async function sejoursDeLaMaison(): Promise<Resultat<readonly SejourAdminVue[]>> {
  return executerAction('sejour.sejoursDeLaMaison', async () => {
    await requireRole('ADMIN', 'sejour.sejoursDeLaMaison')

    const sejours = await db.stay.findMany({
      where: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
      include: { user: { select: { firstName: true } } },
      orderBy: { startDate: 'asc' },
    })

    return succes(
      sejours.map((sejour) => ({
        ...versSejourVue(sejour),
        proprietaireId: sejour.userId,
        proprietairePrenom: sejour.user.firstName,
      })),
    )
  })
}

const schemaAnnulationSejour = z.object({ id: schemaIdentifiant })

/** STAY-003 / STAY-R2 — l'ami annule son propre séjour ; Solenne est prévenue. */
export async function annulerSejour(entree: unknown): Promise<Resultat<null>> {
  return executerAction('sejour.annuler', async () => {
    const utilisateur = await requireUser('sejour.annuler')

    const validation = validerEntree(schemaAnnulationSejour, entree)
    if (!validation.ok) return validation
    const { id } = validation.data

    const sejour = await db.stay.findUnique({ where: { id } })
    // S3/S4 : le séjour d'un autre rend le même refus qu'un séjour inexistant.
    if (!sejour || sejour.userId !== utilisateur.id) throw new ErreurMetier('NOT_FOUND')

    const refus = verifierAnnulable(sejour.status, sejour.endDate, new Date())
    if (refus) return { ok: false, code: refus.code, message: refus.message }

    await db.$transaction(async (transaction) => {
      await transaction.stay.update({ where: { id }, data: { status: 'CANCELLED' } })

      const solenne = await transaction.user.findFirst({
        where: { role: 'ADMIN' },
        select: { id: true },
      })
      if (solenne) {
        await transaction.notification.create({
          data: {
            userId: solenne.id,
            type: 'sejour.annule',
            title: `${utilisateur.firstName} a annulé son séjour`,
            body: null,
            entityType: 'Stay',
            entityId: id,
            payload: { arrivee: sejour.startDate, depart: sejour.endDate },
          },
        })
      }

      await journaliserAudit(
        {
          acteurId: utilisateur.id,
          action: 'sejour.annuler',
          entite: 'Stay',
          entiteId: id,
          avant: { statut: sejour.status },
          apres: { statut: 'CANCELLED' },
        },
        transaction,
      )
    })

    return succes(null)
  })
}

const schemaAnnulationParSolenne = z.object({
  id: schemaIdentifiant,
  motif: z
    .string({ error: 'Le motif est obligatoire.' })
    .trim()
    .min(1, { error: 'Le motif est obligatoire.' })
    .max(LONGUEURS.moyenne),
})

/** STAY-005 / STAY-006 / STAY-R3 — Solenne annule, motif obligatoire, l'ami est prévenu. */
export async function annulerSejourParSolenne(entree: unknown): Promise<Resultat<null>> {
  return executerAction('sejour.annulerParSolenne', async () => {
    const solenne = await requireRole('ADMIN', 'sejour.annulerParSolenne')

    const validation = validerEntree(schemaAnnulationParSolenne, entree)
    if (!validation.ok) return validation
    const { id, motif } = validation.data

    const sejour = await db.stay.findUnique({ where: { id } })
    if (!sejour) throw new ErreurMetier('NOT_FOUND')

    const refus = verifierAnnulable(sejour.status, sejour.endDate, new Date())
    if (refus) return { ok: false, code: refus.code, message: refus.message }

    await db.$transaction(async (transaction) => {
      await transaction.stay.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: motif },
      })

      await transaction.notification.create({
        data: {
          userId: sejour.userId,
          type: 'sejour.annuleParSolenne',
          title: 'Votre séjour a été annulé',
          body: motif,
          entityType: 'Stay',
          entityId: id,
          payload: { arrivee: sejour.startDate, depart: sejour.endDate },
        },
      })

      await journaliserAudit(
        {
          acteurId: solenne.id,
          action: 'sejour.annulerParSolenne',
          entite: 'Stay',
          entiteId: id,
          avant: { statut: sejour.status },
          apres: { statut: 'CANCELLED', motif },
        },
        transaction,
      )
    })

    return succes(null)
  })
}

export interface SuggestionLiberationVue {
  readonly requestId: string
  readonly requesterId: string
  readonly requesterPrenom: string
  readonly arrivee: Date
  readonly depart: Date
}

/**
 * STAY-010 — parmi les demandes refusées à venir, celles que la maison
 * pourrait accueillir maintenant. Portée par la console `/gerer`
 * (`DASH` est reporté en vague 2, comme `P9` l'a déjà tranché pour les
 * blocages).
 */
export async function suggestionsLiberation(): Promise<
  Resultat<readonly SuggestionLiberationVue[]>
> {
  return executerAction('sejour.suggestionsLiberation', async () => {
    await requireRole('ADMIN', 'sejour.suggestionsLiberation')

    const maison = await db.house.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!maison) return succes([])

    const maintenant = new Date()
    const aPartirDe = debutDeJour(maintenant)

    const [reglages, contexte, demandesRefusees] = await Promise.all([
      reglagesActuelsDeLaMaison(maison.id),
      contexteDisponibilite(db, maison.capacityMax, { aPartirDe }),
      db.stayRequest.findMany({
        where: { status: 'REJECTED', arrivalDate: { gte: aPartirDe } },
        include: { requester: { select: { firstName: true } } },
      }),
    ])

    const suggestions: SuggestionLiberationVue[] = []

    for (const demande of demandesRefusees) {
      const occupationPeriode = occupationSur(contexte.presences, {
        debut: demande.arrivalDate,
        fin: demande.departureDate,
      })

      const { disponibilite } = evaluerDemande(
        {
          arrivee: demande.arrivalDate,
          depart: demande.departureDate,
          adultes: demande.adults,
          enfants: demande.children,
          invites: [],
          exclusif: demande.exclusive,
          maintenant,
          reglesObligatoiresNonAcceptees: false,
        },
        { ...contexte, reglages, estSolenne: false, periodeOccupee: occupationPeriode.total > 0 },
      )

      if (disponibilite.compatible) {
        suggestions.push({
          requestId: demande.id,
          requesterId: demande.requesterId,
          requesterPrenom: demande.requester.firstName,
          arrivee: demande.arrivalDate,
          depart: demande.departureDate,
        })
      }
    }

    return succes(suggestions)
  })
}
