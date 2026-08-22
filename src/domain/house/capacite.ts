import { z } from '@/domain/core/validation'

/**
 * `HOUSE-R1` — la capacité d'accueil (décision D1).
 *
 * C'est la valeur la plus structurante du système : elle gouverne toutes les
 * acceptations de séjour. Ses bornes sont donc définies une fois, ici, et
 * appliquées partout — formulaire, Server Action, jeu de démonstration.
 */

export const CAPACITE_MIN = 1
export const CAPACITE_MAX = 25

/** Message imposé par HOUSE-005 et HOUSE-006, au mot près. */
export const MESSAGE_BORNES = `La capacité doit être comprise entre ${CAPACITE_MIN} et ${CAPACITE_MAX}.`
export const MESSAGE_ENTIER = 'La capacité doit être un nombre entier.'

/**
 * Un formulaire envoie du texte, une Server Action peut recevoir n'importe
 * quoi : les deux passent par ici. « 12,5 » et « douze » sont refusés au même
 * titre que 0 ou 26 (HOUSE-010).
 */
export const schemaCapacite = z.preprocess((valeur) => {
  if (typeof valeur !== 'string') return valeur
  const nettoyee = valeur.trim().replace(',', '.')
  return nettoyee === '' ? Number.NaN : Number(nettoyee)
}, z
  .number({ error: MESSAGE_ENTIER })
  .refine((valeur) => Number.isFinite(valeur), { error: MESSAGE_ENTIER })
  .refine((valeur) => Number.isInteger(valeur), { error: MESSAGE_ENTIER })
  .refine((valeur) => valeur >= CAPACITE_MIN && valeur <= CAPACITE_MAX, {
    error: MESSAGE_BORNES,
  }))
