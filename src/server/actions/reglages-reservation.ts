'use server'

import { debutDeJour } from '@/domain/core/dates'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { validerEntree, z } from '@/domain/core/validation'
import { occupationSur } from '@/domain/occupancy/occupation'
import {
  verifierCoherence,
  verifierReglages,
  type ReglagesReservation,
} from '@/domain/policy/reglages'
import type { PrismaClient } from '@/generated/prisma/client'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireRole, requireUser } from '@/server/auth/garde'
import { db } from '@/server/db'
import { toutesLesPresences } from '@/server/occupation'
import {
  REGLAGES_PAR_DEFAUT,
  reglagesActuelsDeLaMaison,
  versColonnes,
  versReglages,
} from '@/server/reglages'

/**
 * Module `POLICY` — persistance et console des réglages de réservation
 * (`src/domain/policy/reglages.ts`, arrêt `POLICY-A`).
 *
 * Une seule ligne, `booking_settings`, comme `HOUSE` pour la maison : aucune
 * action ne prend d'identifiant de maison en entrée (même parti que
 * `maison.ts`, HOUSE-S02).
 */

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const schemaReglages = z.object({
  dureeMaxNuits: z.number().int().min(1).nullable(),
  delaiMinHeures: z.number().int().min(0).nullable(),
  horizonMaxJours: z.number().int().min(0).nullable(),
  joursArriveeInterdits: z.array(z.number().int().min(1).max(7)).max(7),
  maxPersonnesParDemande: z.number().int().min(1).nullable(),
  cohabitationAutorisee: z.boolean(),
})

export interface DemandeSignalee {
  readonly id: string
  readonly qui: string
  readonly du: Date
  readonly au: Date
}

async function laMaison(client: PrismaClient | Transaction = db) {
  const maison = await client.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')
  return maison
}

/**
 * Lecture — ouverte à tout le cercle (fiche §5 : un ami voit les réglages
 * applicables, « formulation simple »). Aucune ligne encore créée rend les
 * réglages par défaut : aucune règle active, tout est permis (POL-R2).
 */
export async function reglagesReservation(): Promise<Resultat<ReglagesReservation>> {
  return executerAction('reglages.voir', async () => {
    await requireUser('reglages.voir')

    const maison = await laMaison()
    return succes(await reglagesActuelsDeLaMaison(maison.id))
  })
}

/**
 * Vrai si une demande en attente serait refusée par ces réglages — même
 * calcul que `STAYREQ` fera plus tard, réduit à ce dont `POLICY-014` a besoin :
 * savoir si le durcissement casse quelque chose, pas produire un refus détaillé.
 */
function seraitIncompatible(
  demande: {
    readonly arrivalDate: Date
    readonly departureDate: Date
    readonly adults: number
    readonly children: number
  },
  reglages: ReglagesReservation,
  presences: Parameters<typeof occupationSur>[0],
  maintenant: Date,
): boolean {
  const occupation = occupationSur(presences, {
    debut: demande.arrivalDate,
    fin: demande.departureDate,
  })

  return (
    verifierReglages(
      {
        arrivee: demande.arrivalDate,
        depart: demande.departureDate,
        personnes: demande.adults + demande.children,
        maintenant,
        periodeOccupee: occupation.total > 0,
      },
      reglages,
    ).length > 0
  )
}

/**
 * POL-R1/R2/R5/R6/R9 (enregistrement) et POL-R4 (signalement) — Solenne
 * modifie les réglages.
 *
 * POL-R9 et POL-R5 sont des refus **durs** : `verifierCoherence` empêche
 * d'enregistrer des réglages qui rendraient toute demande impossible (§10 de
 * la fiche). POL-R4 n'en est pas un : les demandes en attente devenues
 * incompatibles sont **rendues**, pas bloquées — à Solenne de décider quoi en
 * faire, dans sa console. POL-R3 tient par construction : aucune ligne
 * `Stay` n'est jamais relue ici.
 */
export async function mettreAJourReglagesReservation(entree: unknown): Promise<
  Resultat<{ readonly demandesDevenuesIncompatibles: readonly DemandeSignalee[] }>
> {
  return executerAction('reglages.mettreAJour', async () => {
    const solenne = await requireRole('ADMIN', 'reglages.mettreAJour')

    const validation = validerEntree(schemaReglages, entree)
    if (!validation.ok) return validation
    const nouveaux = validation.data

    const maison = await laMaison()

    const incoherence = verifierCoherence(nouveaux, maison.capacityMax)[0]
    if (incoherence) {
      throw new ErreurMetier(incoherence.code, {
        ...(incoherence.parametres ? { parametres: incoherence.parametres } : {}),
      })
    }

    const aPartirDe = debutDeJour(new Date())
    const maintenant = new Date()

    const [avant, presences, demandes] = await Promise.all([
      db.bookingSettings.findUnique({ where: { houseId: maison.id } }),
      toutesLesPresences(db, { aPartirDe }),
      db.stayRequest.findMany({
        where: { status: 'PENDING', departureDate: { gt: aPartirDe } },
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

    const anciens = avant ? versReglages(avant) : REGLAGES_PAR_DEFAUT

    // POL-R4 — ce que le changement casse parmi les demandes en attente :
    // tenait avant, ne tient plus après. Un assouplissement n'y figure jamais.
    const demandesDevenuesIncompatibles: DemandeSignalee[] = demandes
      .filter(
        (demande) =>
          !seraitIncompatible(demande, anciens, presences, maintenant) &&
          seraitIncompatible(demande, nouveaux, presences, maintenant),
      )
      .map((demande) => ({
        id: demande.id,
        qui: demande.requester.firstName,
        du: demande.arrivalDate,
        au: demande.departureDate,
      }))

    await db.$transaction(
      async (transaction) => {
        await transaction.bookingSettings.upsert({
          where: { houseId: maison.id },
          create: { houseId: maison.id, ...versColonnes(nouveaux) },
          update: versColonnes(nouveaux),
        })

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'reglages.mettreAJour',
            entite: 'BookingSettings',
            entiteId: maison.id,
            avant: anciens,
            apres: nouveaux,
            details: {
              demandesDevenuesIncompatibles: demandesDevenuesIncompatibles.map(
                (d) => d.id,
              ),
            },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes({ demandesDevenuesIncompatibles })
  })
}
