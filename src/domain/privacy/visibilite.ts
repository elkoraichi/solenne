import { fusionnerPeriodes, type Periode } from '@/domain/house/blocages'

/**
 * `PRIV` — qui voit quoi d'un séjour.
 *
 * Ce fichier porte la décision **D4** : par défaut, un ami voit « Maison
 * occupée », rien d'autre. Il est pur — aucune base, aucun réseau — pour une
 * raison précise : la confidentialité se démontre sur des objets nus. Ce qui
 * n'entre pas dans `SejourVisible` ne pourra jamais sortir du serveur.
 *
 * **La donnée privée n'est pas envoyée puis masquée** (règle non négociable
 * n°4). Le type de sortie est une union : `SejourNomme` n'a pas de champ
 * `commentaire`, donc aucun oubli d'interface ne peut le laisser passer. Le
 * compilateur tient ici une part de la promesse.
 */

export const NIVEAUX_VISIBILITE = ['HIDDEN', 'BUSY_ONLY', 'FULL'] as const
export type NiveauVisibilite = (typeof NIVEAUX_VISIBILITE)[number]

/** D4 — le défaut d'un séjour du cercle, et le seul défaut acceptable. */
export const NIVEAU_PAR_DEFAUT: NiveauVisibilite = 'BUSY_ONLY'

/**
 * Le défaut d'un séjour de Solenne (décision arrêtée le 22/08/2026).
 *
 * Ce n'est pas une entorse à D4 mais son revers : D4 protège l'invité qui n'a
 * rien demandé, pas la maîtresse de maison qui annonce sa présence chez elle.
 * Le défaut reste un point de départ — elle abaisse le niveau séjour par
 * séjour quand elle le souhaite (PRIV-011).
 */
export const NIVEAU_PAR_DEFAUT_SOLENNE: NiveauVisibilite = 'FULL'

/**
 * Le niveau qu'un séjour prend **à sa création**, et la seule définition du
 * défaut : `STAYDEC` (lot 3) comme la console passent par ici.
 *
 * Le réglage global ne vaut que pour le cercle. Il répond à « ce que mes amis
 * montrent d'eux », pas à « ce que je montre de moi » : un réglage discret
 * choisi pour ses invités n'a pas à effacer Solenne de son propre agenda.
 */
export function niveauParDefaut({
  estSejourDeSolenne = false,
  reglage = null,
}: {
  readonly estSejourDeSolenne?: boolean
  readonly reglage?: NiveauVisibilite | null
} = {}): NiveauVisibilite {
  if (estSejourDeSolenne) return NIVEAU_PAR_DEFAUT_SOLENNE
  return reglage ?? NIVEAU_PAR_DEFAUT
}

/** La seule chose qu'un ami apprend d'un séjour qui n'est pas le sien. */
export const MENTION_OCCUPEE = 'Maison occupée'

export const LIBELLE_NIVEAU: Readonly<Record<NiveauVisibilite, string>> = {
  HIDDEN: 'Invisible',
  BUSY_ONLY: 'Maison occupée',
  FULL: 'Prénom et nombre de personnes',
}

/** Ce que Solenne lit sous chaque choix, pour décider sans deviner. */
export const EXPLICATION_NIVEAU: Readonly<Record<NiveauVisibilite, string>> = {
  HIDDEN:
    'Le séjour n’apparaît nulle part pour les amis. Les dates restent comptées dans la capacité de la maison.',
  BUSY_ONLY:
    'Les amis voient que la maison est occupée à ces dates, sans savoir par qui ni combien.',
  FULL:
    'Les amis voient le prénom et le nombre de personnes. Le motif et le commentaire restent privés.',
}

export function estNiveauVisibilite(
  valeur: unknown,
): valeur is NiveauVisibilite {
  return NIVEAUX_VISIBILITE.includes(valeur as NiveauVisibilite)
}

/**
 * Qui regarde. L'identité et le rôle viennent de la session, côté serveur —
 * jamais du client (règle non négociable n°2).
 */
export interface Regard {
  readonly id: string
  readonly estAdministratrice: boolean
}

/** Un séjour tel qu'il est en base : tout, sans filtre. */
export interface SejourPrive {
  readonly id: string
  readonly proprietaireId: string
  readonly qui: string
  readonly du: Date
  readonly au: Date
  readonly adultes: number
  readonly enfants: number
  readonly personnes: number
  readonly motif: string | null
  readonly commentaire: string | null
  readonly besoins: string | null
  readonly niveau: NiveauVisibilite
  readonly estSejourDeSolenne: boolean
}

/** Niveau `FULL` vu par un tiers : un prénom, un effectif, des dates. */
export interface SejourNomme {
  readonly nature: 'NOMME'
  readonly du: Date
  readonly au: Date
  readonly qui: string
  readonly personnes: number
}

/** Le séjour vu par son propriétaire (PRIV-R4) ou par Solenne (PRIV-R3). */
export interface SejourDetaille {
  readonly nature: 'COMPLET'
  readonly id: string
  readonly du: Date
  readonly au: Date
  readonly qui: string
  readonly adultes: number
  readonly enfants: number
  readonly personnes: number
  readonly motif: string | null
  readonly commentaire: string | null
  readonly besoins: string | null
  readonly niveau: NiveauVisibilite
  readonly estSejourDeSolenne: boolean
  readonly estLeMien: boolean
}

export type SejourVisible = SejourNomme | SejourDetaille

export interface VueDesSejours {
  /** Les bandes « Maison occupée », fusionnées : une par période, pas une par séjour. */
  readonly occupations: readonly Periode[]
  readonly sejours: readonly SejourVisible[]
}

function detailler(sejour: SejourPrive, regard: Regard): SejourDetaille {
  return {
    nature: 'COMPLET',
    id: sejour.id,
    du: sejour.du,
    au: sejour.au,
    qui: sejour.qui,
    adultes: sejour.adultes,
    enfants: sejour.enfants,
    personnes: sejour.personnes,
    motif: sejour.motif,
    commentaire: sejour.commentaire,
    besoins: sejour.besoins,
    niveau: sejour.niveau,
    estSejourDeSolenne: sejour.estSejourDeSolenne,
    estLeMien: sejour.proprietaireId === regard.id,
  }
}

function nommer(sejour: SejourPrive): SejourNomme {
  return {
    nature: 'NOMME',
    du: sejour.du,
    au: sejour.au,
    qui: sejour.qui,
    personnes: sejour.personnes,
  }
}

/**
 * Le sérialiseur par rôle. Une seule porte pour toute donnée de séjour qui
 * quitte le serveur.
 *
 * Quatre chemins, dans cet ordre :
 *   1. Solenne (PRIV-R3) — tout, sans exception, y compris les séjours cachés.
 *   2. Le propriétaire (PRIV-R4) — son séjour en entier, quel qu'en soit le niveau.
 *   3. `HIDDEN` (PRIV-R5) — rien. Pas même une bande. La période reste comptée
 *      par `OCCUP`, ce qui est un autre sujet : compter n'est pas montrer.
 *   4. `FULL` — prénom et effectif · `BUSY_ONLY` — une bande anonyme.
 *
 * Les bandes sont fusionnées avant d'être rendues (PRIV-007) : trois séjours
 * qui se chevauchent ne doivent pas se compter à l'écran.
 */
export function vueDesSejours(
  sejours: readonly SejourPrive[],
  regard: Regard,
): VueDesSejours {
  const visibles: SejourVisible[] = []
  const bandes: Periode[] = []

  for (const sejour of sejours) {
    if (regard.estAdministratrice || sejour.proprietaireId === regard.id) {
      visibles.push(detailler(sejour, regard))
      continue
    }

    if (sejour.niveau === 'HIDDEN') continue

    if (sejour.niveau === 'FULL') {
      visibles.push(nommer(sejour))
      continue
    }

    bandes.push({ du: sejour.du, au: sejour.au })
  }

  return {
    occupations: fusionnerPeriodes(bandes),
    sejours: visibles,
  }
}
