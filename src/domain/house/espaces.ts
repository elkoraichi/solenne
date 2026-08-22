import { LONGUEURS, z } from '@/domain/core/validation'
import { CAPACITE_MAX } from './capacite'

/**
 * Module `SPACE` — chambres et bureaux, en logique pure.
 *
 * Deux règles seulement, mais elles ne se ressemblent pas : `SPACE-R1`/`R2`
 * refusent (un bureau n'a pas de lit, une chambre en a au moins un), tandis que
 * `SPACE-R3` se contente d'un mot — la somme des couchages n'a pas à tomber
 * juste sur la capacité, c'est un repère, jamais un verrou.
 */

export const TYPES_ESPACE = ['ROOM', 'OFFICE'] as const
export type TypeEspace = (typeof TYPES_ESPACE)[number]

/** Une pièce n'est pas une galerie : dix photos suffisent largement. */
export const MAX_PHOTOS_ESPACE = 10
export const MAX_EQUIPEMENTS = 20

export const MESSAGE_TYPE = 'Choisissez une chambre ou un bureau.'
export const MESSAGE_CHAMBRE_SANS_COUCHAGE =
  'Une chambre doit avoir au moins un couchage.'
export const MESSAGE_BUREAU_AVEC_COUCHAGE = 'Un bureau n’a pas de couchage.'
export const MESSAGE_COUCHAGES = `Le nombre de couchages doit être un entier entre 0 et ${CAPACITE_MAX}.`

/** Un formulaire envoie du texte ; une Server Action peut recevoir n'importe quoi. */
const schemaCouchages = z.preprocess((valeur) => {
  if (valeur === undefined || valeur === null || valeur === '') return 0
  if (typeof valeur !== 'string') return valeur
  return Number(valeur.trim().replace(',', '.'))
}, z
  .number({ error: MESSAGE_COUCHAGES })
  .refine((valeur) => Number.isInteger(valeur), { error: MESSAGE_COUCHAGES })
  .refine((valeur) => valeur >= 0 && valeur <= CAPACITE_MAX, {
    error: MESSAGE_COUCHAGES,
  }))

/**
 * `SPACE-R1` et `SPACE-R2`.
 *
 * Le formulaire n'affiche pas de champ « couchages » pour un bureau : ce refus
 * ne protège donc que de l'appel forgé — raison de plus pour qu'il existe.
 */
export const schemaEspace = z
  .object({
    type: z.enum(TYPES_ESPACE, { error: MESSAGE_TYPE }),
    nom: z
      .string({ error: 'Le nom de l’espace est obligatoire.' })
      .trim()
      .min(1, { error: 'Le nom de l’espace est obligatoire.' })
      .max(LONGUEURS.courte, { error: 'Ce nom est trop long.' }),
    description: z.string().trim().max(LONGUEURS.moyenne).nullish(),
    couchages: schemaCouchages,
    typeDeLit: z.string().trim().max(LONGUEURS.courte).nullish(),
    equipements: z
      .array(z.string().trim().min(1).max(60))
      .max(MAX_EQUIPEMENTS)
      .optional(),
  })
  .superRefine((espace, contexte) => {
    if (espace.type === 'OFFICE' && espace.couchages !== 0) {
      contexte.addIssue({
        code: 'custom',
        path: ['couchages'],
        message: MESSAGE_BUREAU_AVEC_COUCHAGE,
      })
    }
    if (espace.type === 'ROOM' && espace.couchages < 1) {
      contexte.addIssue({
        code: 'custom',
        path: ['couchages'],
        message: MESSAGE_CHAMBRE_SANS_COUCHAGE,
      })
    }
  })

export interface EspaceCompte {
  readonly type: TypeEspace
  readonly couchages: number
  readonly active: boolean
}

export interface Coherence {
  /** Somme des couchages des chambres en service. */
  readonly couchages: number
  readonly capacite: number
  /** `null` quand les deux chiffres coïncident. Jamais bloquant (`SPACE-R3`). */
  readonly avertissement: string | null
}

/**
 * `SPACE-R3` — le repère entre les lits comptés et la capacité annoncée.
 *
 * Un espace en sommeil ne compte plus : c'est justement ce qui rend le décompte
 * utile quand Solenne ferme une chambre pour l'hiver.
 */
export function coherenceCouchages(
  espaces: readonly EspaceCompte[],
  capacite: number,
): Coherence {
  const couchages = espaces
    .filter((espace) => espace.active && espace.type === 'ROOM')
    .reduce((total, espace) => total + espace.couchages, 0)

  if (couchages === capacite) return { couchages, capacite, avertissement: null }

  const lits = `${couchages} couchage${couchages > 1 ? 's' : ''}`
  const places = `${capacite} personne${capacite > 1 ? 's' : ''}`
  const ecart = Math.abs(capacite - couchages)
  const nuance =
    couchages < capacite
      ? `il en manque ${ecart}`
      : `${ecart} de plus que de places`

  return {
    couchages,
    capacite,
    avertissement: `Les chambres totalisent ${lits} pour une capacité de ${places} : ${nuance}. C’est un repère, rien n’est bloqué.`,
  }
}
