import 'server-only'

import type { PrismaClient } from '@/generated/prisma/client'
import { db } from '@/server/db'

/**
 * Rejeu d'une transaction `Serializable` — extrait de `STAYDEC-A`
 * (`decisions-sejour.ts`) au moment où `STAY` en a eu besoin pour la création
 * directe d'un séjour par Solenne, qui dispute la même capacité que
 * l'acceptation d'une demande.
 *
 * Une course perdue, quelle que soit la forme que PostgreSQL lui donne :
 * anomalie de sérialisation (`40001`), interblocage (`40P01`), violation d'une
 * contrainte d'exclusion (`23P01`), violation d'unicité (`23505` / `P2002`),
 * ou l'enveloppe Prisma de tout cela (`P2034`). Toutes veulent dire la même
 * chose — « recommence en regardant à nouveau » — et aucune ne doit jamais
 * atteindre un écran.
 */

export type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/** Deux tentatives départagent une course à deux ; la troisième couvre un
 * troisième arrivant, rare. */
const TENTATIVES_MAX = 3

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

/**
 * Exécute `traitement` dans une transaction `Serializable`, et la rejoue
 * jusqu'à `TENTATIVES_MAX` fois si PostgreSQL signale une course. Le
 * `traitement` doit relire tout ce dont il dépend **dans** la transaction
 * reçue — jamais sur `db` — sans quoi la revalidation ne verrait rien.
 */
export async function avecRejeuSerialisable<T>(
  traitement: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  let derniereCourse: unknown = null

  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative += 1) {
    try {
      return await db.$transaction(traitement, { isolationLevel: 'Serializable' })
    } catch (erreur) {
      if (!estCourseDeTransaction(erreur)) throw erreur
      derniereCourse = erreur
    }
  }

  throw derniereCourse
}
