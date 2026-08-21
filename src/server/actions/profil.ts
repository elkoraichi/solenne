'use server'

import { schemaEmail } from '@/domain/core/email'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { LONGUEURS, validerEntree, z } from '@/domain/core/validation'
import type { RelationType } from '@/generated/prisma/enums'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireUser } from '@/server/auth/garde'
import { creerJeton, empreinteJeton } from '@/server/auth/jetons'
import { db } from '@/server/db'
import { envoyerCourrier, lienAbsolu } from '@/server/notifications/courrier'
import { stockerAvatar } from '@/server/stockage/images'

/**
 * Module `PROFILE`.
 *
 * Deux champs n'y sont **jamais** modifiables, quoi qu'envoie le client :
 * le rôle (PROF-R3) et le type de relation, que Solenne seule renseigne
 * (PROF-R2). Ils ne figurent pas dans le schéma d'entrée : ce n'est pas un
 * filtre qu'on pourrait oublier, c'est une absence.
 */

const VALIDITE_CHANGEMENT_EMAIL_MS = 60 * 60 * 1000

const schemaProfil = z.object({
  prenom: z
    .string({ error: 'Le prénom est obligatoire.' })
    .trim()
    .min(1, { error: 'Le prénom est obligatoire.' })
    .max(LONGUEURS.courte, { error: 'Ce prénom est trop long.' }),
  nom: z.string().trim().max(LONGUEURS.courte).nullish(),
  telephone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v.length === 0 || /^[+()\d\s.-]{6,30}$/.test(v), {
      error: 'Numéro attendu, par exemple 06 12 34 56 78.',
    })
    .nullish(),
  nombreEnfants: z
    .number({ error: 'Indiquez un nombre.' })
    .int({ error: 'Indiquez un nombre entier.' })
    .min(0, { error: 'Ce nombre ne peut pas être négatif.' })
    .max(20, { error: 'Ce nombre paraît trop élevé.' })
    .optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
})

export interface MonProfil {
  readonly id: string
  readonly email: string
  readonly prenom: string
  readonly nom: string | null
  readonly telephone: string | null
  readonly avatarUrl: string | null
  readonly nombreEnfants: number
  readonly preferences: unknown
  readonly estAdministratrice: boolean
  readonly relation: RelationType | null
  readonly changementEmailEnAttente: string | null
}

/** Son propre profil, complet. */
export async function monProfil(): Promise<Resultat<MonProfil>> {
  return executerAction('profil.mien', async () => {
    const utilisateur = await requireUser('profil.mien')

    const compte = await db.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        childrenCount: true,
        preferences: true,
        role: true,
        relationType: true,
      },
    })

    const enAttente = await db.emailChangeRequest.findFirst({
      where: {
        userId: utilisateur.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { newEmail: true },
    })

    return succes({
      id: compte.id,
      email: compte.email,
      prenom: compte.firstName,
      nom: compte.lastName,
      telephone: compte.phone,
      avatarUrl: compte.avatarUrl,
      nombreEnfants: compte.childrenCount,
      preferences: compte.preferences,
      estAdministratrice: compte.role === 'ADMIN',
      relation: compte.relationType,
      changementEmailEnAttente: enAttente?.newEmail ?? null,
    })
  })
}

/** Modification de **son** profil (PROF-R1). L'identité vient de la session. */
export async function mettreAJourProfil(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('profil.mettreAJour', async () => {
    const utilisateur = await requireUser('profil.mettreAJour')

    const validation = validerEntree(schemaProfil, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    const avant = await db.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        childrenCount: true,
      },
    })

    await db.user.update({
      // PROF-R1 / PROFILE-S04 : l'identifiant ne vient jamais du client.
      where: { id: utilisateur.id },
      data: {
        firstName: donnees.prenom,
        lastName: donnees.nom?.trim() ? donnees.nom.trim() : null,
        phone: donnees.telephone?.trim() ? donnees.telephone.trim() : null,
        ...(donnees.nombreEnfants === undefined
          ? {}
          : { childrenCount: donnees.nombreEnfants }),
        ...(donnees.preferences === undefined
          ? {}
          : { preferences: donnees.preferences as never }),
      },
    })

    await journaliserAudit({
      acteurId: utilisateur.id,
      action: 'profil.modification',
      entite: 'User',
      entiteId: utilisateur.id,
      avant,
      apres: donnees,
    })

    return succes()
  })
}

/** Changement d'email : rien ne bouge avant confirmation (PROF-R4). */
export async function demanderChangementEmail(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('profil.demanderChangementEmail', async () => {
    const utilisateur = await requireUser('profil.demanderChangementEmail')

    const validation = validerEntree(
      z.object({ nouvelEmail: schemaEmail }),
      entree,
    )
    if (!validation.ok) return validation
    const { nouvelEmail } = validation.data

    if (nouvelEmail === utilisateur.email) {
      return succes()
    }

    const dejaPris = await db.user.findUnique({
      where: { email: nouvelEmail },
      select: { id: true },
    })
    if (dejaPris) throw new ErreurMetier('DUPLICATE_EMAIL')

    await db.emailChangeRequest.deleteMany({
      where: { userId: utilisateur.id, usedAt: null },
    })

    const jeton = creerJeton()
    await db.emailChangeRequest.create({
      data: {
        userId: utilisateur.id,
        newEmail: nouvelEmail,
        tokenHash: empreinteJeton(jeton),
        expiresAt: new Date(Date.now() + VALIDITE_CHANGEMENT_EMAIL_MS),
      },
    })

    await envoyerCourrier({
      destinataire: nouvelEmail,
      sujet: 'Confirmez votre nouvelle adresse',
      texte: [
        `Bonjour ${utilisateur.firstName},`,
        '',
        'Vous avez demandé à utiliser cette adresse pour la maison.',
        'Le lien ci-dessous confirme le changement ; il vaut une heure.',
        '',
        'Tant que vous ne l’avez pas suivi, votre ancienne adresse reste active.',
      ].join('\n'),
      lien: lienAbsolu(`/profil/email/${jeton}`),
    })

    return succes()
  })
}

/** @public — confirmation du changement d'email par lien. */
export async function confirmerChangementEmail(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('profil.confirmerChangementEmail', async () => {
    const validation = validerEntree(
      z.object({ jeton: z.string().min(1).max(500) }),
      entree,
    )
    if (!validation.ok) return validation

    const demande = await db.emailChangeRequest.findUnique({
      where: { tokenHash: empreinteJeton(validation.data.jeton) },
    })

    if (!demande || demande.usedAt) throw new ErreurMetier('INVALID_TOKEN')
    if (demande.expiresAt.getTime() <= Date.now()) {
      throw new ErreurMetier('RESET_LINK_EXPIRED')
    }

    const ancien = await db.user.findUniqueOrThrow({
      where: { id: demande.userId },
      select: { email: true },
    })

    await db.$transaction(async (transaction) => {
      const consommee = await transaction.emailChangeRequest.updateMany({
        where: { id: demande.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (consommee.count === 0) throw new ErreurMetier('INVALID_TOKEN')

      await transaction.user.update({
        where: { id: demande.userId },
        data: { email: demande.newEmail },
      })

      await journaliserAudit(
        {
          acteurId: demande.userId,
          action: 'profil.changementEmail',
          entite: 'User',
          entiteId: demande.userId,
          avant: { email: ancien.email },
          apres: { email: demande.newEmail },
        },
        transaction,
      )
    })

    return succes()
  })
}

/** Téléversement de la photo de profil (PROF-R5). */
export async function televerserPhoto(
  fichier: unknown,
): Promise<Resultat<{ avatarUrl: string }>> {
  return executerAction('profil.televerserPhoto', async () => {
    const utilisateur = await requireUser('profil.televerserPhoto')

    if (!(fichier instanceof File)) {
      throw new ErreurMetier('FILE_NOT_IMAGE')
    }

    const image = await stockerAvatar(fichier)

    await db.user.update({
      where: { id: utilisateur.id },
      data: { avatarUrl: image.url },
    })

    await journaliserAudit({
      acteurId: utilisateur.id,
      action: 'profil.photo',
      entite: 'User',
      entiteId: utilisateur.id,
      apres: { avatarUrl: image.url, octets: image.octets },
    })

    return succes({ avatarUrl: image.url })
  })
}

export interface ProfilPublic {
  readonly id: string
  readonly prenom: string
  readonly avatarUrl: string | null
}

export interface ProfilComplet extends ProfilPublic {
  readonly nom: string | null
  readonly email: string
  readonly telephone: string | null
  readonly relation: RelationType | null
  readonly nombreEnfants: number
  readonly notes: string | null
  readonly statut: string
  readonly derniereConnexion: Date | null
}

/**
 * Consultation d'un profil.
 *
 * PROFILE-010 : un ami ne reçoit que le prénom et la photo. Les autres champs
 * ne sont pas masqués à l'écran — ils **ne sont pas lus** (règle n°4).
 */
export async function voirProfil(
  entree: unknown,
): Promise<Resultat<ProfilPublic | ProfilComplet>> {
  return executerAction('profil.voir', async () => {
    const utilisateur = await requireUser('profil.voir')

    const validation = validerEntree(
      z.object({ id: z.string().min(1).max(100) }),
      entree,
    )
    if (!validation.ok) return validation
    const { id } = validation.data

    const complet = utilisateur.role === 'ADMIN' || utilisateur.id === id

    if (!complet) {
      const public_ = await db.user.findFirst({
        where: { id, status: 'ACTIVE', anonymizedAt: null },
        select: { id: true, firstName: true, avatarUrl: true },
      })
      if (!public_) throw new ErreurMetier('NOT_FOUND')
      return succes({
        id: public_.id,
        prenom: public_.firstName,
        avatarUrl: public_.avatarUrl,
      })
    }

    const compte = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        relationType: true,
        childrenCount: true,
        notes: true,
        status: true,
        lastLoginAt: true,
      },
    })
    if (!compte) throw new ErreurMetier('NOT_FOUND')

    return succes({
      id: compte.id,
      prenom: compte.firstName,
      nom: compte.lastName,
      email: compte.email,
      telephone: compte.phone,
      avatarUrl: compte.avatarUrl,
      relation: compte.relationType,
      nombreEnfants: compte.childrenCount,
      notes: compte.notes,
      statut: compte.status,
      derniereConnexion: compte.lastLoginAt,
    })
  })
}
