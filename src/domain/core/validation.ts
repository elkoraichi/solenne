import { z, ZodError, type ZodType } from 'zod'

import { echec, succes, type Resultat } from './result'

// Messages Zod en français (D7 : pas de couche i18n, la langue est le français).
z.config(z.locales.fr())

export { z }

/** Longueurs maximales appliquées partout, pour éviter les entrées démesurées. */
export const LONGUEURS = {
  courte: 120,
  moyenne: 500,
  longue: 5_000,
} as const

/**
 * Transforme les défauts d'un schéma en messages par champ.
 * Un défaut portant sur l'objet entier est rangé sous la clé `_`.
 */
export function champsDepuisZod(
  erreur: ZodError,
): Readonly<Record<string, string>> {
  const champs: Record<string, string> = {}
  for (const probleme of erreur.issues) {
    const chemin = probleme.path.length > 0 ? probleme.path.join('.') : '_'
    // Le premier défaut d'un champ est le plus parlant : on ne l'écrase pas.
    if (!(chemin in champs)) champs[chemin] = probleme.message
  }
  return champs
}

/**
 * Valide une entrée serveur (règle non négociable n°9).
 * Renvoie un `Echec` de code `VALIDATION` plutôt que de lever : l'appelant
 * n'a jamais à intercepter.
 */
export function validerEntree<T>(
  schema: ZodType<T>,
  valeur: unknown,
): Resultat<T> {
  const resultat = schema.safeParse(valeur)
  if (resultat.success) return succes(resultat.data)
  return echec('VALIDATION', { champs: champsDepuisZod(resultat.error) })
}
