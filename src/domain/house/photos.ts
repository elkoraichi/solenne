import { ErreurMetier } from '@/domain/core/result'

/**
 * Module `HOUSE` — la galerie de la maison, en logique pure.
 *
 * Une galerie n'est qu'une liste ordonnée d'adresses et une photo mise en
 * avant. Tout ce qui touche au fichier lui-même — vérification, redimension,
 * écriture — vit dans `src/server/stockage`. Ici, rien que l'ordre.
 */

/** Au-delà, la page devient un catalogue et le téléphone rame. */
export const MAX_PHOTOS = 30

/**
 * La photo réellement mise en avant.
 *
 * Une couverture qui ne fait plus partie de la galerie — photo retirée
 * entre-temps — ne laisse pas la page sans image : on retombe sur la première.
 */
export function couvertureEffective(
  photos: readonly string[],
  couverture: string | null | undefined,
): string | null {
  if (couverture && photos.includes(couverture)) return couverture
  return photos[0] ?? null
}

/**
 * Ajoute une photo à la fin. Un doublon ne crée rien.
 *
 * La borne est un paramètre : une galerie de maison et celle d'une chambre ne
 * tiennent pas le même nombre de photos, mais la mécanique est la même.
 */
export function ajouterPhoto(
  photos: readonly string[],
  url: string,
  max: number = MAX_PHOTOS,
): readonly string[] {
  if (photos.includes(url)) return photos
  if (photos.length >= max) {
    throw new ErreurMetier('TOO_MANY_PHOTOS', {
      parametres: { max },
    })
  }
  return [...photos, url]
}

export function retirerPhoto(
  photos: readonly string[],
  url: string,
): readonly string[] {
  if (!photos.includes(url)) throw new ErreurMetier('NOT_FOUND')
  return photos.filter((photo) => photo !== url)
}

/**
 * Applique un nouvel ordre.
 *
 * L'ordre reçu doit être exactement la galerie connue, permutée. Sinon, c'est
 * que l'écran travaillait sur un état périmé : on refuse plutôt que d'écrire
 * une liste tronquée, et le message invite à recharger (`CONFLICT`).
 */
export function reordonnerPhotos(
  photos: readonly string[],
  ordre: readonly string[],
): readonly string[] {
  const permutation =
    ordre.length === photos.length &&
    new Set(ordre).size === ordre.length &&
    ordre.every((url) => photos.includes(url))

  if (!permutation) throw new ErreurMetier('CONFLICT')
  return [...ordre]
}
