import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Jetons opaques — invitations, réinitialisations, changements d'email, sessions.
 *
 * Règle non négociable n°6 : **seule l'empreinte est stockée**. Une fuite de la
 * base ne donne aucun jeton utilisable. Le jeton en clair n'existe qu'entre sa
 * création et son envoi.
 */

/** 32 octets — 256 bits d'entropie (INVITE-S12). */
export const OCTETS_JETON = 32

export function creerJeton(): string {
  return randomBytes(OCTETS_JETON).toString('base64url')
}

export function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex')
}

/** Comparaison à durée constante de deux empreintes. */
export function empreintesEgales(a: string, b: string): boolean {
  const tamponA = Buffer.from(a, 'utf8')
  const tamponB = Buffer.from(b, 'utf8')
  if (tamponA.length !== tamponB.length) return false
  return timingSafeEqual(tamponA, tamponB)
}
