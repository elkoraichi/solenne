import type { CodeErreur, CodeMetier } from '@/domain/core/error-codes'
import {
  messageDetaille,
  messagePour,
  type ParametresMessage,
} from '@/domain/core/messages'

/**
 * `AVAIL` — la **forme d'un refus**, figée ici une fois pour toutes.
 *
 * Les huit règles arrivent en trois arrêts ; leur manière de dire non, elle,
 * ne bouge plus. Un conflit porte quatre choses :
 *
 * - la **règle** qui s'y oppose, pour que le rapport soit lisible sans décoder ;
 * - le **code** stable, pour les tests et le code appelant ;
 * - le **message français** destiné à un ami — celui du catalogue, sans chiffre ;
 * - le **détail chiffré**, réservé à Solenne, et **absent** dès qu'on s'adresse
 *   à un ami (`pourAmi`). La donnée privée n'est pas envoyée puis masquée :
 *   elle n'est pas envoyée (règle non négociable n°4).
 *
 * Un résultat porte **tous** les conflits, jamais le premier seul : Solenne doit
 * voir d'un coup tout ce qui s'oppose à une demande, pas les découvrir un par un
 * en corrigeant.
 */

/**
 * Les huit règles du module, plus `PRE` — les contrôles préalables, qui ne sont
 * pas une règle métier mais un refus de traiter une demande qui n'a pas de sens.
 *
 * `R5` (cohabitation) et `R7` (séjour pendant un événement) n'apparaîtront
 * jamais dans un conflit : leur verdict est ✅. Elles existent dans ce type
 * parce qu'elles existent dans la table du Mode Opératoire, et qu'un lecteur
 * qui n'y retrouverait pas ses huit règles se demanderait ce qu'on lui cache.
 */
export type Regle = 'PRE' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8'

/**
 * **L'ordre de gravité**, du plus grave au moins grave (`AVAIL-032`).
 *
 * Le critère n'est pas l'importance ressentie mais ce que la personne peut y
 * faire : d'abord ce qu'aucune modification de la demande ne réparerait, en
 * dernier ce qui se corrige en changeant un nombre ou une date.
 *
 * 1. `PRE` — la demande est illisible ; le reste ne veut rien dire.
 * 2. `R1` — la maison est fermée. Rien à négocier.
 * 3. `R2` — elle est privatisée par quelqu'un d'autre. Rien à négocier non plus.
 * 4. `R3` — la privatisation demandée est impossible, mais un séjour ordinaire
 *    passerait peut-être : le refus porte sur la forme de la demande.
 * 5. `R6` — deux événements se marchent dessus ; c'est un conflit d'agenda.
 * 6. `R4` — il manque des places : venir moins nombreux suffit parfois.
 * 7. `R8` — une règle de politique, la plus révisable de toutes.
 *
 * `AVAIL-C` éprouvera cette table sur les combinaisons ; elle ne la réécrira pas.
 */
export const ORDRE_GRAVITE: readonly Regle[] = ['PRE', 'R1', 'R2', 'R3', 'R6', 'R4', 'R8']

/**
 * Les chiffres derrière un refus. Jamais montrés à un ami.
 * Toutes les clefs sont facultatives : chaque règle ne renseigne que les
 * siennes, et la plupart n'ont rien à ajouter à leur message.
 */
export interface DetailsConflit {
  /** Personnes déjà attendues le jour le plus chargé, selon `OCCUP`. */
  readonly occupation?: number
  /** Personnes de la demande examinée. */
  readonly demande?: number
  /** `occupation + demande` — ce qu'il faudrait loger. */
  readonly total?: number
  readonly capacite?: number
}

export interface Conflit {
  readonly regle: Regle
  /**
   * `CodeMetier` pour `PRE`→`R7`, propres à `AVAIL` ; `R8` porte le code de
   * `POLICY` (`CodePolicy`) ou d'un module appelant (`STAYREQ`…) — d'où le
   * type large. `conflit()`, plus bas, reste borné à `CodeMetier` : c'est la
   * seule façon de fabriquer un conflit des huit règles propres d'`AVAIL`.
   */
  readonly code: CodeErreur
  /** Français, destiné à un ami. Aucun chiffre privé. */
  readonly message: string
  readonly details?: DetailsConflit
}

export interface ResultatDisponibilite {
  readonly compatible: boolean
  /** Tous les conflits, du plus grave au moins grave. Vide si compatible. */
  readonly conflits: readonly Conflit[]
}

export function conflit(
  regle: Regle,
  code: CodeMetier,
  options?: {
    readonly parametres?: ParametresMessage
    readonly details?: DetailsConflit
  },
): Conflit {
  const base = { regle, code, message: messagePour(code, options?.parametres) }
  return options?.details ? { ...base, details: options.details } : base
}

/**
 * Trie par gravité. Le tri de JavaScript est stable : deux conflits de même
 * règle restent dans l'ordre où les règles les ont produits.
 */
export function trierConflits(conflits: readonly Conflit[]): readonly Conflit[] {
  const rang = (regle: Regle): number => {
    const index = ORDRE_GRAVITE.indexOf(regle)
    return index === -1 ? ORDRE_GRAVITE.length : index
  }

  return [...conflits].sort((a, b) => rang(a.regle) - rang(b.regle))
}

/**
 * Le même verdict, débarrassé de ce qu'un ami n'a pas à savoir.
 * C'est cette forme-là que les Server Actions renvoient au client.
 */
export function pourAmi(resultat: ResultatDisponibilite): ResultatDisponibilite {
  return {
    compatible: resultat.compatible,
    conflits: resultat.conflits.map(({ regle, code, message }) => ({
      regle,
      code,
      message,
    })),
  }
}

/**
 * La phrase que lit Solenne : le chiffre y est, parce que chez elle il est
 * légitime. Un conflit sans détail rend son message ordinaire.
 */
export function resumePourSolenne(refus: Conflit): string {
  const { details } = refus
  if (!details) return refus.message

  return messageDetaille(refus.code, {
    ...(details.total !== undefined ? { n: details.total } : {}),
    ...(details.capacite !== undefined ? { max: details.capacite } : {}),
  })
}
