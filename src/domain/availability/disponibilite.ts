import { chevauchent } from '@/domain/core/dates'
import { blocageSur, type Periode as PeriodeBlocage } from '@/domain/house/blocages'
import { occupationSur } from '@/domain/occupancy/occupation'
import type { Presence } from '@/domain/occupancy/registre'

import { conflit, trierConflits, type Conflit, type ResultatDisponibilite } from './conflits'

/**
 * `AVAIL` — **le moteur de compatibilité**. Une question, une réponse :
 * « est-ce compatible ? », et si non, *tout* ce qui s'y oppose.
 *
 * **Garde-fou G1, la seule chose à retenir de ce fichier : `AVAIL` ne compte
 * jamais.** Il pose la question à `OCCUP` — une fois, ligne unique — et se
 * contente de comparer la réponse à la capacité. C'est la règle non négociable
 * n°3, et `AVAIL-CT-01` la vérifie deux fois : par le comportement, en donnant
 * au moteur une présence que `OCCUP` ignore, et par la forme du code, en
 * refusant toute lecture de `presences` ailleurs que dans l'appel à `OCCUP`.
 *
 * Trois conséquences, visibles dans les types ci-dessous.
 *
 * 1. **`SejourExistant` n'a pas d'effectif.** R2 et R3 ont besoin de savoir
 *    qu'un séjour existe et s'il est exclusif ; ils n'ont aucun besoin de
 *    savoir combien il amène. Le type ne le porte donc pas : le garde-fou est
 *    dans la forme des données, pas seulement dans la discipline de l'auteur.
 * 2. **La capacité se compare au pic**, jamais à une moyenne — et c'est `OCCUP`
 *    qui définit ce qu'est le pic (`OCCUP-CT-01`). Un seul jour en dépassement
 *    refuse toute la demande.
 * 3. **Le lot 4 n'a rien à faire ici.** Activer `DORMEUR_ÉVÉNEMENT` change ce
 *    que `OCCUP` répond ; R4 s'en trouve plus juste sans qu'une ligne bouge.
 *
 * Fonction pure : aucun accès à la base, aucune lecture d'horloge. Ce qu'elle
 * ne reçoit pas, elle ne l'invente pas.
 *
 * Périmètre de l'arrêt S3 : contrôles préalables, R1, R2, R3, R4.
 * S4 ajoute R5 (aucun code : la cohabitation est déjà ce qui se passe quand ni
 * R2 ni R4 ne s'y opposent), R7 (même chose : aucun code n'existe pour « un
 * événement a lieu », donc rien ne bloque une demande de ce seul fait — R4
 * reste seul juge de la capacité, dormeurs d'événement compris dès que
 * `SLEEP` les activera dans `OCCUP`), R8 (délégation, ci-dessous) et R6
 * (dormant, ci-dessous).
 *
 * **S5 — ce que les combinaisons ont appris.** Une seule chose a bougé, et
 * c'est la rencontre de R3 et R7 qui l'a montrée : un événement, même sans un
 * seul dormeur, empêche de privatiser la maison. Aucune règle prise seule ne
 * pouvait le dire — R7 n'avait aucun code, R3 ne regardait que les séjours et
 * l'occupation, et une maison vide un jour de fête passait donc pour libre. Le
 * contexte porte désormais `evenements`, R3 les compte parmi les occupants, et
 * le message du catalogue dit « occupée » là où il disait « un séjour ». Tout
 * le reste tient sans une ligne de plus : les huit règles s'additionnent,
 * `trierConflits` les ordonne, aucune n'en masque une autre.
 *
 * **R8 — délégation à `POLICY`, pas exécution.** `POLICY` n'existe pas encore
 * (module suivant) et ses réglages — délai minimum, horizon, durée maximum —
 * n'ont rien à voir avec la disponibilité. `AVAIL` ne les recalcule donc pas :
 * l'appelant (la future Server Action `STAYREQ`) interroge `POLICY` d'abord et
 * transmet ses refus tels quels via `conflitsPolitique`. `AVAIL` se contente de
 * les fondre dans la liste et de les trier avec les siens — jamais de les
 * interpréter, jamais de refaire le calcul à sa place.
 *
 * **R6 — dormant.** `verifierChevauchementEvenements`, plus bas, applique la
 * règle (deux événements ne peuvent jamais se chevaucher, D8) mais n'est
 * appelée par rien ici : `EVENT` n'existe pas avant le lot 4, et c'est lui qui
 * l'appellera. Même mécanique que les contributeurs dormants d'`OCCUP` —
 * déclarée et testée avant d'avoir un appelant, jamais réécrite quand il
 * arrive.
 */

/**
 * Un séjour déjà là. Des dates, une exclusivité, une référence — **pas
 * d'effectif** : les personnes, c'est l'affaire de `OCCUP` (voir plus haut).
 */
export interface SejourExistant {
  readonly reference: string
  readonly arrivee: Date
  /** Exclue : convention `[arrivée, départ[`. */
  readonly depart: Date
  readonly exclusif: boolean
}

export interface DemandeDisponibilite {
  readonly arrivee: Date
  /** Exclue : convention `[arrivée, départ[`. */
  readonly depart: Date
  /** Adultes et enfants confondus — l'effectif total qui dormira là (P6). */
  readonly personnes: number
  /** Demande de privatisation (D2). */
  readonly exclusif?: boolean
  /**
   * Le séjour qu'on est en train de modifier : il ne s'oppose pas à lui-même.
   * Sa référence vaut pour les présences comme pour les séjours existants.
   */
  readonly referenceAExclure?: string
}

/**
 * Un événement déjà à l'agenda — un instant de début, un instant de fin.
 * Contrairement à un séjour, un événement se mesure à l'heure, pas au jour :
 * « 14h→22h » n'est pas un jour entier.
 */
export interface EvenementExistant {
  readonly reference: string
  readonly debut: Date
  readonly fin: Date
}

export interface ContexteDisponibilite {
  readonly capacite: number
  /** Transmises telles quelles à `OCCUP`. Ce module ne les ouvre pas. */
  readonly presences: readonly Presence[]
  readonly blocages?: readonly PeriodeBlocage[]
  readonly sejours?: readonly SejourExistant[]
  /**
   * Les événements à l'agenda sur la période. **Sans effectif** — leurs
   * dormeurs sont des présences comme les autres, et c'est `OCCUP` qui les
   * compte (G1). R7 n'en tire aucun refus ; seule R3 les regarde, parce qu'une
   * maison où l'on reçoit n'est pas une maison vide.
   */
  readonly evenements?: readonly EvenementExistant[]
  /**
   * R8 — les refus déjà rendus par `POLICY` pour cette même demande.
   * `AVAIL` ne les calcule pas, il les rapporte (voir plus haut).
   */
  readonly conflitsPolitique?: readonly Conflit[]
}

/**
 * Est-ce compatible ? Et si non, pourquoi — **tous** les motifs, du plus grave
 * au moins grave.
 */
export function verifierDisponibilite(
  demande: DemandeDisponibilite,
  contexte: ContexteDisponibilite,
): ResultatDisponibilite {
  const { arrivee, depart } = demande

  // Contrôle préalable. Une période qui ne couvre aucune nuit n'a pas de
  // réponse : on refuse de la traiter plutôt que de la déclarer compatible,
  // et surtout on n'évalue aucune règle sur des dates qui n'ont pas de sens.
  if (depart.getTime() <= arrivee.getTime()) {
    return { compatible: false, conflits: [conflit('PRE', 'INVALID_DATES')] }
  }

  const conflits: Conflit[] = []

  // R1 — la maison est fermée sur ces dates.
  if (blocageSur(contexte.blocages ?? [], arrivee, depart)) {
    conflits.push(conflit('R1', 'BLOCKED_PERIOD'))
  }

  const sejoursEnTravers = (contexte.sejours ?? []).filter(
    (sejour) =>
      sejour.reference !== demande.referenceAExclure &&
      chevauchent(sejour.arrivee, sejour.depart, arrivee, depart),
  )

  // **L'unique lecture de l'occupation.** Tout ce qui suit s'appuie dessus.
  const occupation = occupationSur(contexte.presences, { debut: arrivee, fin: depart }, {
    ...(demande.referenceAExclure !== undefined
      ? { exclureReference: demande.referenceAExclure }
      : {}),
  })

  // R2 — quelqu'un a déjà privatisé la maison. La place disponible n'y change
  // rien : une privatisation ne se partage pas, même à deux dans vingt-cinq.
  if (sejoursEnTravers.some((sejour) => sejour.exclusif)) {
    conflits.push(conflit('R2', 'EXCLUSIVE_CONFLICT'))
  }

  // R3 — la privatisation demandée, à l'envers : la période doit être vide.
  // Vide au sens de `OCCUP` (personne n'y dort), au sens des séjours (un séjour
  // à zéro personne reste un séjour) **et** au sens des événements : un
  // événement sans dormeur ne pèse sur aucun compte, mais on ne privatise pas
  // une maison le jour où Solenne y reçoit (`AVAIL-031`).
  //
  // C'est la seule chose que R7 emprunte au moteur. Le reste du temps, un
  // séjour pendant un événement est le cas nominal (D3) et personne ne
  // l'interroge : R4 seule arbitre, via les dormeurs que `OCCUP` lui compte.
  const evenementsEnTravers = (contexte.evenements ?? []).filter((evenement) =>
    chevauchent(evenement.debut, evenement.fin, arrivee, depart),
  )

  if (
    demande.exclusif &&
    (sejoursEnTravers.length > 0 || occupation.total > 0 || evenementsEnTravers.length > 0)
  ) {
    conflits.push(conflit('R3', 'EXCLUSIVE_REQUEST_CONFLICT'))
  }

  // R4 — la capacité, comparée au jour le plus chargé. Un effectif négatif
  // n'a jamais libéré de place (`OCCUP-CT-04`, même parade).
  const personnes = Math.max(0, demande.personnes)
  const total = occupation.total + personnes
  if (total > contexte.capacite) {
    conflits.push(
      conflit('R4', 'CAPACITY_EXCEEDED', {
        details: {
          occupation: occupation.total,
          demande: personnes,
          total,
          capacite: contexte.capacite,
        },
      }),
    )
  }

  // R8 — délégation pure : ces conflits sont déjà formés, `AVAIL` les reprend
  // sans y toucher.
  conflits.push(...(contexte.conflitsPolitique ?? []))

  return { compatible: conflits.length === 0, conflits: trierConflits(conflits) }
}

export interface DemandeEvenement {
  readonly debut: Date
  readonly fin: Date
}

/**
 * R6 — deux événements ne peuvent jamais se chevaucher (D8). **Dormant** :
 * voir la note en tête de fichier. `EVENT` (lot 4) l'appellera avant de
 * confirmer un nouvel événement ; personne ne l'appelle encore.
 */
export function verifierChevauchementEvenements(
  demande: DemandeEvenement,
  evenementsExistants: readonly EvenementExistant[],
): Conflit | null {
  const enConflit = evenementsExistants.find((evenement) =>
    chevauchent(evenement.debut, evenement.fin, demande.debut, demande.fin),
  )
  return enConflit ? conflit('R6', 'EVENT_OVERLAP') : null
}
