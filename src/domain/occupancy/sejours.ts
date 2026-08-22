import type { Presence } from './registre'

/**
 * Le contributeur `SÉJOUR_CONFIRMÉ` — la seule source d'occupation active au
 * lot 3.
 *
 * Son rôle tient en une phrase : transformer des séjours en présences, sans
 * rien additionner. L'addition, elle, n'a lieu qu'une fois, dans
 * `occupation.ts`.
 */

/**
 * **P6, arrêté à l'ouverture du module.** L'effectif d'un séjour est
 * `adultes + enfants`. Le §6.4 du Mode Opératoire écrit « adultes + enfants +
 * invités » : c'est une erreur de la formule de référence. La table
 * `stay_guests` ne décrit pas des personnes *supplémentaires*, elle *nomme*
 * celles qui sont déjà déclarées — son champ `is_child` le dit assez. Les
 * additionner compterait deux fois chaque personne nommée, et la maison
 * refuserait des demandes qu'elle peut accueillir.
 *
 * Conséquence pour `STAYREQ` : la liste des invités nommés ne peut pas être
 * plus longue que `adultes + enfants`. C'est à la saisie de le garantir, pas au
 * calcul de le rattraper.
 */
export function effectifDuSejour(sejour: SejourCompte): number {
  return Math.max(0, sejour.adultes) + Math.max(0, sejour.enfants)
}

export type StatutSejour = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

/**
 * Les statuts qui occupent réellement la maison — **liste blanche**.
 *
 * Elle est blanche et non noire à dessein (`OCCUP-011`, `OCCUP-012`) : un
 * statut qu'`OCCUP` ne connaît pas vaut zéro. Le jour où le schéma en gagne un,
 * le pire qui puisse arriver est une maison déclarée trop vide — jamais une
 * maison déclarée trop pleine un samedi soir.
 *
 * `COMPLETED` compte : un séjour passé a bel et bien occupé ses nuits, et
 * l'agenda doit pouvoir se relire. Les demandes en attente et refusées, elles,
 * ne peuvent pas figurer ici : ce sont des `stay_requests`, pas des `stays`.
 */
export const STATUTS_COMPTES: readonly StatutSejour[] = ['CONFIRMED', 'COMPLETED']

/**
 * Ce qu'`OCCUP` a besoin de savoir d'un séjour — et rien de plus.
 *
 * Ni nom, ni niveau de confidentialité : la confidentialité n'affecte pas le
 * calcul (`OCC-R7`, `OCCUP-013`). Un séjour caché occupe autant de lits qu'un
 * séjour affiché ; c'est `PRIV` qui décide, plus tard, de ce qui se montre.
 */
export interface SejourCompte {
  readonly id: string
  readonly arrivee: Date
  /** Exclu : convention `[arrivée, départ[` (`OCC-R5`). */
  readonly depart: Date
  readonly adultes: number
  readonly enfants: number
  readonly statut: StatutSejour
  /**
   * Les noms déclarés au séjour. Purement informatif ici : ils ne s'ajoutent
   * jamais à l'effectif (P6, ci-dessus).
   */
  readonly invitesNommes?: readonly string[]
  /** Séjour personnel de Solenne. Il occupe la maison comme n'importe quel autre. */
  readonly sejourDeSolenne?: boolean
  /**
   * L'occupant connu du séjour, quand il s'agit d'un compte de l'application.
   * Sert au lot 4 : la même personne inscrite comme dormeuse d'un événement ne
   * doit pas prendre deux lits (`OCCUP-018`).
   */
  readonly occupantId?: string
}

export function compteDansLOccupation(sejour: SejourCompte): boolean {
  return STATUTS_COMPTES.includes(sejour.statut)
}

/** Les séjours retenus, traduits en présences. Aucune addition ici. */
export function presencesDesSejours(
  sejours: readonly SejourCompte[],
): readonly Presence[] {
  return sejours.filter(compteDansLOccupation).map((sejour) => ({
    contributeur: 'SEJOUR_CONFIRME' as const,
    reference: sejour.id,
    arrivee: sejour.arrivee,
    depart: sejour.depart,
    personnes: effectifDuSejour(sejour),
    ...(sejour.occupantId ? { identifiees: [sejour.occupantId] } : {}),
  }))
}
