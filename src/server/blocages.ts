import 'server-only'

import { ErreurMetier } from '@/domain/core/result'
import { blocageSur, blocagesSur, type Periode } from '@/domain/house/blocages'
import type { PrismaClient } from '@/generated/prisma/client'
import { db } from '@/server/db'

/**
 * `BLOCK` côté serveur — la lecture des périodes bloquées et la règle R1.
 *
 * Ce fichier est la porte que `AVAIL` (lot 3) franchira : `verifierPeriodeLibre`
 * est la règle R1 de la disponibilité — un blocage interdit toute demande sur
 * la période, sans exception (BLK-R1). Elle est écrite ici, une fois, pour que
 * `STAYREQ` et `STAYDEC` n'aient pas chacun leur version.
 *
 * La décision de chevauchement appartient au domaine (`blocageSur`) : le filtre
 * SQL ne fait que réduire le nombre de lignes lues, il ne tranche rien.
 */

type Client =
  | PrismaClient
  | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export interface BlocageEnBase extends Periode {
  readonly id: string
  readonly libelle: string
  readonly motif: string | null
}

/**
 * Les blocages susceptibles de concerner une période.
 * `endDate > arrivee` élimine le passé ; le reste est tranché par le domaine.
 */
export async function chargerBlocages(
  client: Client = db,
  options: { readonly aPartirDe?: Date } = {},
): Promise<BlocageEnBase[]> {
  const periodes = await client.blockedPeriod.findMany({
    where: options.aPartirDe ? { endDate: { gt: options.aPartirDe } } : {},
    select: {
      id: true,
      startDate: true,
      endDate: true,
      label: true,
      reason: true,
    },
    orderBy: { startDate: 'asc' },
  })

  return periodes.map((periode) => ({
    id: periode.id,
    du: periode.startDate,
    au: periode.endDate,
    libelle: periode.label,
    motif: periode.reason,
  }))
}

/**
 * BLK-R1 — lève `BLOCKED_PERIOD` si les dates touchent un blocage.
 *
 * Le refus ne dit **pas** pourquoi la maison est bloquée : « ces dates ne sont
 * pas disponibles » et rien de plus. Le motif appartient à Solenne (BLOCK-S09).
 */
export async function verifierPeriodeLibre(
  arrivee: Date,
  depart: Date,
  client: Client = db,
): Promise<void> {
  const blocages = await chargerBlocages(client, { aPartirDe: arrivee })
  if (blocageSur(blocages, arrivee, depart)) {
    throw new ErreurMetier('BLOCKED_PERIOD')
  }
}

/** Les séjours **confirmés** qui occupent une période. Vide = la voie est libre. */
export async function sejoursConfirmesSur(
  client: Client,
  arrivee: Date,
  depart: Date,
) {
  const sejours = await client.stay.findMany({
    where: { status: 'CONFIRMED', endDate: { gt: arrivee } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      adults: true,
      children: true,
      user: { select: { firstName: true } },
    },
    orderBy: { startDate: 'asc' },
  })

  return blocagesSur(
    sejours.map((sejour) => ({ ...sejour, du: sejour.startDate, au: sejour.endDate })),
    arrivee,
    depart,
  )
}

/** Les demandes **en attente** qui tombent sur une période (BLK-R4). */
export async function demandesEnAttenteSur(
  client: Client,
  arrivee: Date,
  depart: Date,
) {
  const demandes = await client.stayRequest.findMany({
    where: { status: 'PENDING', departureDate: { gt: arrivee } },
    select: {
      id: true,
      arrivalDate: true,
      departureDate: true,
      adults: true,
      children: true,
      requester: { select: { firstName: true } },
    },
    orderBy: { arrivalDate: 'asc' },
  })

  return blocagesSur(
    demandes.map((demande) => ({
      ...demande,
      du: demande.arrivalDate,
      au: demande.departureDate,
    })),
    arrivee,
    depart,
  )
}
