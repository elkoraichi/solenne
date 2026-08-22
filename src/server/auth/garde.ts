import 'server-only'

import { notFound, redirect } from 'next/navigation'

import { ErreurMetier } from '@/domain/core/result'
import type { Role } from '@/generated/prisma/enums'
import { journaliserRefus } from '@/server/audit'
import {
  sessionCourante,
  type UtilisateurConnecte,
} from '@/server/auth/session'

/**
 * Gardes de permission (PERM-R1, PERM-R2).
 *
 * **Refus par défaut.** Toute Server Action commence par l'une de ces fonctions,
 * avant la moindre lecture de données. L'interface ne protège rien : masquer un
 * bouton n'est pas une sécurité.
 *
 * Le rôle est relu **en base à chaque appel** : une rétrogradation prend effet
 * immédiatement, sans attendre l'expiration de la session (PERM-007).
 */

export type { UtilisateurConnecte }

/** Session en cours, ou `null`. Pour les rendus qui s'adaptent sans exiger. */
export async function utilisateurEventuel(): Promise<UtilisateurConnecte | null> {
  return sessionCourante()
}

/** Exige une session valide. Lève sinon. */
export async function requireUser(
  action = 'action-authentifiee',
): Promise<UtilisateurConnecte> {
  const utilisateur = await sessionCourante()
  if (!utilisateur) {
    await journaliserRefus({
      acteurId: null,
      action,
      raison: 'aucune session valide',
    })
    throw new ErreurMetier('UNAUTHENTICATED')
  }
  return utilisateur
}

/** Exige une session valide **et** le rôle demandé. Lève sinon. */
export async function requireRole(
  role: Role,
  action = 'action-administration',
): Promise<UtilisateurConnecte> {
  const utilisateur = await requireUser(action)

  if (utilisateur.role !== role) {
    await journaliserRefus({
      acteurId: utilisateur.id,
      action,
      raison: `rôle ${utilisateur.role} au lieu de ${role}`,
    })
    throw new ErreurMetier('FORBIDDEN')
  }
  return utilisateur
}

/**
 * PERM-R4 / PERM-008 : un refus ne révèle jamais l'existence de la ressource.
 *
 * Ressource absente et ressource interdite produisent **le même** refus. Sans
 * cela, comparer deux messages suffirait à cartographier ce qui existe.
 */
export function refusNeutre(): never {
  throw new ErreurMetier('NOT_FOUND')
}

/**
 * Renvoie la ressource si elle existe **et** que l'appelant y a droit ;
 * refuse de la même manière dans tous les autres cas.
 */
export function exigerAcces<T>(
  ressource: T | null | undefined,
  aLeDroit: (ressource: T) => boolean,
): T {
  if (!ressource || !aLeDroit(ressource)) refusNeutre()
  return ressource
}

/**
 * Garde d'une **page** d'administration (PERM-S08).
 *
 * `requireRole` est écrit pour les Server Actions : il lève un refus que
 * l'enveloppe transforme en `Resultat`. Dans une page, ce refus n'a personne
 * pour l'attraper — il devient une erreur 500, et une erreur 500 sur une URL
 * devinée en dit déjà trop : elle prouve qu'il se passe quelque chose ici.
 *
 * La coquille d'administration rend déjà « page introuvable », mais Next rend
 * la coquille et la page **en parallèle** : selon lequel des deux termine le
 * premier, la réponse était tantôt 404, tantôt 500. Cette fonction supprime la
 * course en donnant à la page la même issue qu'à sa coquille.
 *
 * L'entrée au journal d'audit, elle, est bien écrite : c'est `requireRole` qui
 * s'en charge, avant de lever.
 */
export async function requireAdminPage(
  action: string,
): Promise<UtilisateurConnecte> {
  try {
    return await requireRole('ADMIN', action)
  } catch (erreur) {
    if (erreur instanceof ErreurMetier && erreur.code === 'FORBIDDEN') {
      notFound()
    }
    if (erreur instanceof ErreurMetier && erreur.code === 'UNAUTHENTICATED') {
      redirect('/connexion')
    }
    throw erreur
  }
}

/** Vrai si l'appelant est Solenne. Pour ajuster un rendu, jamais pour protéger. */
export function estAdministratrice(
  utilisateur: UtilisateurConnecte | null,
): boolean {
  return utilisateur?.role === 'ADMIN'
}
