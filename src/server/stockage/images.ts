import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

import sharp from 'sharp'

import {
  COTE_AVATAR_PX,
  formatReconnu,
  TAILLE_MAX_MO,
  TAILLE_MAX_OCTETS,
} from '@/domain/core/images'
import { ErreurMetier } from '@/domain/core/result'

/**
 * Réception et stockage des images.
 *
 * Deux contrôles, dans cet ordre : la **taille** avant toute lecture complète,
 * puis le **contenu réel**. Un exécutable renommé `.jpg` ne passe pas : ni son
 * nom ni son type déclaré ne sont crus (PROFILE-007). Les seuils et la
 * reconnaissance de format sont dans `@/domain/core/images` — les écrans en ont
 * besoin sans pouvoir importer ce fichier, réservé au serveur.
 *
 * Stockage local pour l'instant, derrière une interface étroite. Le passage à
 * un stockage distant (lot 7, `DEPLOY`) ne touchera que ce fichier.
 */

const DOSSIER = '.televersements'

export interface ImageStockee {
  readonly chemin: string
  readonly url: string
  readonly octets: number
}

/**
 * Vérifie, redimensionne et range une image d'avatar.
 * Renvoie l'URL à enregistrer sur le profil.
 */
export async function stockerAvatar(fichier: File): Promise<ImageStockee> {
  if (fichier.size > TAILLE_MAX_OCTETS) {
    throw new ErreurMetier('FILE_TOO_LARGE', {
      parametres: { max: TAILLE_MAX_MO },
    })
  }
  if (fichier.size === 0) throw new ErreurMetier('FILE_NOT_IMAGE')

  const brut = new Uint8Array(await fichier.arrayBuffer())

  // Deuxième vérification de taille : `File.size` vient du client.
  if (brut.byteLength > TAILLE_MAX_OCTETS) {
    throw new ErreurMetier('FILE_TOO_LARGE', {
      parametres: { max: TAILLE_MAX_MO },
    })
  }
  if (!formatReconnu(brut)) throw new ErreurMetier('FILE_NOT_IMAGE')

  let normalisee: Buffer
  try {
    // Le ré-encodage vaut désinfection : ce qui sort de là est une image et
    // rien d'autre — ni script, ni métadonnée, ni charge cachée.
    normalisee = await sharp(brut)
      .rotate()
      .resize(COTE_AVATAR_PX, COTE_AVATAR_PX, {
        fit: 'cover',
        position: 'attention',
      })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    throw new ErreurMetier('FILE_NOT_IMAGE')
  }

  const nom = `${randomUUID()}.webp`
  await mkdir(DOSSIER, { recursive: true })
  await writeFile(join(DOSSIER, nom), normalisee)

  return {
    chemin: join(DOSSIER, nom),
    url: `/media/${nom}`,
    octets: normalisee.byteLength,
  }
}

/** Lit une image stockée. Refuse tout nom qui tenterait de sortir du dossier. */
export async function lireImage(nom: string): Promise<Buffer | null> {
  if (!/^[\w-]+\.webp$/.test(nom)) return null
  const chemin = normalize(join(DOSSIER, nom))
  if (!chemin.startsWith(DOSSIER)) return null

  try {
    return await readFile(chemin)
  } catch {
    return null
  }
}
