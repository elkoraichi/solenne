import { jourDeSemaine } from '@/domain/core/dates'
import type { CodeMetier, CodePolicy } from '@/domain/core/error-codes'
import { messagePour, type ParametresMessage } from '@/domain/core/messages'

/** Les seuls codes que ce module rend : les cinq réglages métier, plus les siens propres. */
type CodeReglage = CodeMetier | CodePolicy

/**
 * `POLICY` — les réglages de réservation que Solenne fait varier sans jamais
 * toucher au moteur (`AVAIL`).
 *
 * **Dépendances : `HOUSE` seulement.** Ce module ignore tout de l'occupation,
 * des séjours et des événements — R6, la seule règle qui a besoin de savoir si
 * la période est déjà prise, reçoit ce fait tout fait (`periodeOccupee`) plutôt
 * que d'aller le chercher. C'est le même principe que le garde-fou G1
 * d'`AVAIL` : chaque module répond à ce qu'on lui demande, jamais en relisant
 * ce qui appartient à un autre.
 *
 * **`RefusReglage` n'est pas un `Conflit` d'`AVAIL`.** `POLICY` ne connaît pas
 * `Regle` ni `R8` — ce serait une dépendance à l'envers, `AVAIL` étant celui
 * qui délègue (R8, `src/domain/availability/disponibilite.ts`). C'est
 * l'appelant (la future Server Action `STAYREQ`) qui enveloppe chaque
 * `RefusReglage` en `conflit('R8', refus.code)` avant de le transmettre à
 * `verifierDisponibilite` via `conflitsPolitique`.
 *
 * Fonction pure : `maintenant` est un paramètre, jamais une horloge lue ici.
 *
 * Périmètre de l'arrêt S6 (`POLICY-A`) : les huit réglages en domaine pur,
 * POL-R1 (jamais opposé à Solenne) et POL-R2 (une règle désactivée ne
 * s'évalue pas).
 *
 * **S7 (`POLICY-B`) ajoute `verifierCoherence`** — POL-R5 (le maximum par
 * demande ne dépasse pas la capacité) et POL-R9 (délai minimum et horizon
 * maximum ne se contredisent pas). Ce sont des règles sur la **forme des
 * réglages eux-mêmes**, pas sur une demande : elles s'évaluent à l'enregistrement,
 * dans la Server Action, jamais dans `verifierReglages`. POL-R3 (séjours
 * confirmés préservés) et POL-R4 (demandes en attente signalées) n'ont pas de
 * code de domaine : la première tient par construction (rien ne relit les
 * séjours confirmés), la seconde compare `verifierReglages` avant/après dans
 * la Server Action, comme `HOUSE` le fait déjà pour la capacité.
 */

export interface ReglagesReservation {
  /** Nuits maximum d'un séjour. `null` — la règle est désactivée (POL-R2). */
  readonly dureeMaxNuits: number | null
  /** Heures minimum entre la demande et l'arrivée. `null` — désactivée. */
  readonly delaiMinHeures: number | null
  /** Jours maximum à l'avance pour demander. `null` — désactivée. */
  readonly horizonMaxJours: number | null
  /** Jours de la semaine (1 = lundi … 7 = dimanche) où l'on ne peut pas arriver. Vide — désactivée. */
  readonly joursArriveeInterdits: readonly number[]
  /** Personnes maximum pour une seule demande. `null` — désactivée. */
  readonly maxPersonnesParDemande: number | null
  /** Désactivée (`false`) : POL-R6 rend toute demande implicitement exclusive. */
  readonly cohabitationAutorisee: boolean
}

export interface DemandeReservation {
  readonly arrivee: Date
  readonly depart: Date
  readonly personnes: number
  /** L'instant de la demande — jamais lu depuis l'horloge (voir en tête de fichier). */
  readonly maintenant: Date
  /** POL-R1 : aucune règle ne s'applique à Solenne. */
  readonly estSolenne?: boolean
  /** POL-R6 a besoin de ce seul fait ; il ne le calcule pas (voir en tête de fichier). */
  readonly periodeOccupee?: boolean
}

export interface RefusReglage {
  readonly code: CodeReglage
  /** Français, destiné à un ami — même catalogue que les refus d'`AVAIL`. */
  readonly message: string
}

function refus(code: CodeReglage, parametres?: ParametresMessage): RefusReglage {
  return { code, message: messagePour(code, parametres) }
}

const MS_PAR_JOUR = 86_400_000
const MS_PAR_HEURE = 3_600_000

/**
 * Tous les réglages actifs que la demande viole — **tous**, comme `AVAIL`,
 * pour que Solenne les voie d'un coup plutôt que de les découvrir un par un.
 */
export function verifierReglages(
  demande: DemandeReservation,
  reglages: ReglagesReservation,
): readonly RefusReglage[] {
  // POL-R1 — Solenne n'est jamais soumise à ces réglages.
  if (demande.estSolenne) return []

  const refuses: RefusReglage[] = []
  const avance = demande.arrivee.getTime() - demande.maintenant.getTime()

  if (reglages.dureeMaxNuits !== null) {
    const nuits = Math.round(
      (demande.depart.getTime() - demande.arrivee.getTime()) / MS_PAR_JOUR,
    )
    if (nuits > reglages.dureeMaxNuits) {
      refuses.push(refus('MAX_DURATION', { n: reglages.dureeMaxNuits }))
    }
  }

  if (reglages.delaiMinHeures !== null) {
    const heuresAvance = avance / MS_PAR_HEURE
    if (heuresAvance < reglages.delaiMinHeures) {
      refuses.push(refus('MIN_LEAD_TIME', { n: reglages.delaiMinHeures }))
    }
  }

  if (reglages.horizonMaxJours !== null) {
    const joursAvance = avance / MS_PAR_JOUR
    if (joursAvance > reglages.horizonMaxJours) {
      refuses.push(refus('MAX_ADVANCE', { n: reglages.horizonMaxJours }))
    }
  }

  if (
    reglages.joursArriveeInterdits.length > 0 &&
    reglages.joursArriveeInterdits.includes(jourDeSemaine(demande.arrivee))
  ) {
    refuses.push(refus('FORBIDDEN_WEEKDAY'))
  }

  if (
    reglages.maxPersonnesParDemande !== null &&
    demande.personnes > reglages.maxPersonnesParDemande
  ) {
    refuses.push(refus('MAX_PARTY_SIZE', { max: reglages.maxPersonnesParDemande }))
  }

  // POL-R6 — cohabitation désactivée : toute période déjà occupée devient un
  // conflit d'exclusivité, même message que R2 d'`AVAIL` (même situation pour
  // l'ami qui la lit).
  if (!reglages.cohabitationAutorisee && demande.periodeOccupee) {
    refuses.push(refus('EXCLUSIVE_CONFLICT'))
  }

  return refuses
}

export interface IncoherenceReglage {
  readonly code: CodePolicy
  /** À passer tel quel à `ErreurMetier`/`messagePour` : jamais rendu ici. */
  readonly parametres?: ParametresMessage
}

/**
 * POL-R5 et POL-R9 — la cohérence des réglages **entre eux**, avant de les
 * enregistrer. Aucune demande n'est en jeu ici : c'est `mettreAJourReglages`
 * qui appelle cette fonction, jamais `verifierReglages`.
 *
 * `capaciteMaison` vient de `HOUSE` — seule dépendance du module (voir en tête
 * de fichier) — et n'est jamais recalculée ici.
 */
export function verifierCoherence(
  reglages: ReglagesReservation,
  capaciteMaison: number,
): readonly IncoherenceReglage[] {
  const incoherences: IncoherenceReglage[] = []

  // POL-R9 — le délai minimum imposerait d'attendre plus longtemps que
  // l'horizon maximum ne permet de demander : aucune date d'arrivée ne
  // pourrait jamais satisfaire les deux à la fois.
  if (
    reglages.delaiMinHeures !== null &&
    reglages.horizonMaxJours !== null &&
    reglages.delaiMinHeures > reglages.horizonMaxJours * 24
  ) {
    incoherences.push({ code: 'POLICY_UNREACHABLE' })
  }

  // POL-R9, second cas — les sept jours de la semaine interdits : aucune
  // arrivée n'aurait jamais de jour possible. Même code : la conséquence est
  // identique (§10 de la fiche : « aucune combinaison ne peut rendre
  // l'application inutilisable sans avertissement explicite »).
  if (new Set(reglages.joursArriveeInterdits).size >= 7) {
    incoherences.push({ code: 'POLICY_UNREACHABLE' })
  }

  // POL-R5 — un maximum par demande au-delà de la capacité ne limiterait rien.
  if (
    reglages.maxPersonnesParDemande !== null &&
    reglages.maxPersonnesParDemande > capaciteMaison
  ) {
    incoherences.push({
      code: 'MAX_PARTY_ABOVE_CAPACITY',
      parametres: { max: capaciteMaison },
    })
  }

  return incoherences
}
