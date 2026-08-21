import { ErreurMetier } from './result'

/**
 * Politique de mot de passe — logique pure (PWD-R4).
 *
 * Volontairement courte : une longueur minimale généreuse et un refus des
 * mots de passe les plus prévisibles. Pas de « une majuscule, un chiffre et un
 * caractère spécial » : cette règle produit `Password1!` et rien de mieux.
 */

export const LONGUEUR_MINIMALE = 10
export const LONGUEUR_MAXIMALE = 200

/**
 * Les mots de passe qu'on retrouve en tête de toutes les fuites, plus ceux que
 * ce projet appelle. La liste est courte et assumée : elle attrape les essais
 * paresseux, pas une attaque par dictionnaire — c'est la limitation de débit
 * qui s'en charge.
 */
const TROP_COURANTS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'azerty',
  'azertyuiop',
  'qwerty',
  'qwertyuiop',
  'motdepasse',
  'motdepasse1',
  'password',
  'password1',
  'password123',
  'iloveyou',
  'admin',
  'administrateur',
  'bonjour',
  'soleil',
  'chocolat',
  'doudou',
  'loulou',
  'nicolas',
  'jetaime',
  'marseille',
  'liverpool',
  'solenne',
  'lamaison',
  'maisondesolenne',
  'chezsolenne',
  'lamaisondesolenne',
])

function normaliser(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function estTropCourant(motDePasse: string): boolean {
  const nu = normaliser(motDePasse)
  if (TROP_COURANTS.has(nu)) return true
  // « motdepasse2026 », « azerty123 » : un suffixe numérique ne sauve rien.
  const sansChiffresFinaux = nu.replace(/\d+$/, '')
  return sansChiffresFinaux.length > 0 && TROP_COURANTS.has(sansChiffresFinaux)
}

/** Lève une `ErreurMetier` si le mot de passe ne convient pas. */
export function verifierPolitique(motDePasse: string): void {
  if (motDePasse.length < LONGUEUR_MINIMALE) {
    throw new ErreurMetier('PASSWORD_TOO_SHORT')
  }
  if (motDePasse.length > LONGUEUR_MAXIMALE) {
    throw new ErreurMetier('VALIDATION', {
      champs: {
        motDePasse: `Le mot de passe ne peut pas dépasser ${LONGUEUR_MAXIMALE} caractères.`,
      },
    })
  }
  if (estTropCourant(motDePasse)) {
    throw new ErreurMetier('PASSWORD_TOO_COMMON')
  }
}

export function respectePolitique(motDePasse: string): boolean {
  try {
    verifierPolitique(motDePasse)
    return true
  } catch {
    return false
  }
}
