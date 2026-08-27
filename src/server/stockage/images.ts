import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

import { getStore, type Store } from '@netlify/blobs'

import {
  COTE_AVATAR_PX,
  formatReconnu,
  TAILLE_MAX_MO,
  TAILLE_MAX_OCTETS,
} from '@/domain/core/images'
import { ErreurMetier } from '@/domain/core/result'
import {
  DOSSIER_TELEVERSEMENTS as DOSSIER,
  normaliserCarre,
  normaliserPhoto,
} from '@/server/stockage/normalisation'

/**
 * Réception et stockage des images.
 *
 * Deux contrôles, dans cet ordre : la **taille** avant toute lecture complète,
 * puis le **contenu réel**. Un exécutable renommé `.jpg` ne passe pas : ni son
 * nom ni son type déclaré ne sont crus (PROFILE-007). Les seuils et la
 * reconnaissance de format sont dans `@/domain/core/images` — les écrans en ont
 * besoin sans pouvoir importer ce fichier, réservé au serveur.
 *
 * Stockage Netlify Blobs quand le contexte est disponible (production, et
 * `netlify dev`) ; repli sur disque local sinon (développement courant,
 * tests) — c'est `getStore` qui lève si le contexte est absent, jamais une
 * variable d'environnement lue ici.
 */

export interface ImageStockee {
  readonly url: string
  readonly octets: number
}

const NOM_MAGASIN = 'televersements'

/**
 * Un nouveau magasin à chaque appel, jamais mis en cache au niveau du module :
 * en production, `getStore` s'appuie sur un contexte propre à l'exécution en
 * cours, qu'un magasin réutilisé d'une invocation à l'autre ne porte pas
 * forcément correctement (constaté par d'autres utilisateurs de la
 * bibliothèque, cf. rapport de la session du 27/08).
 */
function magasinDistant(): Store | null {
  try {
    return getStore(NOM_MAGASIN)
  } catch {
    return null
  }
}

/** Contrôles communs à tous les téléversements. Renvoie les octets vérifiés. */
async function octetsVerifies(fichier: File): Promise<Uint8Array> {
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

  return brut
}

async function ranger(normalisee: Buffer): Promise<ImageStockee> {
  const nom = `${randomUUID()}.webp`
  const store = magasinDistant()

  if (store) {
    const tampon = new ArrayBuffer(normalisee.byteLength)
    new Uint8Array(tampon).set(normalisee)
    await store.set(nom, tampon)
  } else {
    await mkdir(DOSSIER, { recursive: true })
    await writeFile(join(DOSSIER, nom), normalisee)
  }

  return { url: `/media/${nom}`, octets: normalisee.byteLength }
}

/**
 * Vérifie, redimensionne et range une image d'avatar.
 * Renvoie l'URL à enregistrer sur le profil.
 */
export async function stockerAvatar(fichier: File): Promise<ImageStockee> {
  const brut = await octetsVerifies(fichier)

  let normalisee: Buffer
  try {
    normalisee = await normaliserCarre(brut, COTE_AVATAR_PX)
  } catch {
    throw new ErreurMetier('FILE_NOT_IMAGE')
  }

  return ranger(normalisee)
}

/**
 * Vérifie, redimensionne et range une photo de la maison ou d'un espace
 * (HOUSE-011). Contrairement à l'avatar, les proportions sont conservées :
 * une terrasse en paysage ne devient pas un carré.
 */
export async function stockerPhoto(fichier: File): Promise<ImageStockee> {
  const brut = await octetsVerifies(fichier)

  let normalisee: Buffer
  try {
    normalisee = await normaliserPhoto(brut)
  } catch {
    throw new ErreurMetier('FILE_NOT_IMAGE')
  }

  return ranger(normalisee)
}

/** Nom de fichier sûr extrait d'une URL `/media/…`, ou `null`. */
function nomDepuisUrl(url: string): string | null {
  const nom = url.startsWith('/media/') ? url.slice('/media/'.length) : url
  return /^[\w-]+\.webp$/.test(nom) ? nom : null
}

/** Lit une image stockée. Refuse tout nom qui tenterait de sortir du dossier. */
export async function lireImage(nom: string): Promise<Buffer | null> {
  const nomSur = nomDepuisUrl(nom)
  if (!nomSur) return null

  const store = magasinDistant()
  if (store) {
    const brut = await store.get(nomSur, { type: 'arrayBuffer' })
    return brut ? Buffer.from(brut) : null
  }

  const chemin = normalize(join(DOSSIER, nomSur))
  if (!chemin.startsWith(DOSSIER)) return null

  try {
    return await readFile(chemin)
  } catch {
    return null
  }
}

/**
 * Efface l'image d'une photo retirée de la galerie.
 *
 * Au mieux : la base fait foi. Une image orpheline encombre le stockage, une
 * suppression qui échoue ne doit pas faire échouer l'action de Solenne.
 */
export async function supprimerImage(url: string): Promise<void> {
  const nom = nomDepuisUrl(url)
  if (!nom) return

  const store = magasinDistant()
  if (store) {
    await store.delete(nom).catch(() => undefined)
    return
  }

  const chemin = normalize(join(DOSSIER, nom))
  if (!chemin.startsWith(DOSSIER)) return

  await rm(chemin, { force: true }).catch(() => undefined)
}
