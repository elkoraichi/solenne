/**
 * `OCCUP` — le **registre des sources d'occupation**. Il déclare qui a le droit
 * de remplir la maison ; il ne compte rien lui-même. L'addition, unique, vit
 * dans `occupation.ts`.
 *
 * Règle non négociable n°3 : aucun autre module ne compte. `HOUSE` (capacité),
 * puis `AVAIL` (règles R1→R8) consomment ce registre et rien d'autre.
 *
 * **Registre de contributeurs (Mode Opératoire §6.1, option B).** Les trois
 * sources d'occupation sont déclarées dès maintenant ; celles qui n'existent
 * pas encore rendent zéro. Le jour où `SLEEP` (lot 4) arrive, il bascule un
 * interrupteur — aucune formule n'est réécrite.
 *
 * Posé au lot 2 parce que `HOUSE-R2` — refuser une réduction de capacité sous
 * l'occupation déjà confirmée — ne pouvait pas s'écrire sans lui ; complété au
 * lot 3 par le contrat figé `OCCUP-CT-01→08`.
 *
 * **L'ordre de `REGISTRE` est un ordre de priorité** : quand deux sources
 * réclament la même personne un même jour, c'est la première déclarée qui la
 * garde, et elle n'est comptée qu'une fois.
 */

export type NomContributeur =
  | 'SEJOUR_CONFIRME'
  | 'DORMEUR_EVENEMENT'
  | 'AFFECTATION_CHAMBRE'

export interface Contributeur {
  readonly nom: NomContributeur
  /** Un contributeur dormant est déclaré, testé, et ne compte pour rien. */
  readonly actif: boolean
  readonly arrivee: string
  readonly quoi: string
}

export const REGISTRE: readonly Contributeur[] = [
  {
    nom: 'SEJOUR_CONFIRME',
    actif: true,
    arrivee: 'lot 2',
    quoi: 'adultes et enfants d’un séjour confirmé',
  },
  {
    nom: 'DORMEUR_EVENEMENT',
    actif: false,
    arrivee: 'lot 4 — SLEEP',
    quoi: 'participants d’un événement qui dorment sur place',
  },
  {
    nom: 'AFFECTATION_CHAMBRE',
    actif: false,
    arrivee: 'post-MVP',
    quoi: 'occupants affectés à une chambre',
  },
] as const

export function estActif(nom: NomContributeur): boolean {
  return REGISTRE.some((c) => c.nom === nom && c.actif)
}

export function contributeursActifs(): readonly NomContributeur[] {
  return REGISTRE.filter((c) => c.actif).map((c) => c.nom)
}

/**
 * Une occupation élémentaire, sur `[arrivée, départ[`.
 * `personnes` est déjà l'effectif total de la source — le registre ne sait pas
 * qui est adulte ou enfant, seulement combien de lits sont pris.
 */
export interface Presence {
  readonly contributeur: NomContributeur
  /** Identifiant de la source, pour pouvoir la nommer à l'écran. */
  readonly reference: string
  readonly arrivee: Date
  readonly depart: Date
  readonly personnes: number
  /**
   * Parmi ces personnes, celles qu'on sait nommer — un identifiant de compte.
   * Une personne identifiée n'est comptée qu'une fois par jour, même si deux
   * contributeurs la réclament (`OCCUP-018`). Les autres restent des lits
   * anonymes.
   */
  readonly identifiees?: readonly string[]
}

export interface JourOccupe {
  readonly jour: Date
  readonly personnes: number
}
