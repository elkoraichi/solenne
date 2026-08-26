import 'server-only'

import { debutDeJour } from '@/domain/core/dates'
import { db } from '@/server/db'

/**
 * STAY-R5 / STAY-008 — le passage automatique en `COMPLETED`.
 *
 * Ce n'est délibérément **pas** une Server Action : rien n'a de session à
 * présenter un jour donné à minuit. `DEPLOY` branchera cette fonction sur une
 * tâche planifiée (Netlify Scheduled Functions), derrière une route protégée
 * par un secret partagé — pas par `requireUser`/`requireRole`, qui supposent
 * tous deux un utilisateur.
 *
 * Idempotente : ne touche que les séjours encore `CONFIRMED` dont le départ
 * est atteint ou dépassé (`sejourEstPasse`, `src/domain/stays/sejour.ts`) —
 * la relancer deux fois le même jour ne fait rien la seconde fois.
 */
export async function cloturerSejoursTerminees(maintenant: Date = new Date()): Promise<number> {
  const resultat = await db.stay.updateMany({
    where: { status: 'CONFIRMED', endDate: { lte: debutDeJour(maintenant) } },
    data: { status: 'COMPLETED' },
  })
  return resultat.count
}
