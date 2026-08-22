import 'server-only'

import {
  niveauParDefaut,
  type NiveauVisibilite,
  type SejourPrive,
} from '@/domain/privacy/visibilite'
import type { PrismaClient } from '@/generated/prisma/client'
import { db } from '@/server/db'

/**
 * `PRIV` côté serveur — la lecture brute des séjours et le niveau par défaut.
 *
 * Ce fichier **ne filtre rien** : il traduit des lignes en `SejourPrive`. Le
 * tri entre ce qui se montre et ce qui se tait appartient au domaine
 * (`vueDesSejours`), pour qu'il n'existe qu'un seul endroit où la décision D4
 * se prend.
 *
 * Le motif, le commentaire et les besoins vivent sur la **demande**, pas sur le
 * séjour : un séjour créé directement par Solenne n'en a pas.
 */

type Client =
  | PrismaClient
  | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/** Un séjour annulé n'occupe rien et ne se montre nulle part. */
const VIVANTS = ['CONFIRMED', 'COMPLETED'] as const

export interface FenetreDeLecture {
  readonly du?: Date
  readonly au?: Date
}

const SELECTION = {
  id: true,
  userId: true,
  startDate: true,
  endDate: true,
  adults: true,
  children: true,
  privacyLevel: true,
  isOwnerStay: true,
  user: { select: { firstName: true } },
  request: { select: { purpose: true, comment: true, specialNeeds: true } },
} as const

type LigneSejour = {
  id: string
  userId: string
  startDate: Date
  endDate: Date
  adults: number
  children: number
  privacyLevel: SejourPrive['niveau']
  isOwnerStay: boolean
  user: { firstName: string }
  request: {
    purpose: string | null
    comment: string | null
    specialNeeds: string | null
  } | null
}

function versSejourPrive(sejour: LigneSejour): SejourPrive {
  return {
    id: sejour.id,
    proprietaireId: sejour.userId,
    qui: sejour.user.firstName,
    du: sejour.startDate,
    au: sejour.endDate,
    adultes: sejour.adults,
    enfants: sejour.children,
    personnes: sejour.adults + sejour.children,
    motif: sejour.request?.purpose ?? null,
    commentaire: sejour.request?.comment ?? null,
    besoins: sejour.request?.specialNeeds ?? null,
    niveau: sejour.privacyLevel,
    estSejourDeSolenne: sejour.isOwnerStay,
  }
}

export async function chargerSejours(
  client: Client = db,
  fenetre: FenetreDeLecture = {},
): Promise<SejourPrive[]> {
  const sejours = await client.stay.findMany({
    where: {
      status: { in: [...VIVANTS] },
      ...(fenetre.du ? { endDate: { gt: fenetre.du } } : {}),
      ...(fenetre.au ? { startDate: { lt: fenetre.au } } : {}),
    },
    select: SELECTION,
    orderBy: { startDate: 'asc' },
  })

  return sejours.map(versSejourPrive)
}

/** Un séjour précis, sans filtre. L'autorisation se décide au-dessus. */
export async function chargerSejour(
  client: Client,
  id: string,
): Promise<SejourPrive | null> {
  const sejour = await client.stay.findUnique({
    where: { id },
    select: SELECTION,
  })
  return sejour ? versSejourPrive(sejour) : null
}

/**
 * PRIV-010 — le niveau que prendra le **prochain** séjour créé.
 *
 * Les séjours déjà en base gardent le leur : le réglage est une valeur de
 * départ, jamais une rétroaction. Sans réglage enregistré, D4 s'applique.
 *
 * Un séjour de Solenne ne suit pas le réglage du cercle : il part en « prénom
 * et nombre de personnes ». La règle vit dans le domaine (`niveauParDefaut`),
 * ici on ne fait que lui apporter la valeur enregistrée.
 *
 * `STAYDEC` (lot 3) appellera cette fonction au moment de transformer une
 * demande acceptée en séjour. Elle est ici, et non là-bas, pour que le défaut
 * n'ait qu'une seule définition.
 */
export async function visibiliteParDefaut(
  client: Client = db,
  options: { readonly sejourDeSolenne?: boolean } = {},
): Promise<NiveauVisibilite> {
  const reglages = await client.bookingSettings.findFirst({
    select: { defaultStayPrivacy: true },
  })
  return niveauParDefaut({
    estSejourDeSolenne: options.sejourDeSolenne ?? false,
    reglage: reglages?.defaultStayPrivacy ?? null,
  })
}
