import 'server-only'

import type { SejourExistant } from '@/domain/availability/disponibilite'
import type { PrismaClient } from '@/generated/prisma/client'
import { chargerBlocages } from '@/server/blocages'
import { db } from '@/server/db'
import { toutesLesPresences } from '@/server/occupation'

/**
 * Assemble le contexte que `verifierDisponibilite` (`AVAIL`) attend, à partir
 * de la base. Écrit une fois pour que `STAYREQ` et `STAYDEC` (lot 3) ne
 * reconstruisent pas chacun leur version — même principe que
 * `src/server/occupation.ts` et `src/server/blocages.ts`, dont ce fichier se
 * contente de combiner les résultats.
 *
 * Ne compte jamais : `personnes` n'apparaît nulle part ici (règle non
 * négociable n°3). Seuls `AVAIL`/`OCCUP` additionnent.
 */

type Client =
  | PrismaClient
  | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/** Les séjours **confirmés** — leur exclusivité, jamais leur effectif (G1 d'`AVAIL`). */
export async function sejoursExistants(
  client: Client = db,
  options: { readonly aPartirDe?: Date } = {},
): Promise<SejourExistant[]> {
  const sejours = await client.stay.findMany({
    where: {
      status: 'CONFIRMED',
      ...(options.aPartirDe ? { endDate: { gt: options.aPartirDe } } : {}),
    },
    select: { id: true, startDate: true, endDate: true, exclusive: true },
  })

  return sejours.map((sejour) => ({
    reference: sejour.id,
    arrivee: sejour.startDate,
    depart: sejour.endDate,
    exclusif: sejour.exclusive,
  }))
}

export interface ContexteDisponibiliteBase {
  readonly capacite: number
  readonly presences: Awaited<ReturnType<typeof toutesLesPresences>>
  readonly sejours: SejourExistant[]
  readonly blocages: Awaited<ReturnType<typeof chargerBlocages>>
}

/**
 * Le contexte complet — hors `conflitsPolitique`, propre à chaque appelant
 * (R8, voir `src/domain/stays/demande.ts`).
 */
export async function contexteDisponibilite(
  client: Client,
  capacite: number,
  options: { readonly aPartirDe?: Date } = {},
): Promise<ContexteDisponibiliteBase> {
  const [presences, sejours, blocages] = await Promise.all([
    toutesLesPresences(client, options),
    sejoursExistants(client, options),
    chargerBlocages(client, options),
  ])

  return { capacite, presences, sejours, blocages }
}
