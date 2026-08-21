'use server'

import { schemaEmail } from '@/domain/core/email'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { validerEntree, z } from '@/domain/core/validation'
import { executerAction } from '@/server/actions/executer'
import { adresseIp, journaliserAudit } from '@/server/audit'
import {
  consommerTempsDeVerification,
  motDePasseCorrespond,
} from '@/server/auth/empreinte'
import { requireUser } from '@/server/auth/garde'
import {
  fermerSessionCourante,
  ouvrirSession,
  purgerSessionsExpirees,
  sessionCourante,
} from '@/server/auth/session'
import { db } from '@/server/db'
import {
  enregistrerTentative,
  exigerCredit,
  oublierTentatives,
} from '@/server/limitation'

/**
 * Module `AUTH` — connexion et déconnexion.
 *
 * Aucune route d'inscription n'existe : le seul chemin vers un compte passe par
 * une invitation de Solenne (AUTH-R1). Ce fichier n'expose donc que deux
 * actions, et rien qui crée un utilisateur.
 */

const schemaConnexion = z.object({
  email: schemaEmail,
  motDePasse: z
    .string({ error: 'Le mot de passe est obligatoire.' })
    .min(1, { error: 'Le mot de passe est obligatoire.' })
    .max(200, { error: 'Ce mot de passe est trop long.' }),
})

/**
 * @public — porte d'entrée de l'application.
 * Aucune garde de session, par nature ; protégée par validation stricte,
 * limitation de débit et réponse indiscernable (AUTH-R3).
 */
export async function seConnecter(entree: unknown): Promise<Resultat<null>> {
  return executerAction('auth.seConnecter', async () => {
    const validation = validerEntree(schemaConnexion, entree)
    if (!validation.ok) return validation

    const { email, motDePasse } = validation.data
    const ip = await adresseIp()

    // Blocage éventuel vérifié avant tout accès aux comptes.
    await exigerCredit('connexion', email)
    if (ip) await exigerCredit('connexionIp', ip)

    const utilisateur = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        anonymizedAt: true,
      },
    })

    const compteUtilisable =
      utilisateur !== null &&
      utilisateur.passwordHash !== null &&
      utilisateur.status === 'ACTIVE' &&
      utilisateur.anonymizedAt === null

    // AUTH-004 : même temps de calcul, que le compte existe ou non.
    const correspond = compteUtilisable
      ? await motDePasseCorrespond(
          utilisateur.passwordHash as string,
          motDePasse,
        )
      : await consommerTempsDeVerification(motDePasse).then(() => false)

    if (!correspond || !utilisateur) {
      await enregistrerTentative('connexion', email)
      if (ip) await enregistrerTentative('connexionIp', ip)
      // AUTH-R3 / AUTH-005 : email inconnu, mot de passe faux et compte
      // désactivé produisent strictement le même refus.
      throw new ErreurMetier('INVALID_CREDENTIALS')
    }

    await oublierTentatives('connexion', email)
    await ouvrirSession(utilisateur.id)
    await db.user.update({
      where: { id: utilisateur.id },
      data: { lastLoginAt: new Date() },
    })

    await journaliserAudit({
      acteurId: utilisateur.id,
      action: 'auth.connexion',
      entite: 'User',
      entiteId: utilisateur.id,
    })

    await purgerSessionsExpirees()

    return succes()
  })
}

/** Déconnexion : la session meurt côté serveur, pas seulement le cookie. */
export async function seDeconnecter(): Promise<Resultat<null>> {
  return executerAction('auth.seDeconnecter', async () => {
    const utilisateur = await requireUser('auth.seDeconnecter')

    await fermerSessionCourante()
    await journaliserAudit({
      acteurId: utilisateur.id,
      action: 'auth.deconnexion',
      entite: 'User',
      entiteId: utilisateur.id,
    })

    return succes()
  })
}

export interface IdentitePublique {
  readonly id: string
  readonly email: string
  readonly prenom: string
  readonly nom: string | null
  readonly avatarUrl: string | null
  readonly estAdministratrice: boolean
}

/**
 * @public — renvoie l'identité de la personne connectée, ou `null`.
 * Aucun champ sensible n'en sort : ni empreinte, ni statut interne (AUTH-015).
 */
export async function identiteCourante(): Promise<
  Resultat<IdentitePublique | null>
> {
  return executerAction('auth.identiteCourante', async () => {
    const utilisateur = await sessionCourante()
    if (!utilisateur) return succes(null)

    return succes({
      id: utilisateur.id,
      email: utilisateur.email,
      prenom: utilisateur.firstName,
      nom: utilisateur.lastName,
      avatarUrl: utilisateur.avatarUrl,
      estAdministratrice: utilisateur.role === 'ADMIN',
    })
  })
}
