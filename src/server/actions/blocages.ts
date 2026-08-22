'use server'

import { debutDeJour, formaterPeriode } from '@/domain/core/dates'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import {
  LONGUEURS,
  schemaIdentifiant as identifiant,
  schemaJour,
  validerEntree,
  z,
} from '@/domain/core/validation'
import {
  blocagesSur,
  estRevolue,
  fusionnerPeriodes,
  periodeValide,
  TYPES_BLOCAGE,
  type Periode,
  type TypeBlocage,
} from '@/domain/house/blocages'
import type { PrismaClient } from '@/generated/prisma/client'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireRole, requireUser } from '@/server/auth/garde'
import {
  demandesEnAttenteSur,
  sejoursConfirmesSur,
} from '@/server/blocages'
import { db } from '@/server/db'

/**
 * Module `BLOCK` — les périodes bloquées.
 *
 * Deux lectures, jamais une seule filtrée après coup :
 *   · `periodesIndisponibles()` — pour le cercle. Des dates, rien d'autre. Ni
 *     libellé, ni motif, ni type, ni même le nombre de blocages : les périodes
 *     sont fusionnées avant l'envoi (D4, BLOCK-S09).
 *   · `blocages()` — pour Solenne. Tout, y compris les demandes signalées.
 *
 * La donnée privée n'est pas envoyée puis masquée : elle ne sort pas du serveur
 * (règle non négociable n°4).
 */

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const schemaPeriode = z.object({ du: schemaJour, au: schemaJour })

const schemaContenu = z.object({
  libelle: z
    .string({ error: 'Le libellé est obligatoire.' })
    .trim()
    .min(1, { error: 'Le libellé est obligatoire.' })
    .max(LONGUEURS.courte, { error: 'Ce libellé est trop long.' }),
  motif: z.string().trim().max(LONGUEURS.moyenne).nullish(),
  type: z.enum(TYPES_BLOCAGE, { error: 'Ce type de blocage n’existe pas.' }),
})

const schemaCreation = schemaPeriode.extend(schemaContenu.shape)
const schemaModification = schemaCreation.extend({ id: identifiant })
const schemaIdentifiant = z.object({ id: identifiant })

export interface PeriodeIndisponible {
  readonly du: Date
  readonly au: Date
}

export interface PeriodeConcernee {
  readonly id: string
  readonly qui: string
  readonly du: Date
  readonly au: Date
  readonly personnes: number
}

export interface Blocage extends PeriodeIndisponible {
  readonly id: string
  readonly libelle: string
  readonly motif: string | null
  readonly type: TypeBlocage
  /** BLOCK-004 — signalé, jamais refusé. */
  readonly revolue: boolean
  /** BLK-R4 — les demandes en attente que ce blocage condamne. */
  readonly demandesSignalees: readonly PeriodeConcernee[]
}

export interface ImpactBlocage {
  readonly revolue: boolean
  /** BLK-R3 — s'il y en a, le blocage sera refusé. */
  readonly sejoursEnCause: readonly PeriodeConcernee[]
  readonly demandesSignalees: readonly PeriodeConcernee[]
}

async function laMaison(client: PrismaClient | Transaction = db) {
  const maison = await client.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')
  return maison
}

function decrireSejour(sejour: {
  id: string
  du: Date
  au: Date
  adults: number
  children: number
  user: { firstName: string }
}): PeriodeConcernee {
  return {
    id: sejour.id,
    qui: sejour.user.firstName,
    du: sejour.du,
    au: sejour.au,
    personnes: sejour.adults + sejour.children,
  }
}

function decrireDemande(demande: {
  id: string
  du: Date
  au: Date
  adults: number
  children: number
  requester: { firstName: string }
}): PeriodeConcernee {
  return {
    id: demande.id,
    qui: demande.requester.firstName,
    du: demande.du,
    au: demande.au,
    personnes: demande.adults + demande.children,
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Ce qu'un ami a le droit de savoir : la maison est indisponible, de telle date
 * à telle date. Les blocages qui se chevauchent sont fusionnés — l'agenda ne
 * doit pas laisser deviner qu'il y en a trois (BLOCK-005, BLOCK-S09).
 */
export async function periodesIndisponibles(): Promise<
  Resultat<readonly PeriodeIndisponible[]>
> {
  return executerAction('blocages.indisponibles', async () => {
    await requireUser('blocages.indisponibles')

    const periodes = await db.blockedPeriod.findMany({
      select: { startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    })

    return succes(
      fusionnerPeriodes(
        periodes.map((periode) => ({ du: periode.startDate, au: periode.endDate })),
      ).map((periode) => ({ du: periode.du, au: periode.au })),
    )
  })
}

/** La console de Solenne : les blocages nommés, motif compris. */
export async function blocages(): Promise<Resultat<readonly Blocage[]>> {
  return executerAction('blocages.lister', async () => {
    await requireRole('ADMIN', 'blocages.lister')

    const aujourdhui = debutDeJour(new Date())

    const [periodes, demandes] = await Promise.all([
      db.blockedPeriod.findMany({ orderBy: { startDate: 'asc' } }),
      db.stayRequest.findMany({
        where: { status: 'PENDING', departureDate: { gt: aujourdhui } },
        select: {
          id: true,
          arrivalDate: true,
          departureDate: true,
          adults: true,
          children: true,
          requester: { select: { firstName: true } },
        },
        orderBy: { arrivalDate: 'asc' },
      }),
    ])

    const enAttente = demandes.map((demande) => ({
      ...demande,
      du: demande.arrivalDate,
      au: demande.departureDate,
    }))

    return succes(
      periodes.map((periode) => {
        const bornes: Periode = { du: periode.startDate, au: periode.endDate }
        return {
          id: periode.id,
          du: periode.startDate,
          au: periode.endDate,
          libelle: periode.label,
          motif: periode.reason,
          type: periode.type,
          revolue: estRevolue(bornes, aujourdhui),
          demandesSignalees: blocagesSur(
            enAttente,
            periode.startDate,
            periode.endDate,
          ).map(decrireDemande),
        }
      }),
    )
  })
}

/** Ce que ce blocage impliquerait, avant de le poser. Lecture seule. */
export async function impactBlocage(
  entree: unknown,
): Promise<Resultat<ImpactBlocage>> {
  return executerAction('blocages.impact', async () => {
    await requireRole('ADMIN', 'blocages.impact')

    const validation = validerEntree(schemaPeriode, entree)
    if (!validation.ok) return validation
    const { du, au } = validation.data

    if (!periodeValide(du, au)) throw new ErreurMetier('INVALID_DATES')

    const [sejours, demandes] = await Promise.all([
      sejoursConfirmesSur(db, du, au),
      demandesEnAttenteSur(db, du, au),
    ])

    return succes({
      revolue: estRevolue({ du, au }, debutDeJour(new Date())),
      sejoursEnCause: sejours.map(decrireSejour),
      demandesSignalees: demandes.map(decrireDemande),
    })
  })
}

// ---------------------------------------------------------------------------
// Écriture — Solenne seule (BLK-R6)
// ---------------------------------------------------------------------------

/**
 * BLK-R3 — un blocage ne passe jamais par-dessus un séjour confirmé.
 *
 * Le refus nomme le premier séjour : Solenne doit savoir quoi annuler, pas
 * seulement qu'elle ne peut pas. La liste complète est dans `impactBlocage`.
 *
 * La vérification et l'écriture partagent la même transaction sérialisable :
 * une confirmation de séjour concurrente ne peut pas se glisser entre les deux
 * (C5, BLOCK-C05).
 */
async function refuserSiSejourConfirme(
  transaction: Transaction,
  du: Date,
  au: Date,
): Promise<void> {
  const sejours = await sejoursConfirmesSur(transaction, du, au)
  const premier = sejours[0]
  if (!premier) return

  throw new ErreurMetier('BLOCKED_OVER_STAY', {
    parametres: {
      qui: premier.user.firstName,
      periode: formaterPeriode(premier.du, premier.au),
    },
  })
}

/** BLOCK-001 — création. */
export async function creerBlocage(entree: unknown): Promise<
  Resultat<{
    readonly id: string
    readonly demandesSignalees: readonly PeriodeConcernee[]
  }>
> {
  return executerAction('blocages.creer', async () => {
    const solenne = await requireRole('ADMIN', 'blocages.creer')

    const validation = validerEntree(schemaCreation, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    if (!periodeValide(donnees.du, donnees.au)) {
      throw new ErreurMetier('INVALID_DATES')
    }

    const motif = donnees.motif?.trim() ? donnees.motif.trim() : null

    const id = await db.$transaction(
      async (transaction) => {
        const maison = await laMaison(transaction)
        await refuserSiSejourConfirme(transaction, donnees.du, donnees.au)

        const cree = await transaction.blockedPeriod.create({
          data: {
            houseId: maison.id,
            startDate: donnees.du,
            endDate: donnees.au,
            label: donnees.libelle,
            reason: motif,
            type: donnees.type,
            createdById: solenne.id,
          },
        })

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'blocage.creation',
            entite: 'BlockedPeriod',
            entiteId: cree.id,
            apres: {
              startDate: donnees.du,
              endDate: donnees.au,
              label: donnees.libelle,
              type: donnees.type,
            },
          },
          transaction,
        )

        return cree.id
      },
      { isolationLevel: 'Serializable' },
    )

    // BLK-R4 : les demandes en attente ne bloquent rien, elles sont signalées.
    const demandes = await demandesEnAttenteSur(db, donnees.du, donnees.au)

    return succes({ id, demandesSignalees: demandes.map(decrireDemande) })
  })
}

/** BLOCK-010 — modification des dates, du libellé ou du motif. */
export async function modifierBlocage(entree: unknown): Promise<
  Resultat<{ readonly demandesSignalees: readonly PeriodeConcernee[] }>
> {
  return executerAction('blocages.modifier', async () => {
    const solenne = await requireRole('ADMIN', 'blocages.modifier')

    const validation = validerEntree(schemaModification, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    if (!periodeValide(donnees.du, donnees.au)) {
      throw new ErreurMetier('INVALID_DATES')
    }

    const motif = donnees.motif?.trim() ? donnees.motif.trim() : null

    await db.$transaction(
      async (transaction) => {
        const maison = await laMaison(transaction)
        const avant = await transaction.blockedPeriod.findFirst({
          where: { id: donnees.id, houseId: maison.id },
        })
        if (!avant) throw new ErreurMetier('NOT_FOUND')

        await refuserSiSejourConfirme(transaction, donnees.du, donnees.au)

        await transaction.blockedPeriod.update({
          where: { id: avant.id },
          data: {
            startDate: donnees.du,
            endDate: donnees.au,
            label: donnees.libelle,
            reason: motif,
            type: donnees.type,
          },
        })

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'blocage.modification',
            entite: 'BlockedPeriod',
            entiteId: avant.id,
            avant: {
              startDate: avant.startDate,
              endDate: avant.endDate,
              label: avant.label,
              type: avant.type,
            },
            apres: {
              startDate: donnees.du,
              endDate: donnees.au,
              label: donnees.libelle,
              type: donnees.type,
            },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    const demandes = await demandesEnAttenteSur(db, donnees.du, donnees.au)

    return succes({ demandesSignalees: demandes.map(decrireDemande) })
  })
}

/**
 * BLOCK-009 — suppression.
 *
 * Le seul objet du lot 2 qui se supprime vraiment : contrairement à une règle
 * ou à une chambre, un blocage levé n'a aucune histoire à raconter. Sa trace
 * reste au journal d'audit.
 */
export async function supprimerBlocage(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('blocages.supprimer', async () => {
    const solenne = await requireRole('ADMIN', 'blocages.supprimer')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation

    await db.$transaction(
      async (transaction) => {
        const maison = await laMaison(transaction)
        const avant = await transaction.blockedPeriod.findFirst({
          where: { id: validation.data.id, houseId: maison.id },
        })
        if (!avant) throw new ErreurMetier('NOT_FOUND')

        await transaction.blockedPeriod.delete({ where: { id: avant.id } })

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'blocage.suppression',
            entite: 'BlockedPeriod',
            entiteId: avant.id,
            avant: {
              startDate: avant.startDate,
              endDate: avant.endDate,
              label: avant.label,
              type: avant.type,
            },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes()
  })
}
