import { hash, verify } from '@node-rs/argon2'

/**
 * Empreintes de mot de passe — Argon2id (AUTH-R2, §7.4).
 *
 * Paramètres : 19 Mio de mémoire, 2 passes, parallélisme 1. C'est la
 * recommandation OWASP la plus récente pour Argon2id ; elle coûte ~50 ms sur
 * la machine cible, ce qui reste imperceptible à la connexion et cher à
 * l'attaquant.
 */
const PARAMETRES = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function empreinteMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse, PARAMETRES)
}

export async function motDePasseCorrespond(
  empreinte: string,
  motDePasse: string,
): Promise<boolean> {
  try {
    return await verify(empreinte, motDePasse, PARAMETRES)
  } catch {
    // Empreinte illisible ou tronquée : on refuse, on ne remonte rien.
    return false
  }
}

/**
 * Empreinte factice, servant à consommer le même temps de calcul lorsqu'aucun
 * compte ne correspond. Sans elle, la durée de réponse trahit l'existence d'un
 * compte (AUTH-004).
 */
let empreinteLeurre: Promise<string> | null = null

export function empreinteDeLeurre(): Promise<string> {
  empreinteLeurre ??= empreinteMotDePasse(
    'leurre-sans-usage-pour-egaliser-les-temps',
  )
  return empreinteLeurre
}

/** Consomme le même temps qu'une vérification réelle, sans rien révéler. */
export async function consommerTempsDeVerification(
  motDePasse: string,
): Promise<void> {
  await motDePasseCorrespond(await empreinteDeLeurre(), motDePasse)
}
