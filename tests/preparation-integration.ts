/**
 * Préparation des tests d'intégration.
 *
 * Les tests n'utilisent JAMAIS la base de développement : ils travaillent sur
 * `TEST_DATABASE_URL`, migrée à neuf avant la première suite (§7.4 : aucune
 * donnée réelle en environnement de test).
 */

import { chargerFichierEnv } from '../src/env/fichier'

chargerFichierEnv()

const urlTest = process.env.TEST_DATABASE_URL
if (!urlTest) {
  throw new Error(
    'Variable manquante : TEST_DATABASE_URL — les tests d’intégration refusent de toucher à la base de développement.',
  )
}

process.env.DATABASE_URL = urlTest
Object.assign(process.env, { NODE_ENV: 'test' })
