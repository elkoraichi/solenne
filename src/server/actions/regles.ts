'use server'

import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { LONGUEURS, validerEntree, z } from '@/domain/core/validation'
import type { PrismaClient } from '@/generated/prisma/client'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { estAdministratrice, requireRole, requireUser } from '@/server/auth/garde'
import { db } from '@/server/db'

/**
 * Module `HOUSE` — les règles de la maison.
 *
 * Du contenu éditorial, à un détail près qui change tout : **une règle n'est
 * jamais réécrite en silence**. Chaque modification dépose une version
 * (HOUSE-R6), pour que le texte qu'un ami a accepté avant de venir reste
 * consultable tel qu'il l'a lu. La traçabilité de l'acceptation elle-même
 * appartient au parcours de séjour (`STAYREQ`, lot 3).
 */

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const schemaContenu = z.object({
  titre: z
    .string({ error: 'Le titre est obligatoire.' })
    .trim()
    .min(1, { error: 'Le titre est obligatoire.' })
    .max(LONGUEURS.courte, { error: 'Ce titre est trop long.' }),
  texte: z
    .string({ error: 'Le texte de la règle est obligatoire.' })
    .trim()
    .min(1, { error: 'Le texte de la règle est obligatoire.' })
    .max(LONGUEURS.longue, {
      error: `Ce texte dépasse ${LONGUEURS.longue} caractères.`,
    }),
  icone: z.string().trim().max(60).nullish(),
  acceptationObligatoire: z.boolean().optional(),
})

const schemaIdentifiant = z.object({
  id: z.string().trim().min(1).max(100),
})

export interface RegleDeLaMaison {
  readonly id: string
  readonly titre: string
  readonly texte: string
  readonly icone: string | null
  readonly acceptationObligatoire: boolean
  readonly ordre: number
  readonly active: boolean
  readonly version: number
}

export interface VersionDeRegle {
  readonly version: number
  readonly titre: string
  readonly texte: string
  readonly acceptationObligatoire: boolean
  readonly deposeeLe: Date
}

async function laMaison(client: PrismaClient | Transaction = db) {
  const maison = await client.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')
  return maison
}

/**
 * Les règles.
 *
 * Un ami ne reçoit que les règles actives — pas « toutes puis masquées » :
 * une règle désactivée n'est pas envoyée (règle non négociable n°4).
 */
export async function reglesDeLaMaison(): Promise<
  Resultat<readonly RegleDeLaMaison[]>
> {
  return executerAction('regles.lister', async () => {
    const utilisateur = await requireUser('regles.lister')
    const maison = await laMaison()

    const regles = await db.houseRule.findMany({
      where: {
        houseId: maison.id,
        ...(estAdministratrice(utilisateur) ? {} : { active: true }),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    return succes(
      regles.map((regle) => ({
        id: regle.id,
        titre: regle.title,
        texte: regle.body,
        icone: regle.icon,
        acceptationObligatoire: regle.requiresAcceptance,
        ordre: regle.order,
        active: regle.active,
        version: regle.version,
      })),
    )
  })
}

/** HOUSE-013 — création. La règle naît avec sa version 1. */
export async function creerRegle(
  entree: unknown,
): Promise<Resultat<{ id: string }>> {
  return executerAction('regles.creer', async () => {
    const solenne = await requireRole('ADMIN', 'regles.creer')

    const validation = validerEntree(schemaContenu, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    const maison = await laMaison()

    const dernier = await db.houseRule.findFirst({
      where: { houseId: maison.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const contenu = {
      title: donnees.titre,
      body: donnees.texte,
      requiresAcceptance: donnees.acceptationObligatoire ?? false,
    }

    const regle = await db.houseRule.create({
      data: {
        houseId: maison.id,
        ...contenu,
        icon: donnees.icone?.trim() ? donnees.icone.trim() : null,
        order: (dernier?.order ?? -1) + 1,
        version: 1,
        versions: { create: { version: 1, ...contenu } },
      },
    })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'regle.creation',
      entite: 'HouseRule',
      entiteId: regle.id,
      apres: contenu,
    })

    return succes({ id: regle.id })
  })
}

/**
 * HOUSE-R6 — modification.
 *
 * Une modification qui ne change rien ne dépose pas de version : l'historique
 * doit rester lisible, pas enregistrer chaque clic sur « Enregistrer ».
 */
export async function modifierRegle(entree: unknown): Promise<Resultat<null>> {
  return executerAction('regles.modifier', async () => {
    const solenne = await requireRole('ADMIN', 'regles.modifier')

    const validation = validerEntree(
      schemaIdentifiant.extend(schemaContenu.shape),
      entree,
    )
    if (!validation.ok) return validation
    const donnees = validation.data

    await db.$transaction(
      async (transaction) => {
        const maison = await laMaison(transaction)
        const avant = await transaction.houseRule.findFirst({
          where: { id: donnees.id, houseId: maison.id },
        })
        if (!avant) throw new ErreurMetier('NOT_FOUND')

        const contenu = {
          title: donnees.titre,
          body: donnees.texte,
          requiresAcceptance:
            donnees.acceptationObligatoire ?? avant.requiresAcceptance,
        }

        const inchange =
          contenu.title === avant.title &&
          contenu.body === avant.body &&
          contenu.requiresAcceptance === avant.requiresAcceptance

        const version = inchange ? avant.version : avant.version + 1

        await transaction.houseRule.update({
          where: { id: avant.id },
          data: {
            ...contenu,
            version,
            ...(donnees.icone === undefined
              ? {}
              : { icon: donnees.icone?.trim() ? donnees.icone.trim() : null }),
            ...(inchange
              ? {}
              : { versions: { create: { version, ...contenu } } }),
          },
        })

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'regle.modification',
            entite: 'HouseRule',
            entiteId: avant.id,
            avant: {
              title: avant.title,
              body: avant.body,
              requiresAcceptance: avant.requiresAcceptance,
            },
            apres: contenu,
            details: { version },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes()
  })
}

/** HOUSE-015 — activation ou mise en sommeil. Rien n'est jamais supprimé. */
export async function activerRegle(entree: unknown): Promise<Resultat<null>> {
  return executerAction('regles.activer', async () => {
    const solenne = await requireRole('ADMIN', 'regles.activer')

    const validation = validerEntree(
      schemaIdentifiant.extend({ active: z.boolean() }),
      entree,
    )
    if (!validation.ok) return validation
    const { id, active } = validation.data

    const maison = await laMaison()
    const regle = await db.houseRule.findFirst({
      where: { id, houseId: maison.id },
      select: { id: true, active: true },
    })
    if (!regle) throw new ErreurMetier('NOT_FOUND')

    await db.houseRule.update({ where: { id: regle.id }, data: { active } })

    await journaliserAudit({
      acteurId: solenne.id,
      action: active ? 'regle.activation' : 'regle.desactivation',
      entite: 'HouseRule',
      entiteId: regle.id,
      avant: { active: regle.active },
      apres: { active },
    })

    return succes()
  })
}

/**
 * HOUSE-014 — l'ordre d'affichage.
 *
 * La liste reçue doit être exactement les règles connues, permutées : un écran
 * qui travaillait sur un état périmé se voit refuser plutôt que d'imposer un
 * ordre partiel.
 */
export async function reordonnerRegles(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('regles.reordonner', async () => {
    const solenne = await requireRole('ADMIN', 'regles.reordonner')

    const validation = validerEntree(
      z.object({ ids: z.array(z.string().trim().min(1).max(100)).max(100) }),
      entree,
    )
    if (!validation.ok) return validation
    const { ids } = validation.data

    await db.$transaction(
      async (transaction) => {
        const maison = await laMaison(transaction)
        const connues = await transaction.houseRule.findMany({
          where: { houseId: maison.id },
          select: { id: true },
        })

        const permutation =
          ids.length === connues.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => connues.some((regle) => regle.id === id))
        if (!permutation) throw new ErreurMetier('CONFLICT')

        for (const [ordre, id] of ids.entries()) {
          await transaction.houseRule.update({
            where: { id },
            data: { order: ordre },
          })
        }

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'regle.ordre',
            entite: 'House',
            entiteId: maison.id,
            apres: { ids },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes()
  })
}

/**
 * HOUSE-018 — l'historique d'une règle, de la plus récente à la plus ancienne.
 *
 * Réservé à Solenne : c'est un outil de litige, pas une lecture courante.
 */
export async function versionsDeLaRegle(
  entree: unknown,
): Promise<Resultat<readonly VersionDeRegle[]>> {
  return executerAction('regles.versions', async () => {
    await requireRole('ADMIN', 'regles.versions')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation

    const maison = await laMaison()
    const regle = await db.houseRule.findFirst({
      where: { id: validation.data.id, houseId: maison.id },
      select: { id: true },
    })
    if (!regle) throw new ErreurMetier('NOT_FOUND')

    const versions = await db.houseRuleVersion.findMany({
      where: { ruleId: regle.id },
      orderBy: { version: 'desc' },
    })

    return succes(
      versions.map((version) => ({
        version: version.version,
        titre: version.title,
        texte: version.body,
        acceptationObligatoire: version.requiresAcceptance,
        deposeeLe: version.createdAt,
      })),
    )
  })
}
