import { z } from './validation'

/**
 * Normalisation des adresses email.
 *
 * ` Marc@Exemple.FR ` et `marc@exemple.fr` désignent la même personne
 * (AUTH-006). La forme normalisée est la seule qui entre en base et la seule
 * sur laquelle on compare.
 */
export function normaliserEmail(valeur: string): string {
  return valeur.trim().toLowerCase()
}

export const schemaEmail = z
  .string({ error: 'L’adresse email est obligatoire.' })
  .trim()
  .min(1, { error: 'L’adresse email est obligatoire.' })
  .max(254, { error: 'Cette adresse email est trop longue.' })
  .email({ error: 'Cette adresse email n’est pas valide.' })
  .transform(normaliserEmail)
