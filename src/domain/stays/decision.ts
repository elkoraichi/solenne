import {
  resumePourSolenne,
  type Conflit,
  type Regle,
  type ResultatDisponibilite,
} from '@/domain/availability/conflits'
import type { CodeErreur } from '@/domain/core/error-codes'
import { messagePour } from '@/domain/core/messages'
import { evaluerDemande, type ContexteEvaluation } from '@/domain/stays/demande'

/**
 * `STAYDEC` — la décision de Solenne, en domaine pur.
 *
 * Trois choses sont figées ici, et une seule d'entre elles se voit à la
 * lecture du code :
 *
 * 1. **SDEC-R2 — le moteur est rejoué à la décision, pas à la demande.**
 *    `evaluerAcceptation` ne reçoit aucun verdict pré-calculé : elle prend un
 *    contexte et le fait trancher par `AVAIL` elle-même. Un appelant qui
 *    voudrait réutiliser le verdict affiché à l'écran n'a nulle part où le
 *    mettre. C'est volontaire — c'est la seule protection structurelle contre
 *    l'anomalie du module (`STAYDEC-006`).
 *
 * 2. **POL-R1 se lit sur le *demandeur*, jamais sur le décideur.** Le décideur
 *    est toujours Solenne (SDEC-R1) ; si l'on branchait `estSolenne` sur lui,
 *    les réglages de réservation ne s'appliqueraient plus à personne et
 *    `POLICY` deviendrait décoratif. Le champ s'appelle donc
 *    `demandeurEstSolenne`, pour qu'aucun appelant ne se trompe de sujet.
 *
 * 3. **Tout n'est pas forçable.** SDEC-R4 laisse Solenne accepter une demande
 *    devenue incompatible : c'est sa maison, elle peut trouver un matelas ou
 *    lever un blocage qu'elle a posé elle-même. Mais l'exclusivité (R2/R3)
 *    n'est pas une gêne, c'est une promesse faite à quelqu'un d'autre — et la
 *    base la refuserait de toute façon (`stays_sans_chevauchement_exclusif`,
 *    `stays_exclusif_sans_cohabitation`). Un refus métier lisible vaut mieux
 *    qu'une violation de contrainte remontée en trace technique (règle non
 *    négociable n°5).
 *
 * Comme `demande.ts`, le fichier est pur : ni base, ni horloge — `maintenant`
 * est fourni par l'appelant.
 */

/** Le statut de la demande tel qu'il est en base au moment où l'on décide. */
export type StatutDemande = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'

export interface RefusDecision {
  readonly code: CodeErreur
  /** Français, destiné à Solenne. */
  readonly message: string
}

function refus(code: RefusDecision['code']): RefusDecision {
  return { code, message: messagePour(code) }
}

/**
 * SDEC-R6 — une demande ne se décide qu'une fois, et seulement si son auteur
 * ne l'a pas retirée. Les deux cas donnent des messages différents parce
 * qu'ils appellent des gestes différents : l'un est un doublon sans
 * conséquence, l'autre veut dire que la personne ne vient plus.
 */
export function verifierDecidable(statut: StatutDemande): RefusDecision | null {
  if (statut === 'CANCELLED') return refus('REQUEST_CANCELLED')
  if (statut !== 'PENDING') return refus('REQUEST_ALREADY_DECIDED')
  return null
}

/** R2/R3 : l'exclusivité ne se force pas — voir le point 3 de l'en-tête. */
const REGLES_NON_FORCABLES: readonly Regle[] = ['R2', 'R3']

export function estForcable(conflits: readonly Conflit[]): boolean {
  return !conflits.some((c) => REGLES_NON_FORCABLES.includes(c.regle))
}

export interface DemandeADecider {
  readonly arrivee: Date
  /** Exclue : convention `[arrivée, départ[`. */
  readonly depart: Date
  readonly adultes: number
  readonly enfants: number
  readonly exclusif: boolean
  readonly statut: StatutDemande
  /** POL-R1 : le **demandeur** est-il Solenne ? Pas le décideur. */
  readonly demandeurEstSolenne: boolean
}

/**
 * Le contexte est celui d'`AVAIL`, moins `estSolenne` : `evaluerAcceptation`
 * le déduit du demandeur (point 2 de l'en-tête) et interdit qu'on le lui
 * souffle.
 */
export type ContexteDecision = Omit<ContexteEvaluation, 'estSolenne'>

export interface VerdictDecision {
  /**
   * Le verdict d'`AVAIL` **au moment de la décision**, `POLICY` fondu dedans
   * (R8). Toujours présent, même quand l'acceptation est refusée pour une
   * autre raison : c'est ce que l'écran de Solenne affiche.
   */
  readonly disponibilite: ResultatDisponibilite
  /**
   * Non nul si l'acceptation ne peut pas aller au bout. `null` veut dire
   * « écris le séjour » — et rien d'autre ne le veut dire.
   */
  readonly refus: RefusDecision | null
  /**
   * Vrai quand seule la confirmation explicite manque (SDEC-R4) : l'écran
   * propose alors « accepter quand même ». Faux si le refus est définitif.
   */
  readonly confirmationSuffirait: boolean
}

export interface OptionsAcceptation {
  /** SDEC-R4 — Solenne a lu l'avertissement et accepte quand même. */
  readonly confirme?: boolean
  /** Jamais lu depuis l'horloge ici. */
  readonly maintenant: Date
}

/**
 * L'acceptation, évaluée contre l'état **actuel** de la maison.
 *
 * Ne persiste rien et n'ordonne rien : elle rend un verdict que la Server
 * Action applique dans sa transaction. L'appel doit se faire avec un contexte
 * lu **dans cette même transaction** — c'est là que se joue `STAYDEC-C01`, et
 * le domaine ne peut pas l'imposer seul.
 */
export function evaluerAcceptation(
  demande: DemandeADecider,
  contexte: ContexteDecision,
  options: OptionsAcceptation,
): VerdictDecision {
  const { prealables, disponibilite } = evaluerDemande(
    {
      arrivee: demande.arrivee,
      depart: demande.depart,
      adultes: demande.adultes,
      enfants: demande.enfants,
      // Les invités nommés ont été validés à la création (SREQ-R7) et ne
      // peuvent plus bouger : les recompter ici ferait ressortir un refus que
      // Solenne ne peut pas corriger.
      invites: [],
      exclusif: demande.exclusif,
      maintenant: options.maintenant,
      // Idem pour l'acceptation des règles : elle appartient au demandeur.
      reglesObligatoiresNonAcceptees: false,
    },
    { ...contexte, estSolenne: demande.demandeurEstSolenne },
  )

  const indecidable = verifierDecidable(demande.statut)
  if (indecidable) {
    return { disponibilite, refus: indecidable, confirmationSuffirait: false }
  }

  // Le seul préalable qui puisse apparaître entre la demande et la décision :
  // le temps a passé. Accepter un séjour déjà commencé ne veut rien dire, et
  // aucune confirmation ne le rend sensé.
  const datesPassees = prealables.some((p) => p.code === 'PAST_DATES')
  if (datesPassees) {
    return { disponibilite, refus: refus('PAST_DATES'), confirmationSuffirait: false }
  }

  if (disponibilite.compatible) {
    return { disponibilite, refus: null, confirmationSuffirait: false }
  }

  const bloquant = disponibilite.conflits.find((c) =>
    REGLES_NON_FORCABLES.includes(c.regle),
  )
  if (bloquant) {
    return {
      disponibilite,
      refus: { code: bloquant.code, message: bloquant.message },
      confirmationSuffirait: false,
    }
  }

  if (!options.confirme) {
    // Le refus porte le code du conflit, pas un code générique : c'est lui que
    // la fiche attend (`STAYDEC-C01` — le perdant de la course reçoit
    // `CAPACITY_EXCEEDED`), et c'est la seule information stable qui traverse
    // la frontière serveur, où `Echec` n'a de place que pour un code et un
    // message. Que la confirmation suffirait se lit dans le champ prévu pour
    // ça — et, pour Solenne, dans la phrase ajoutée derrière la raison.
    // `compatible: false` implique au moins un conflit, et `trierConflits` a
    // mis le plus grave devant.
    const dominant = disponibilite.conflits[0]
    return {
      disponibilite,
      refus: dominant
        ? {
            code: dominant.code,
            message: `${resumePourSolenne(dominant)} ${messagePour('DECISION_CONFLICT_UNCONFIRMED')}`,
          }
        : refus('DECISION_CONFLICT_UNCONFIRMED'),
      confirmationSuffirait: true,
    }
  }

  return { disponibilite, refus: null, confirmationSuffirait: false }
}
