'use server'

import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { LONGUEURS, validerEntree, z } from '@/domain/core/validation'
import type { RelationType, Role, UserStatus } from '@/generated/prisma/enums'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireRole } from '@/server/auth/garde'
import { fermerLesSessions } from '@/server/auth/session'
import { db } from '@/server/db'

/**
 * Module `USERS` — Solenne gère le cercle.
 *
 * Deux garde-fous qui ne se contournent pas : elle ne peut ni se désactiver,
 * ni se supprimer, ni se rétrograder (USR-R2, D5). Se verrouiller hors de son
 * propre système est le seul incident qu'on ne pourrait pas réparer depuis
 * l'application.
 */

const schemaIdentifiant = z.object({
  id: z.string({ error: 'Personne introuvable.' }).min(1).max(100),
})

const schemaFiltres = z.object({
  recherche: z.string().trim().max(LONGUEURS.courte).optional(),
  relation: z
    .enum(['CLOSE_FRIEND', 'FAMILY', 'ACQUAINTANCE', 'OTHER'])
    .optional(),
  statut: z.enum(['ACTIVE', 'DISABLED']).optional(),
})

export interface UtilisateurListe {
  readonly id: string
  readonly prenom: string
  readonly nom: string | null
  readonly email: string
  readonly avatarUrl: string | null
  readonly role: Role
  readonly relation: RelationType | null
  readonly statut: UserStatus
  readonly derniereConnexion: Date | null
  readonly anonymise: boolean
}

/** Liste des personnes du cercle, avec recherche et filtres. */
export async function listerUtilisateurs(
  entree: unknown = {},
): Promise<Resultat<UtilisateurListe[]>> {
  return executerAction('users.lister', async () => {
    await requireRole('ADMIN', 'users.lister')

    const validation = validerEntree(schemaFiltres, entree)
    if (!validation.ok) return validation
    const { recherche, relation, statut } = validation.data

    const comptes = await db.user.findMany({
      where: {
        ...(relation ? { relationType: relation } : {}),
        ...(statut ? { status: statut } : {}),
        ...(recherche
          ? {
              OR: [
                { firstName: { contains: recherche, mode: 'insensitive' } },
                { lastName: { contains: recherche, mode: 'insensitive' } },
                { email: { contains: recherche, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        role: true,
        relationType: true,
        status: true,
        lastLoginAt: true,
        anonymizedAt: true,
      },
    })

    return succes(
      comptes.map((compte) => ({
        id: compte.id,
        prenom: compte.firstName,
        nom: compte.lastName,
        email: compte.email,
        avatarUrl: compte.avatarUrl,
        role: compte.role,
        relation: compte.relationType,
        statut: compte.status,
        derniereConnexion: compte.lastLoginAt,
        anonymise: compte.anonymizedAt !== null,
      })),
    )
  })
}

/** Type de relation — Solenne seule le renseigne (PROF-R2). */
export async function modifierRelation(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('users.modifierRelation', async () => {
    const solenne = await requireRole('ADMIN', 'users.modifierRelation')

    const validation = validerEntree(
      schemaIdentifiant.extend({
        relation: z.enum(['CLOSE_FRIEND', 'FAMILY', 'ACQUAINTANCE', 'OTHER']),
      }),
      entree,
    )
    if (!validation.ok) return validation
    const { id, relation } = validation.data

    const avant = await db.user.findUnique({
      where: { id },
      select: { relationType: true },
    })
    if (!avant) throw new ErreurMetier('NOT_FOUND')

    await db.user.update({ where: { id }, data: { relationType: relation } })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'users.modificationRelation',
      entite: 'User',
      entiteId: id,
      avant: { relation: avant.relationType },
      apres: { relation },
    })

    return succes()
  })
}

export interface SejourAVenir {
  readonly id: string
  readonly debut: Date
  readonly fin: Date
  readonly personnes: number
}

/** Séjours confirmés à venir d'une personne — matière à l'arbitrage USERS-006. */
export async function sejoursAVenirDe(
  entree: unknown,
): Promise<Resultat<SejourAVenir[]>> {
  return executerAction('users.sejoursAVenir', async () => {
    await requireRole('ADMIN', 'users.sejoursAVenir')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation

    return succes(await lireSejoursAVenir(validation.data.id))
  })
}

async function lireSejoursAVenir(utilisateurId: string) {
  const aujourdHui = new Date()
  aujourdHui.setUTCHours(0, 0, 0, 0)

  const sejours = await db.stay.findMany({
    where: {
      userId: utilisateurId,
      status: 'CONFIRMED',
      // Convention [arrivée, départ[ : un séjour est à venir tant que son
      // dernier jour occupé n'est pas passé.
      endDate: { gt: aujourdHui },
    },
    orderBy: { startDate: 'asc' },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      adults: true,
      children: true,
    },
  })

  return sejours.map((sejour) => ({
    id: sejour.id,
    debut: sejour.startDate,
    fin: sejour.endDate,
    personnes: sejour.adults + sejour.children,
  }))
}

/**
 * Désactivation. Les sessions tombent dans la seconde (USR-R3).
 *
 * Si des séjours sont prévus, l'action s'arrête et demande confirmation :
 * désactiver quelqu'un attendu dans dix jours mérite une seconde lecture.
 */
export async function desactiverUtilisateur(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('users.desactiver', async () => {
    const solenne = await requireRole('ADMIN', 'users.desactiver')

    const validation = validerEntree(
      schemaIdentifiant.extend({ confirme: z.boolean().optional() }),
      entree,
    )
    if (!validation.ok) return validation
    const { id, confirme } = validation.data

    // USR-R2 : Solenne ne se met pas dehors elle-même.
    if (id === solenne.id) throw new ErreurMetier('SELF_DEACTIVATION')

    const compte = await db.user.findUnique({
      where: { id },
      select: { status: true, email: true, firstName: true },
    })
    if (!compte) throw new ErreurMetier('NOT_FOUND')

    const sejours = await lireSejoursAVenir(id)
    if (sejours.length > 0 && !confirme) {
      throw new ErreurMetier('UPCOMING_STAYS', {
        parametres: { n: sejours.length },
      })
    }

    await db.user.update({ where: { id }, data: { status: 'DISABLED' } })
    const sessionsFermees = await fermerLesSessions(id)

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'users.desactivation',
      entite: 'User',
      entiteId: id,
      avant: { statut: compte.status },
      apres: { statut: 'DISABLED' },
      details: { sessionsFermees, sejoursAVenir: sejours.length },
    })

    return succes()
  })
}

export async function reactiverUtilisateur(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('users.reactiver', async () => {
    const solenne = await requireRole('ADMIN', 'users.reactiver')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation
    const { id } = validation.data

    const compte = await db.user.findUnique({
      where: { id },
      select: { status: true, anonymizedAt: true },
    })
    if (!compte) throw new ErreurMetier('NOT_FOUND')
    // Un compte effacé ne revient pas : il n'y a plus personne derrière.
    if (compte.anonymizedAt) throw new ErreurMetier('NOT_FOUND')

    await db.user.update({ where: { id }, data: { status: 'ACTIVE' } })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'users.reactivation',
      entite: 'User',
      entiteId: id,
      avant: { statut: compte.status },
      apres: { statut: 'ACTIVE' },
    })

    return succes()
  })
}

/** Changement de rôle. Architecture prête, un seul ADMIN au MVP (D5). */
export async function changerRole(entree: unknown): Promise<Resultat<null>> {
  return executerAction('users.changerRole', async () => {
    const solenne = await requireRole('ADMIN', 'users.changerRole')

    const validation = validerEntree(
      schemaIdentifiant.extend({ role: z.enum(['ADMIN', 'FRIEND']) }),
      entree,
    )
    if (!validation.ok) return validation
    const { id, role } = validation.data

    const compte = await db.user.findUnique({
      where: { id },
      select: { role: true },
    })
    if (!compte) throw new ErreurMetier('NOT_FOUND')
    if (compte.role === role) return succes()

    // USERS-009 : il doit rester au moins une administratrice, et Solenne ne
    // peut pas se rétrograder elle-même.
    if (compte.role === 'ADMIN' && role !== 'ADMIN') {
      const administratrices = await db.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE', anonymizedAt: null },
      })
      if (administratrices <= 1 || id === solenne.id) {
        throw new ErreurMetier('LAST_ADMIN')
      }
    }

    await db.user.update({ where: { id }, data: { role } })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'users.changementRole',
      entite: 'User',
      entiteId: id,
      avant: { role: compte.role },
      apres: { role },
    })

    return succes()
  })
}

/**
 * Suppression RGPD (USR-R5).
 *
 * Sans historique, le compte disparaît. Avec, il est **anonymisé** : les
 * données personnelles s'effacent, les séjours et les traces restent, sous
 * le nom « Ancien invité ». Casser l'historique de la maison pour honorer un
 * effacement serait faire deux torts au lieu d'un.
 */
export interface ModeDeSuppression {
  readonly mode: 'SUPPRIME' | 'ANONYMISE'
}

export async function supprimerUtilisateur(
  entree: unknown,
): Promise<Resultat<ModeDeSuppression>> {
  return executerAction<ModeDeSuppression>('users.supprimer', async () => {
    const solenne = await requireRole('ADMIN', 'users.supprimer')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation
    const { id } = validation.data

    if (id === solenne.id) throw new ErreurMetier('SELF_DELETION')

    const compte = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, role: true },
    })
    if (!compte) throw new ErreurMetier('NOT_FOUND')

    if (compte.role === 'ADMIN') {
      const administratrices = await db.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE', anonymizedAt: null },
      })
      if (administratrices <= 1) throw new ErreurMetier('LAST_ADMIN')
    }

    const historique =
      (await db.stay.count({ where: { userId: id } })) +
      (await db.stayRequest.count({ where: { requesterId: id } })) +
      (await db.eventParticipant.count({ where: { userId: id } })) +
      (await db.comment.count({ where: { authorId: id } })) +
      (await db.event.count({ where: { createdById: id } })) +
      (await db.blockedPeriod.count({ where: { createdById: id } }))

    await fermerLesSessions(id)

    if (historique === 0) {
      await db.user.delete({ where: { id } })
      await journaliserAudit({
        acteurId: solenne.id,
        action: 'users.suppression',
        entite: 'User',
        entiteId: id,
        avant: { email: compte.email, prenom: compte.firstName },
        details: { mode: 'SUPPRIME' },
      })
      return succes({ mode: 'SUPPRIME' as const })
    }

    await db.$transaction(async (transaction) => {
      await transaction.passwordResetToken.deleteMany({ where: { userId: id } })
      await transaction.emailChangeRequest.deleteMany({ where: { userId: id } })
      await transaction.invitation.deleteMany({
        where: { email: compte.email, acceptedAt: null },
      })

      await transaction.user.update({
        where: { id },
        data: {
          email: `supprime-${id}@anonyme.invalid`,
          firstName: 'Ancien invité',
          lastName: null,
          phone: null,
          avatarUrl: null,
          notes: null,
          passwordHash: null,
          relationType: null,
          preferences: {},
          status: 'DISABLED',
          anonymizedAt: new Date(),
        },
      })

      await journaliserAudit(
        {
          acteurId: solenne.id,
          action: 'users.suppression',
          entite: 'User',
          entiteId: id,
          avant: { email: compte.email, prenom: compte.firstName },
          details: { mode: 'ANONYMISE', elementsConserves: historique },
        },
        transaction,
      )
    })

    return succes({ mode: 'ANONYMISE' as const })
  })
}

export interface EntreeAuditListee {
  readonly id: string
  readonly acteurId: string | null
  readonly action: string
  readonly entite: string | null
  readonly entiteId: string | null
  readonly differentiel: unknown
  readonly ip: string | null
  readonly quand: Date
}

/** Consultation du journal d'audit. Solenne seule (PERM-013). */
export async function consulterJournalAudit(
  entree: unknown = {},
): Promise<Resultat<EntreeAuditListee[]>> {
  return executerAction('users.journalAudit', async () => {
    await requireRole('ADMIN', 'users.journalAudit')

    const validation = validerEntree(
      z.object({
        action: z.string().trim().max(100).optional(),
        limite: z.number().int().min(1).max(500).default(100),
      }),
      entree,
    )
    if (!validation.ok) return validation

    const entrees = await db.auditLog.findMany({
      where: validation.data.action
        ? { action: { startsWith: validation.data.action } }
        : {},
      orderBy: { createdAt: 'desc' },
      take: validation.data.limite,
    })

    return succes(
      entrees.map((ligne) => ({
        id: ligne.id,
        acteurId: ligne.actorId,
        action: ligne.action,
        entite: ligne.entityType,
        entiteId: ligne.entityId,
        differentiel: ligne.diff,
        ip: ligne.ip,
        quand: ligne.createdAt,
      })),
    )
  })
}
