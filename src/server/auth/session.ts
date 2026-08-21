import 'server-only'

import { cookies, headers } from 'next/headers'

import { env } from '@/env'
import type { Role } from '@/generated/prisma/enums'
import { creerJeton, empreinteJeton } from '@/server/auth/jetons'
import { db } from '@/server/db'
import { relancerSiControleDeFluxNext } from '@/server/flux-next'

/**
 * Sessions maîtrisées côté serveur.
 *
 * Le cookie ne porte qu'un jeton opaque ; l'autorité, c'est la ligne en base.
 * Supprimer la ligne coupe l'accès immédiatement — c'est ce qu'exigent
 * `AUTH-009`, `AUTH-010`, `PERM-006`, `PERM-S10`, `PWD-013` et `USERS-004`.
 *
 * Un jeton falsifié ne correspond à aucune empreinte : il est refusé sans
 * qu'aucune signature n'ait à être vérifiée (`AUTH-S11`).
 */

export const NOM_COOKIE_SESSION = 'solenne.session'

const JOURS = 24 * 60 * 60 * 1000
export const DUREE_SESSION_MS = 30 * JOURS
/** En deçà de ce reste, la session est prolongée à l'usage (AUTH-017). */
const SEUIL_RENOUVELLEMENT_MS = 15 * JOURS

export interface UtilisateurConnecte {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string | null
  readonly avatarUrl: string | null
  readonly role: Role
  readonly sessionId: string
}

function optionsCookie(expiration: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiration,
  }
}

async function contexteRequete() {
  try {
    const entetes = await headers()
    return {
      ip:
        entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        entetes.get('x-real-ip') ??
        null,
      userAgent: entetes.get('user-agent')?.slice(0, 300) ?? null,
    }
  } catch (erreur) {
    relancerSiControleDeFluxNext(erreur)
    // Hors requête (tâche de fond, test unitaire) : rien à consigner.
    return { ip: null, userAgent: null }
  }
}

/** Client Prisma ou client de transaction — la session peut naître dans les deux. */
type ClientOuTransaction = Pick<typeof db, 'session'>

/**
 * Crée l'enregistrement de session, sans toucher au cookie.
 * Utilisable à l'intérieur d'une transaction (INV-R7).
 */
export async function creerEnregistrementSession(
  utilisateurId: string,
  client: ClientOuTransaction = db,
): Promise<{ jeton: string; expiration: Date }> {
  const jeton = creerJeton()
  const expiration = new Date(Date.now() + DUREE_SESSION_MS)
  const { ip, userAgent } = await contexteRequete()

  await client.session.create({
    data: {
      sessionToken: empreinteJeton(jeton),
      userId: utilisateurId,
      expires: expiration,
      ip,
      userAgent,
    },
  })

  return { jeton, expiration }
}

/** Pose le cookie de session. À n'appeler que depuis une action ou une route. */
export async function poserCookieSession(
  jeton: string,
  expiration: Date,
): Promise<void> {
  const boiteCookies = await cookies()
  boiteCookies.set(NOM_COOKIE_SESSION, jeton, optionsCookie(expiration))
}

/** Ouvre une session et pose le cookie. À n'appeler que depuis une action. */
export async function ouvrirSession(utilisateurId: string): Promise<string> {
  const { jeton, expiration } = await creerEnregistrementSession(utilisateurId)
  await poserCookieSession(jeton, expiration)
  return jeton
}

/** Ferme la session courante — côté serveur d'abord, cookie ensuite. */
export async function fermerSessionCourante(): Promise<void> {
  const boiteCookies = await cookies()
  const jeton = boiteCookies.get(NOM_COOKIE_SESSION)?.value

  if (jeton) {
    await db.session.deleteMany({
      where: { sessionToken: empreinteJeton(jeton) },
    })
  }
  boiteCookies.delete(NOM_COOKIE_SESSION)
}

/** Révoque toutes les sessions d'un compte, sauf éventuellement l'une d'elles. */
export async function fermerLesSessions(
  utilisateurId: string,
  options?: { readonly sauf?: string },
): Promise<number> {
  const { count } = await db.session.deleteMany({
    where: {
      userId: utilisateurId,
      ...(options?.sauf ? { id: { not: options.sauf } } : {}),
    },
  })
  return count
}

/**
 * Résout la session en cours. Renvoie `null` dès qu'un doute existe : jeton
 * absent, inconnu, expiré, compte désactivé ou anonymisé.
 *
 * Cette fonction ne lève jamais : c'est l'appelant (`requireUser`) qui décide
 * quoi faire d'une absence de session.
 */
export async function sessionCourante(): Promise<UtilisateurConnecte | null> {
  let jeton: string | undefined
  try {
    jeton = (await cookies()).get(NOM_COOKIE_SESSION)?.value
  } catch (erreur) {
    // Une page qui lit la session est dynamique : laisser Next le savoir.
    relancerSiControleDeFluxNext(erreur)
    return null
  }
  if (!jeton) return null

  const enregistrement = await db.session.findUnique({
    where: { sessionToken: empreinteJeton(jeton) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          role: true,
          status: true,
          anonymizedAt: true,
        },
      },
    },
  })

  if (!enregistrement) return null

  const maintenant = Date.now()

  if (enregistrement.expires.getTime() <= maintenant) {
    await db.session.delete({ where: { id: enregistrement.id } }).catch(() => {})
    return null
  }

  const utilisateur = enregistrement.user

  // PERM-R3 : un compte désactivé est refusé même avec une session valide, et
  // ses sessions disparaissent dans la foulée.
  if (utilisateur.status !== 'ACTIVE' || utilisateur.anonymizedAt !== null) {
    await fermerLesSessions(utilisateur.id).catch(() => {})
    return null
  }

  await prolongerSiNecessaire(enregistrement.id, enregistrement.expires)

  return {
    id: utilisateur.id,
    email: utilisateur.email,
    firstName: utilisateur.firstName,
    lastName: utilisateur.lastName,
    avatarUrl: utilisateur.avatarUrl,
    role: utilisateur.role,
    sessionId: enregistrement.id,
  }
}

async function prolongerSiNecessaire(sessionId: string, expiration: Date) {
  const reste = expiration.getTime() - Date.now()
  const donnees: { lastUsedAt: Date; expires?: Date } = { lastUsedAt: new Date() }

  if (reste < SEUIL_RENOUVELLEMENT_MS) {
    donnees.expires = new Date(Date.now() + DUREE_SESSION_MS)
  }

  await db.session.update({ where: { id: sessionId }, data: donnees }).catch(() => {})

  if (donnees.expires) {
    // Le cookie suit la base quand c'est possible ; en rendu de page, Next
    // interdit d'y toucher — la base fait foi de toute façon.
    try {
      const boiteCookies = await cookies()
      const jeton = boiteCookies.get(NOM_COOKIE_SESSION)?.value
      if (jeton) {
        boiteCookies.set(NOM_COOKIE_SESSION, jeton, optionsCookie(donnees.expires))
      }
    } catch (erreur) {
      relancerSiControleDeFluxNext(erreur)
      /* rendu de page : sans effet */
    }
  }
}

/** Purge les sessions expirées. Appelée à la connexion, sans bloquer. */
export async function purgerSessionsExpirees(): Promise<void> {
  await db.session
    .deleteMany({ where: { expires: { lte: new Date() } } })
    .catch(() => {})
}
