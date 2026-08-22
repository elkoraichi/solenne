/**
 * Chargement du fichier `.env`, quand il y en a un.
 *
 * Prisma 7 et Node ne lisent plus `.env` d'eux-mêmes : chaque point d'entrée
 * hors Next le charge explicitement. Mais `process.loadEnvFile` **lève** quand
 * le fichier n'existe pas — et il n'existe pas sur l'intégration continue, où
 * les variables viennent de l'environnement du poste. Un fichier absent n'est
 * pas une erreur : c'est le cas normal en dehors d'un poste de travail.
 *
 * Ce qui manque vraiment est signalé plus tard, et nommément, par `parseEnv`
 * (SETUP-004).
 */
export function chargerFichierEnv(chemin = '.env'): void {
  try {
    process.loadEnvFile?.(chemin)
  } catch {
    // Pas de `.env` : les variables sont déjà dans l'environnement, ou elles
    // manquent — auquel cas le contrat des variables le dira.
  }
}
