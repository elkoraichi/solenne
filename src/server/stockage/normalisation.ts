import sharp from 'sharp'

/**
 * Pipeline de normalisation des images, sans dépendance à Next.
 *
 * Ce fichier est volontairement dépourvu de `server-only` et d'alias `@/` :
 * le jeu de démonstration (`prisma/seed.ts`) l'exécute sous `tsx`, hors de
 * tout rendu React. Le stockage applicatif, lui, passe par
 * `src/server/stockage/images.ts`, qui s'appuie dessus.
 *
 * Le ré-encodage vaut désinfection : ce qui sort d'ici est une image et rien
 * d'autre — ni script, ni métadonnée, ni charge cachée.
 */

/** Hors de `public/` : ces photos sont réservées au cercle, pas au web. */
export const DOSSIER_TELEVERSEMENTS = '.televersements'

/** Assez large pour un écran d'ordinateur, assez léger pour un téléphone. */
export const LARGEUR_PHOTO_PX = 1600

/** Photo de maison ou d'espace : largeur bornée, proportions conservées. */
export async function normaliserPhoto(brut: Uint8Array): Promise<Buffer> {
  return sharp(brut)
    .rotate()
    .resize({ width: LARGEUR_PHOTO_PX, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}

/** Vignette carrée, recadrée sur le sujet. Utilisée par les avatars. */
export async function normaliserCarre(
  brut: Uint8Array,
  cote: number,
): Promise<Buffer> {
  return sharp(brut)
    .rotate()
    .resize(cote, cote, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toBuffer()
}
