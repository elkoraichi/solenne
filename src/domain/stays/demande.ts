import { debutDeJour } from '@/domain/core/dates'
import type { CodeMetier, CodeStayReq } from '@/domain/core/error-codes'
import { messagePour } from '@/domain/core/messages'
import type { Conflit, ResultatDisponibilite } from '@/domain/availability/conflits'
import {
  verifierDisponibilite,
  type ContexteDisponibilite,
  type DemandeDisponibilite,
} from '@/domain/availability/disponibilite'
import {
  verifierReglages,
  type ReglagesReservation,
} from '@/domain/policy/reglages'

/**
 * `STAYREQ` — la décision d'envoi d'une demande, en domaine pur.
 *
 * Trois contrôles n'appartiennent ni à `AVAIL` ni à `POLICY`, chacun pour sa
 * propre raison, et forment les **refus durs** de ce module — contrairement à
 * `R8`, rien ne permet de les forcer : une demande dont les dates sont déjà
 * passées, sans personne, ou dont les règles obligatoires ne sont pas
 * acceptées n'a pas de sens à envoyer « quand même ».
 *
 * - `PAST_DATES` — `AVAIL` est une fonction pure sans horloge (même discipline
 *   que `POLICY`, `maintenant` en paramètre) ; il ne peut donc pas savoir que
 *   des dates sont déjà passées. C'est à l'appelant de le lui dire.
 * - `AT_LEAST_ONE_GUEST` / `GUEST_COUNT_MISMATCH` (SREQ-R7) — ni `AVAIL` ni
 *   `POLICY` ne regardent les invités nommés, qui n'existent que pour
 *   `STAYREQ` (`stay_guests`).
 * - `RULES_NOT_ACCEPTED` (SREQ-R3) — `HOUSE` porte le texte des règles, pas
 *   leur acceptation : c'est le parcours de séjour qui l'exige.
 *
 * `evaluerDemande` compose ensuite ces refus avec `POLICY` (R8, délégation
 * déjà écrite côté `AVAIL`) et `AVAIL` lui-même — la fonction reste pure :
 * aucun accès à la base, aucune lecture d'horloge propre (`maintenant` et
 * `reglesObligatoiresNonAcceptees` sont fournis par l'appelant, qui les a lus
 * en base). C'est ce qui permet de rejouer les 20 cas de la fiche sans
 * dépendre de Postgres.
 */

export interface InviteNomme {
  readonly nom: string
}

export interface CandidatDemande {
  readonly arrivee: Date
  /** Exclue : convention `[arrivée, départ[`. */
  readonly depart: Date
  readonly adultes: number
  readonly enfants: number
  readonly invites: readonly InviteNomme[]
  /** Demande de privatisation (D2). */
  readonly exclusif?: boolean
  /** L'instant de la demande — jamais lu depuis l'horloge ici. */
  readonly maintenant: Date
  /** Vrai si des règles obligatoires existent et n'ont pas été acceptées (SREQ-R3). */
  readonly reglesObligatoiresNonAcceptees: boolean
}

export interface RefusPrealable {
  /** `PAST_DATES` vient du catalogue commun ; les trois autres sont propres à `STAYREQ`. */
  readonly code: CodeMetier | CodeStayReq
  /** Français, destiné à un ami. */
  readonly message: string
}

function refusPrealable(code: CodeMetier | CodeStayReq): RefusPrealable {
  return { code, message: messagePour(code) }
}

/**
 * Les refus durs propres à `STAYREQ` — **tous**, comme `AVAIL` et `POLICY`,
 * pour que la personne les corrige d'un coup plutôt qu'un par un.
 */
export function verifierPrealables(
  demande: CandidatDemande,
): readonly RefusPrealable[] {
  const refus: RefusPrealable[] = []

  if (demande.arrivee.getTime() < debutDeJour(demande.maintenant).getTime()) {
    refus.push(refusPrealable('PAST_DATES'))
  }

  const personnes = demande.adultes + demande.enfants
  if (personnes < 1) {
    refus.push(refusPrealable('AT_LEAST_ONE_GUEST'))
  } else if (demande.invites.length > personnes) {
    // SREQ-R7 — un invité nommé occupe l'une des places déclarées ; en avoir
    // nommé plus que déclaré n'a pas de sens. Comparaison sautée si le nombre
    // de personnes est déjà refusé : pas la peine d'empiler deux refus qui
    // pointent tous les deux vers le même formulaire à corriger.
    refus.push(refusPrealable('GUEST_COUNT_MISMATCH'))
  }

  if (demande.reglesObligatoiresNonAcceptees) {
    refus.push(refusPrealable('RULES_NOT_ACCEPTED'))
  }

  return refus
}

export interface ContexteEvaluation extends ContexteDisponibilite {
  readonly reglages: ReglagesReservation
  /** POL-R1 : aucune règle ne s'applique à Solenne. */
  readonly estSolenne?: boolean
  /** POL-R6 : la période est-elle déjà occupée ? Calculé par l'appelant (voir `POLICY`). */
  readonly periodeOccupee?: boolean
}

export interface ResultatEvaluation {
  /** Refus durs : jamais contournables par `force`. Vide si la demande a un sens. */
  readonly prealables: readonly RefusPrealable[]
  /** Le verdict d'`AVAIL`, `POLICY` fondu dedans (R8) — celui-ci, SREQ-R4 permet de le forcer. */
  readonly disponibilite: ResultatDisponibilite
}

/**
 * L'évaluation complète d'une demande candidate. Ne décide rien seule :
 * l'appelant (la Server Action) choisit quoi faire d'un `prealables` non vide
 * (toujours un refus) et d'une `disponibilite` incompatible (un refus, sauf
 * si la personne a explicitement choisi d'envoyer quand même — SREQ-R4).
 */
export function evaluerDemande(
  demande: CandidatDemande,
  contexte: ContexteEvaluation,
): ResultatEvaluation {
  const prealables = verifierPrealables(demande)

  const refusPolitique = verifierReglages(
    {
      arrivee: demande.arrivee,
      depart: demande.depart,
      personnes: demande.adultes + demande.enfants,
      maintenant: demande.maintenant,
      estSolenne: contexte.estSolenne,
      periodeOccupee: contexte.periodeOccupee,
    },
    contexte.reglages,
  )

  // R8 — délégation : le message est déjà celui du catalogue, paramètres
  // substitués par `POLICY` ; on ne le refait pas ici (`AVAIL` non plus).
  const conflitsPolitique: readonly Conflit[] = refusPolitique.map((refus) => ({
    regle: 'R8' as const,
    code: refus.code,
    message: refus.message,
  }))

  const demandeDisponibilite: DemandeDisponibilite = {
    arrivee: demande.arrivee,
    depart: demande.depart,
    personnes: demande.adultes + demande.enfants,
    ...(demande.exclusif !== undefined ? { exclusif: demande.exclusif } : {}),
  }

  const contexteAvail = { ...contexte, conflitsPolitique }
  const disponibilite = verifierDisponibilite(demandeDisponibilite, contexteAvail)

  return { prealables, disponibilite }
}
