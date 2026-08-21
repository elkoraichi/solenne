import type { Resultat } from '@/domain/core/result'
import { versEchec } from '@/server/errors'
import { estControleDeFluxNext } from '@/server/flux-next'

/**
 * Enveloppe commune à toutes les Server Actions.
 *
 * CORE-005 : aucune exception ne traverse la frontière serveur. Ce qui sort est
 * toujours un `Resultat` — sauf le contrôle de flux de Next, qui doit passer.
 */

export async function executerAction<T>(
  nom: string,
  traitement: () => Promise<Resultat<T>>,
  contexte?: { readonly utilisateurId?: string | null },
): Promise<Resultat<T>> {
  try {
    return await traitement()
  } catch (erreur) {
    if (estControleDeFluxNext(erreur)) throw erreur
    return versEchec(erreur, {
      action: nom,
      utilisateurId: contexte?.utilisateurId ?? null,
    })
  }
}
