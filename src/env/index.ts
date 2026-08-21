import 'server-only'

import { parseEnv, type Env } from './schema'

/**
 * Variables d'environnement validées, disponibles côté serveur uniquement.
 * Toute lecture de `process.env` ailleurs dans le code est un défaut.
 */
export const env: Env = parseEnv(process.env)

export type { Env }
