import { EnvInvalideError, parseEnv } from './schema'

/**
 * Vérification exécutée au chargement de `next.config.ts`, donc avant que le
 * serveur n'écoute et avant que le build ne commence (SETUP-004).
 *
 * On n'importe pas `./index` ici : ce module tourne hors du runtime Next, où
 * `server-only` n'est pas résoluble.
 */
export function verifierEnvironnementAuDemarrage(): void {
  try {
    parseEnv(process.env)
  } catch (erreur) {
    if (erreur instanceof EnvInvalideError) {
      // Message lisible, sans pile d'appels : la personne qui déploie doit
      // comprendre en une lecture ce qu'il manque.
      console.error(`\n${erreur.message}\n`)
      process.exit(1)
    }
    throw erreur
  }
}
