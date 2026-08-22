'use server'

import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { LONGUEURS, validerEntree, z } from '@/domain/core/validation'
import {
  MAX_PHOTOS_ESPACE,
  schemaEspace,
  type TypeEspace,
} from '@/domain/house/espaces'
import { ajouterPhoto, reordonnerPhotos, retirerPhoto } from '@/domain/house/photos'
import type { PrismaClient, Space } from '@/generated/prisma/client'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { estAdministratrice, requireRole, requireUser } from '@/server/auth/garde'
import { db } from '@/server/db'
import { stockerPhoto, supprimerImage } from '@/server/stockage/images'

/**
 * Module `SPACE` — les chambres et les bureaux.
 *
 * Rien ici ne décide d'un séjour : `SPACE-R5` borne le module à la description
 * des pièces. La table d'affectation existe en base, mais aucune action ne
 * l'écrit — l'affectation des chambres est post-MVP, et le rester est une
 * décision, pas un oubli.
 *
 * `SPACE-R3` n'apparaît pas non plus : le repère entre couchages et capacité
 * est un calcul pur (`domain/house/espaces`), affiché par la console. Aucune
 * écriture n'est jamais refusée pour cette raison.
 */

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const schemaIdentifiant = z.object({
  id: z.string().trim().min(1).max(100),
})

const schemaUrlPhoto = schemaIdentifiant.extend({
  url: z.string().trim().min(1).max(LONGUEURS.moyenne),
})

export interface EspaceDeLaMaison {
  readonly id: string
  readonly type: TypeEspace
  readonly nom: string
  readonly description: string | null
  readonly couchages: number
  readonly typeDeLit: string | null
  readonly equipements: readonly string[]
  readonly photos: readonly string[]
  readonly ordre: number
  readonly active: boolean
}

async function laMaison(client: PrismaClient | Transaction = db) {
  const maison = await client.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')
  return maison
}

function vue(espace: Space): EspaceDeLaMaison {
  return {
    id: espace.id,
    type: espace.type,
    nom: espace.name,
    description: espace.description,
    couchages: espace.sleeps,
    typeDeLit: espace.bedType,
    equipements: espace.amenities,
    photos: espace.photos,
    ordre: espace.order,
    active: espace.active,
  }
}

/**
 * Les espaces.
 *
 * Un espace en sommeil n'est pas envoyé aux amis puis masqué : il n'est pas
 * envoyé (règle non négociable n°4). Solenne, elle, les voit tous — sans quoi
 * elle ne pourrait pas les rouvrir.
 */
export async function espacesDeLaMaison(): Promise<
  Resultat<readonly EspaceDeLaMaison[]>
> {
  return executerAction('espaces.lister', async () => {
    const utilisateur = await requireUser('espaces.lister')
    const maison = await laMaison()

    const espaces = await db.space.findMany({
      where: {
        houseId: maison.id,
        ...(estAdministratrice(utilisateur) ? {} : { active: true }),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    return succes(espaces.map(vue))
  })
}

/** SPACE-001 / SPACE-002 — création d'une chambre ou d'un bureau. */
export async function creerEspace(
  entree: unknown,
): Promise<Resultat<{ id: string }>> {
  return executerAction('espaces.creer', async () => {
    const solenne = await requireRole('ADMIN', 'espaces.creer')

    const validation = validerEntree(schemaEspace, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    const maison = await laMaison()

    const dernier = await db.space.findFirst({
      where: { houseId: maison.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const contenu = {
      type: donnees.type,
      name: donnees.nom,
      description: donnees.description?.trim() ? donnees.description.trim() : null,
      sleeps: donnees.couchages,
      bedType: donnees.typeDeLit?.trim() ? donnees.typeDeLit.trim() : null,
      amenities: donnees.equipements ?? [],
    }

    const espace = await db.space.create({
      data: {
        houseId: maison.id,
        ...contenu,
        order: (dernier?.order ?? -1) + 1,
      },
    })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'espace.creation',
      entite: 'Space',
      entiteId: espace.id,
      apres: contenu,
    })

    return succes({ id: espace.id })
  })
}

/** SPACE-007 — modification, équipements compris, dans l'ordre reçu. */
export async function modifierEspace(entree: unknown): Promise<Resultat<null>> {
  return executerAction('espaces.modifier', async () => {
    const solenne = await requireRole('ADMIN', 'espaces.modifier')

    const validation = validerEntree(
      z.intersection(schemaIdentifiant, schemaEspace),
      entree,
    )
    if (!validation.ok) return validation
    const donnees = validation.data

    const maison = await laMaison()
    const avant = await db.space.findFirst({
      where: { id: donnees.id, houseId: maison.id },
    })
    if (!avant) throw new ErreurMetier('NOT_FOUND')

    const contenu = {
      type: donnees.type,
      name: donnees.nom,
      description: donnees.description?.trim() ? donnees.description.trim() : null,
      sleeps: donnees.couchages,
      bedType: donnees.typeDeLit?.trim() ? donnees.typeDeLit.trim() : null,
      amenities: donnees.equipements ?? [],
    }

    await db.space.update({ where: { id: avant.id }, data: contenu })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'espace.modification',
      entite: 'Space',
      entiteId: avant.id,
      avant: {
        type: avant.type,
        name: avant.name,
        description: avant.description,
        sleeps: avant.sleeps,
        bedType: avant.bedType,
        amenities: avant.amenities,
      },
      apres: contenu,
    })

    return succes()
  })
}

/** SPACE-009 / R4 — mise en sommeil. L'espace reste en base et dans l'historique. */
export async function activerEspace(entree: unknown): Promise<Resultat<null>> {
  return executerAction('espaces.activer', async () => {
    const solenne = await requireRole('ADMIN', 'espaces.activer')

    const validation = validerEntree(
      schemaIdentifiant.extend({ active: z.boolean() }),
      entree,
    )
    if (!validation.ok) return validation
    const { id, active } = validation.data

    const maison = await laMaison()
    const espace = await db.space.findFirst({
      where: { id, houseId: maison.id },
      select: { id: true, active: true },
    })
    if (!espace) throw new ErreurMetier('NOT_FOUND')

    await db.space.update({ where: { id: espace.id }, data: { active } })

    await journaliserAudit({
      acteurId: solenne.id,
      action: active ? 'espace.activation' : 'espace.desactivation',
      entite: 'Space',
      entiteId: espace.id,
      avant: { active: espace.active },
      apres: { active },
    })

    return succes()
  })
}

/** SPACE-010 — l'ordre d'affichage, tel que Solenne l'a arrangé. */
export async function reordonnerEspaces(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('espaces.reordonner', async () => {
    const solenne = await requireRole('ADMIN', 'espaces.reordonner')

    const validation = validerEntree(
      z.object({ ids: z.array(z.string().trim().min(1).max(100)).max(100) }),
      entree,
    )
    if (!validation.ok) return validation
    const { ids } = validation.data

    await db.$transaction(
      async (transaction) => {
        const maison = await laMaison(transaction)
        const connus = await transaction.space.findMany({
          where: { houseId: maison.id },
          select: { id: true },
        })

        // L'écran qui travaillait sur un état périmé se voit refuser plutôt
        // que d'imposer un ordre partiel.
        const permutation =
          ids.length === connus.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => connus.some((espace) => espace.id === id))
        if (!permutation) throw new ErreurMetier('CONFLICT')

        for (const [ordre, id] of ids.entries()) {
          await transaction.space.update({ where: { id }, data: { order: ordre } })
        }

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'espace.ordre',
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
 * Écriture d'une galerie d'espace recalculée.
 *
 * Même précaution que pour la maison : lecture et écriture dans la même
 * transaction sérialisable, pour que deux téléversements simultanés ne
 * s'écrasent pas (C6).
 */
async function modifierGalerie(
  acteurId: string,
  espaceId: string,
  action: string,
  calculer: (photos: readonly string[]) => readonly string[],
): Promise<void> {
  const trace = await db.$transaction(
    async (transaction) => {
      const maison = await laMaison(transaction)
      const avant = await transaction.space.findFirst({
        where: { id: espaceId, houseId: maison.id },
        select: { id: true, photos: true },
      })
      if (!avant) throw new ErreurMetier('NOT_FOUND')

      const apres = calculer(avant.photos)

      await transaction.space.update({
        where: { id: avant.id },
        data: { photos: [...apres] },
      })

      await journaliserAudit(
        {
          acteurId,
          action,
          entite: 'Space',
          entiteId: avant.id,
          avant: { photos: avant.photos },
          apres: { photos: apres },
        },
        transaction,
      )

      return { avant: avant.photos, apres }
    },
    { isolationLevel: 'Serializable' },
  )

  // Les fichiers ne partent qu'une fois la base d'accord.
  for (const url of trace.avant) {
    if (!trace.apres.includes(url)) await supprimerImage(url)
  }
}

/** SPACE-008 — une photo de plus dans la galerie d'un espace. */
export async function televerserPhotoEspace(
  entree: unknown,
  fichier: unknown,
): Promise<Resultat<{ url: string }>> {
  return executerAction('espaces.televerserPhoto', async () => {
    const solenne = await requireRole('ADMIN', 'espaces.televerserPhoto')

    const validation = validerEntree(schemaIdentifiant, entree)
    if (!validation.ok) return validation

    if (!(fichier instanceof File)) throw new ErreurMetier('FILE_NOT_IMAGE')

    const image = await stockerPhoto(fichier)

    try {
      await modifierGalerie(
        solenne.id,
        validation.data.id,
        'espace.photoAjoutee',
        (photos) => ajouterPhoto(photos, image.url, MAX_PHOTOS_ESPACE),
      )
    } catch (erreur) {
      // Galerie pleine, espace introuvable ou écriture concurrente : le fichier
      // déjà rangé n'a plus de raison d'être.
      await supprimerImage(image.url)
      throw erreur
    }

    return succes({ url: image.url })
  })
}

/** SPACE-008 — retrait d'une photo, fichier compris. */
export async function retirerPhotoEspace(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('espaces.retirerPhoto', async () => {
    const solenne = await requireRole('ADMIN', 'espaces.retirerPhoto')

    const validation = validerEntree(schemaUrlPhoto, entree)
    if (!validation.ok) return validation
    const { id, url } = validation.data

    await modifierGalerie(solenne.id, id, 'espace.photoRetiree', (photos) =>
      retirerPhoto(photos, url),
    )

    return succes()
  })
}

/** SPACE-008 — l'ordre des photos d'un espace. */
export async function reordonnerPhotosEspace(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('espaces.reordonnerPhotos', async () => {
    const solenne = await requireRole('ADMIN', 'espaces.reordonnerPhotos')

    const validation = validerEntree(
      schemaIdentifiant.extend({
        urls: z
          .array(z.string().trim().min(1).max(LONGUEURS.moyenne))
          .max(MAX_PHOTOS_ESPACE),
      }),
      entree,
    )
    if (!validation.ok) return validation
    const { id, urls } = validation.data

    await modifierGalerie(solenne.id, id, 'espace.ordrePhotos', (photos) =>
      reordonnerPhotos(photos, urls),
    )

    return succes()
  })
}
