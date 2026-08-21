'use server'

import { schemaEmail } from '@/domain/core/email'
import { verifierPolitique } from '@/domain/core/mot-de-passe'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { LONGUEURS, validerEntree, z } from '@/domain/core/validation'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { empreinteMotDePasse } from '@/server/auth/empreinte'
import { requireRole } from '@/server/auth/garde'
import { creerJeton, empreinteJeton } from '@/server/auth/jetons'
import {
  creerEnregistrementSession,
  poserCookieSession,
} from '@/server/auth/session'
import { db } from '@/server/db'
import { enregistrerTentative, exigerCredit } from '@/server/limitation'
import { envoyerCourrier, lienAbsolu } from '@/server/notifications/courrier'

/**
 * Module `INVITE` — la seule porte d'entrée du cercle.
 *
 * Aucun compte ne naît autrement. Le rôle du futur compte est celui inscrit
 * dans l'invitation par Solenne : ce qui arrive du client à l'activation est
 * ignoré (INVITE-S07).
 */

const VALIDITE_JOURS = 14
const VALIDITE_MS = VALIDITE_JOURS * 24 * 60 * 60 * 1000

const schemaEmission = z.object({
  email: schemaEmail,
  // Un seul rôle est proposé au MVP (D5) ; l'énumération prépare la suite.
  role: z.enum(['FRIEND', 'ADMIN']).default('FRIEND'),
})

const schemaIdentifiant = z.object({
  id: z.string({ error: 'Invitation introuvable.' }).min(1).max(100),
})

const schemaActivation = z.object({
  jeton: z
    .string({ error: 'Ce lien est incomplet.' })
    .min(1, { error: 'Ce lien est incomplet.' })
    .max(500),
  motDePasse: z
    .string({ error: 'Le mot de passe est obligatoire.' })
    .min(1, { error: 'Le mot de passe est obligatoire.' }),
  prenom: z
    .string({ error: 'Le prénom est obligatoire.' })
    .trim()
    .min(1, { error: 'Le prénom est obligatoire.' })
    .max(LONGUEURS.courte, { error: 'Ce prénom est trop long.' }),
  nom: z.string().trim().max(LONGUEURS.courte).optional(),
  telephone: z.string().trim().max(30).optional(),
})

export interface InvitationEmise {
  readonly id: string
  readonly email: string
  /** Lien à transmettre à la main tant que l'envoi d'emails n'est pas prêt. */
  readonly lien: string
  readonly expireLe: Date
}

async function creerJetonInvitation(invitationId: string): Promise<string> {
  const jeton = creerJeton()
  await db.invitation.update({
    where: { id: invitationId },
    data: { tokenHash: empreinteJeton(jeton) },
  })
  return jeton
}

async function envoyerInvitation(email: string, jeton: string): Promise<string> {
  const lien = lienAbsolu(`/invitation/${jeton}`)
  await envoyerCourrier({
    destinataire: email,
    sujet: 'Solenne vous invite chez elle 🌿',
    texte: [
      'Bonjour,',
      '',
      'Solenne vous ouvre les portes de sa maison de campagne.',
      'Le lien ci-dessous vous permet de créer votre accès.',
      '',
      `Il est valable ${VALIDITE_JOURS} jours et ne fonctionne qu’une fois.`,
    ].join('\n'),
    lien,
  })
  return lien
}

/** Émission d'une invitation. Solenne seule (INV-R1). */
export async function emettreInvitation(
  entree: unknown,
): Promise<Resultat<InvitationEmise>> {
  return executerAction('invite.emettre', async () => {
    const solenne = await requireRole('ADMIN', 'invite.emettre')

    const validation = validerEntree(schemaEmission, entree)
    if (!validation.ok) return validation
    const { email, role } = validation.data

    const compte = await db.user.findUnique({
      where: { email },
      select: { status: true, anonymizedAt: true },
    })
    if (compte && compte.anonymizedAt === null) {
      // INVITE-008 / INVITE-016 : on oriente vers la bonne action plutôt que
      // de créer un doublon silencieux.
      throw new ErreurMetier(
        compte.status === 'DISABLED'
          ? 'ACCOUNT_DISABLED_REACTIVATE'
          : 'EMAIL_ALREADY_MEMBER',
      )
    }

    const enCours = await db.invitation.findFirst({
      where: {
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    })
    if (enCours) throw new ErreurMetier('INVITATION_PENDING')

    const expiration = new Date(Date.now() + VALIDITE_MS)
    // Le jeton naît avec la ligne : pas d'invitation en attente portant une
    // empreinte inutilisable si l'écriture suivante échouait (INVITE-013).
    const jeton = creerJeton()
    const invitation = await db.invitation.create({
      data: {
        email,
        tokenHash: empreinteJeton(jeton),
        role,
        invitedById: solenne.id,
        expiresAt: expiration,
      },
    })

    const lien = await envoyerInvitation(email, jeton)

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'invite.emission',
      entite: 'Invitation',
      entiteId: invitation.id,
      apres: { email, role, expireLe: expiration },
    })

    return succes({ id: invitation.id, email, lien, expireLe: expiration })
  })
}

/** Relance : un nouveau jeton, et l'ancien meurt (INV-R6). */
export async function relancerInvitation(
  entree: unknown,
): Promise<Resultat<InvitationEmise>> {
  return executerAction('invite.relancer', async () => {
    const solenne = await requireRole('ADMIN', 'invite.relancer')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation

    const invitation = await db.invitation.findUnique({
      where: { id: validation.data.id },
    })
    if (!invitation) throw new ErreurMetier('NOT_FOUND')
    if (invitation.acceptedAt) throw new ErreurMetier('INVITATION_USED')
    if (invitation.revokedAt) throw new ErreurMetier('INVALID_TOKEN')

    const expiration = new Date(Date.now() + VALIDITE_MS)
    await db.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: expiration },
    })

    const jeton = await creerJetonInvitation(invitation.id)
    const lien = await envoyerInvitation(invitation.email, jeton)

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'invite.relance',
      entite: 'Invitation',
      entiteId: invitation.id,
      apres: { expireLe: expiration },
    })

    return succes({
      id: invitation.id,
      email: invitation.email,
      lien,
      expireLe: expiration,
    })
  })
}

/** Révocation : l'invitation est morte définitivement (INV-R4). */
export async function revoquerInvitation(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('invite.revoquer', async () => {
    const solenne = await requireRole('ADMIN', 'invite.revoquer')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation

    const invitation = await db.invitation.findUnique({
      where: { id: validation.data.id },
    })
    if (!invitation) throw new ErreurMetier('NOT_FOUND')
    if (invitation.acceptedAt) throw new ErreurMetier('INVITATION_USED')

    await db.invitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'invite.revocation',
      entite: 'Invitation',
      entiteId: invitation.id,
      avant: { email: invitation.email },
    })

    return succes()
  })
}

export type EtatInvitation = 'EN_ATTENTE' | 'EXPIREE' | 'ACCEPTEE' | 'REVOQUEE'

export interface InvitationListee {
  readonly id: string
  readonly email: string
  readonly role: string
  readonly etat: EtatInvitation
  readonly expireLe: Date
  readonly accepteeLe: Date | null
  readonly emiseLe: Date
}

function etatDe(invitation: {
  acceptedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
}): EtatInvitation {
  if (invitation.acceptedAt) return 'ACCEPTEE'
  if (invitation.revokedAt) return 'REVOQUEE'
  if (invitation.expiresAt.getTime() <= Date.now()) return 'EXPIREE'
  return 'EN_ATTENTE'
}

/** Liste des invitations. Aucun jeton n'en sort, même haché. */
export async function listerInvitations(): Promise<
  Resultat<InvitationListee[]>
> {
  return executerAction('invite.lister', async () => {
    await requireRole('ADMIN', 'invite.lister')

    const invitations = await db.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    })

    return succes(
      invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        etat: etatDe(invitation),
        expireLe: invitation.expiresAt,
        accepteeLe: invitation.acceptedAt,
        emiseLe: invitation.createdAt,
      })),
    )
  })
}

export interface InvitationAPresenter {
  readonly email: string
  readonly expireLe: Date
}

/**
 * @public — ce que la page d'activation peut afficher.
 * Rien d'autre que l'adresse invitée : ni liste d'utilisateurs, ni autres
 * invitations (INVITE-S09).
 */
export async function consulterInvitation(
  entree: unknown,
): Promise<Resultat<InvitationAPresenter>> {
  return executerAction('invite.consulter', async () => {
    const validation = validerEntree(
      z.object({ jeton: z.string().min(1).max(500) }),
      entree,
    )
    if (!validation.ok) return validation

    const invitation = await db.invitation.findUnique({
      where: { tokenHash: empreinteJeton(validation.data.jeton) },
      select: {
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    })

    if (!invitation) throw new ErreurMetier('INVALID_TOKEN')
    if (invitation.acceptedAt) throw new ErreurMetier('INVITATION_USED')
    if (invitation.revokedAt) throw new ErreurMetier('INVALID_TOKEN')
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new ErreurMetier('INVITATION_EXPIRED')
    }

    return succes({ email: invitation.email, expireLe: invitation.expiresAt })
  })
}

/**
 * @public — activation d'une invitation : création du compte et ouverture de
 * la session, en une seule transaction (INV-R7).
 */
export async function activerInvitation(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('invite.activer', async () => {
    const validation = validerEntree(schemaActivation, entree)
    if (!validation.ok) return validation

    const { jeton, motDePasse, prenom, nom, telephone } = validation.data
    const empreinte = empreinteJeton(jeton)

    // INVITE-S12 : la devinette en rafale est bornée. La clé porte sur
    // l'empreinte, pas sur le jeton : rien de secret n'atterrit en base.
    await exigerCredit('activation', `jeton:${empreinte.slice(0, 16)}`)

    const invitation = await db.invitation.findUnique({ where: { tokenHash: empreinte } })

    if (!invitation) {
      await enregistrerTentative('activation', `jeton:${empreinte.slice(0, 16)}`)
      throw new ErreurMetier('INVALID_TOKEN')
    }
    if (invitation.acceptedAt) throw new ErreurMetier('INVITATION_USED')
    if (invitation.revokedAt) throw new ErreurMetier('INVALID_TOKEN')
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new ErreurMetier('INVITATION_EXPIRED')
    }

    verifierPolitique(motDePasse)
    const empreinteMdp = await empreinteMotDePasse(motDePasse)

    const { jetonSession, expiration } = await db.$transaction(
      async (transaction) => {
        // INVITE-C04 : la consommation est conditionnée à l'état non consommé.
        // Deux requêtes simultanées ne peuvent pas gagner toutes les deux.
        const consommee = await transaction.invitation.updateMany({
          where: { id: invitation.id, acceptedAt: null, revokedAt: null },
          data: { acceptedAt: new Date() },
        })
        if (consommee.count === 0) throw new ErreurMetier('INVITATION_USED')

        const compte = await transaction.user.create({
          data: {
            email: invitation.email,
            passwordHash: empreinteMdp,
            firstName: prenom,
            lastName: nom && nom.length > 0 ? nom : null,
            phone: telephone && telephone.length > 0 ? telephone : null,
            // INVITE-S07 : le rôle vient de l'invitation, jamais du client.
            role: invitation.role,
            status: 'ACTIVE',
          },
        })

        await journaliserAudit(
          {
            acteurId: compte.id,
            action: 'invite.activation',
            entite: 'Invitation',
            entiteId: invitation.id,
            apres: {
              utilisateurId: compte.id,
              email: invitation.email,
              role: invitation.role,
              inviteePar: invitation.invitedById,
            },
          },
          transaction,
        )

        const session = await creerEnregistrementSession(compte.id, transaction)
        return { jetonSession: session.jeton, expiration: session.expiration }
      },
      { isolationLevel: 'Serializable' },
    )

    await poserCookieSession(jetonSession, expiration)

    return succes()
  })
}
