/**
 * Règles d'acceptation d'une image — logique pure.
 *
 * Vit dans le domaine parce que les deux côtés en ont besoin : le serveur pour
 * refuser un fichier (PROFILE-006, PROFILE-007), l'écran pour annoncer la
 * limite à l'avance. Le stockage lui-même reste dans `src/server/stockage`.
 */

export const TAILLE_MAX_MO = 5
export const TAILLE_MAX_OCTETS = TAILLE_MAX_MO * 1024 * 1024
export const COTE_AVATAR_PX = 512

/** Signatures des formats acceptés. Le nom du fichier n'entre pas en compte. */
const SIGNATURES: ReadonlyArray<{
  readonly nom: string
  readonly reconnait: (octets: Uint8Array) => boolean
}> = [
  {
    nom: 'jpeg',
    reconnait: (o) => o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff,
  },
  {
    nom: 'png',
    reconnait: (o) =>
      o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47,
  },
  {
    nom: 'gif',
    reconnait: (o) => o[0] === 0x47 && o[1] === 0x49 && o[2] === 0x46,
  },
  {
    nom: 'webp',
    reconnait: (o) =>
      o[0] === 0x52 &&
      o[1] === 0x49 &&
      o[2] === 0x46 &&
      o[3] === 0x46 &&
      o[8] === 0x57 &&
      o[9] === 0x45 &&
      o[10] === 0x42 &&
      o[11] === 0x50,
  },
  {
    nom: 'avif/heic',
    reconnait: (o) =>
      o[4] === 0x66 && o[5] === 0x74 && o[6] === 0x79 && o[7] === 0x70,
  },
]

export function formatReconnu(octets: Uint8Array): string | null {
  if (octets.length < 12) return null
  return SIGNATURES.find((s) => s.reconnait(octets))?.nom ?? null
}
