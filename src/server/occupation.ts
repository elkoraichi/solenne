import 'server-only'

import type { Presence } from '@/domain/occupancy/registre'
import type { PrismaClient } from '@/generated/prisma/client'
import { db } from '@/server/db'

/**
 * Alimentation du registre `OCCUP` depuis la base.
 *
 * Une fonction par contributeur, et rien d'autre : ce fichier **traduit** des
 * lignes en présences, il n'additionne jamais. La somme est faite dans
 * `src/domain/occupancy/registre.ts`, seul endroit qui compte (règle n°3).
 */

/**
 * Effectif d'un séjour = adultes + enfants.
 *
 * `stay_guests` nomme ces mêmes personnes une à une — un prénom par lit. Les
 * ajouter à `adults + children` compterait chaque enfant deux fois. Le §6.4 dit
 * « adultes + enfants + invités » : « invités » y désigne ces compteurs, pas
 * une troisième catégorie. À confirmer dans `OCCUP` au lot 3.
 */
function effectif(sejour: { adults: number; children: number }): number {
  return sejour.adults + sejour.children
}

type Client = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/** Contributeur ① — les séjours confirmés. */
export async function presencesDesSejoursConfirmes(
  client: Client = db,
  options: { readonly aPartirDe?: Date } = {},
): Promise<Presence[]> {
  const sejours = await client.stay.findMany({
    where: {
      status: 'CONFIRMED',
      ...(options.aPartirDe ? { endDate: { gt: options.aPartirDe } } : {}),
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      adults: true,
      children: true,
    },
  })

  return sejours.map((sejour) => ({
    contributeur: 'SEJOUR_CONFIRME' as const,
    reference: sejour.id,
    arrivee: sejour.startDate,
    depart: sejour.endDate,
    personnes: effectif(sejour),
  }))
}

/**
 * Toutes les présences, tous contributeurs confondus.
 *
 * Les contributeurs dormants n'ont pas de source à interroger : ils
 * n'apparaissent pas ici, et le registre les ignorerait de toute façon.
 * `SLEEP` (lot 4) ajoutera sa fonction à cette liste.
 */
export async function toutesLesPresences(
  client: Client = db,
  options: { readonly aPartirDe?: Date } = {},
): Promise<Presence[]> {
  return presencesDesSejoursConfirmes(client, options)
}
