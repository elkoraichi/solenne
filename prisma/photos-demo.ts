import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  DOSSIER_TELEVERSEMENTS,
  normaliserPhoto,
} from '../src/server/stockage/normalisation'

/**
 * Photos réelles de la maison, fournies par Solenne.
 *
 * Les originaux vivent dans `Photos/` ; le jeu de démonstration les
 * redimensionne et les range dans `.televersements/` sous un nom **stable**,
 * pour que rejouer le jeu ne multiplie pas les fichiers.
 *
 * Une photo absente n'interrompt rien : la galerie se contente de ce qui est
 * là. Renommer un fichier ne doit pas casser l'installation d'un poste.
 */

const SOURCE = 'Photos'

export interface PhotoDemo {
  /** Nom du fichier dans `Photos/`. */
  readonly fichier: string
  /** Nom stable une fois rangée, sans extension. */
  readonly cible: string
}

/** Retourne l'URL `/media/…`, ou `null` si l'original est introuvable. */
export async function importerPhoto(photo: PhotoDemo): Promise<string | null> {
  let original: Buffer
  try {
    original = await readFile(join(SOURCE, photo.fichier))
  } catch {
    console.warn(`  ⚠ photo introuvable, ignorée : ${SOURCE}/${photo.fichier}`)
    return null
  }

  const nom = `${photo.cible}.webp`
  await mkdir(DOSSIER_TELEVERSEMENTS, { recursive: true })
  await writeFile(
    join(DOSSIER_TELEVERSEMENTS, nom),
    await normaliserPhoto(new Uint8Array(original)),
  )

  return `/media/${nom}`
}

export async function importerPhotos(
  photos: readonly PhotoDemo[],
): Promise<string[]> {
  const urls: string[] = []
  for (const photo of photos) {
    const url = await importerPhoto(photo)
    if (url) urls.push(url)
  }
  return urls
}

/**
 * Les chambres et les bureaux (`SPACE`).
 *
 * La clé reprend le nom de l'espace : le jeu de démonstration retrouve ainsi la
 * photo de chaque pièce sans table de correspondance séparée.
 */
export const PHOTOS_ESPACES: Readonly<Record<string, PhotoDemo>> = {
  'Chambre blanche': {
    fichier: 'MaisonSolenne_ChambreBlanche.jpg',
    cible: 'demo-chambre-blanche',
  },
  'Chambre jaune': {
    fichier: 'MaisonSolenne_ChambreJaune.jpg',
    cible: 'demo-chambre-jaune',
  },
  'Chambre verte': {
    fichier: 'MaisonSolenne_ChambreVerte.jpg',
    cible: 'demo-chambre-verte',
  },
  'Chambre mansardée': {
    fichier: 'MaisonSolenne_ChambreManz.jpg',
    cible: 'demo-chambre-mansardee',
  },
  'Bureau de Julien': {
    fichier: 'MaisonSolenne_BureauJulien.jpg',
    cible: 'demo-bureau-julien',
  },
  'Bureau de Solenne': {
    fichier: 'MaisonSolenne_BureauSolenne.jpg',
    cible: 'demo-bureau-solenne',
  },
}

/** La maison elle-même : l'accueil d'abord, puis les pièces de vie. */
export const PHOTOS_MAISON: readonly PhotoDemo[] = [
  { fichier: 'MaisonSolenne_Acceuil.jpg', cible: 'demo-accueil' },
  { fichier: 'MaisonSolenne_Pièce de vie.jpg', cible: 'demo-piece-de-vie' },
  { fichier: 'MaisonSolenne_Séjour.jpg', cible: 'demo-sejour' },
  { fichier: 'MaisonSolenne_Cuisine.jpg', cible: 'demo-cuisine' },
  { fichier: 'MaisonSolenne_Terasse.jpg', cible: 'demo-terrasse' },
  { fichier: 'MaisonSolenne_Terasse2.jpg', cible: 'demo-terrasse-2' },
  { fichier: 'MaisonSolenne_Terasse3.jpg', cible: 'demo-terrasse-3' },
  { fichier: 'MaisonSolenne_Terasse4.jpg', cible: 'demo-terrasse-4' },
  { fichier: 'MaisonSolenne_Piscine.jpg', cible: 'demo-piscine' },
] as const
