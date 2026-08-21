/**
 * Erreurs de contrôle de flux de Next.
 *
 * Next signale par des exceptions des situations qui ne sont pas des pannes :
 * redirection, page absente, et surtout **bascule en rendu dynamique** quand un
 * écran lit les cookies pendant la construction. Toutes portent un `digest`.
 *
 * Les avaler transforme une bascule en fausse erreur : c'est ce qui faisait
 * échouer la construction de `/agenda`, rendu comme une page statique alors
 * qu'il dépend de la session. Tout `digest` est donc relancé tel quel.
 */
export function estControleDeFluxNext(erreur: unknown): boolean {
  return typeof (erreur as { digest?: unknown } | null)?.digest === 'string'
}

/** Relance l'erreur si elle appartient à Next ; sinon ne fait rien. */
export function relancerSiControleDeFluxNext(erreur: unknown): void {
  if (estControleDeFluxNext(erreur)) throw erreur
}
