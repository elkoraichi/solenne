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
 * R5→R8 arrivent à S4, leurs combinaisons à S5 — dans ce fichier, sans en
 * réécrire la structure.
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

export interface ContexteDisponibilite {
  readonly capacite: number
  /** Transmises telles quelles à `OCCUP`. Ce module ne les ouvre pas. */
  readonly presences: readonly Presence[]
  readonly blocages?: readonly PeriodeBlocage[]
  readonly sejours?: readonly SejourExistant[]
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
  // Vide au sens de `OCCUP` (personne n'y dort) **et** au sens de l'agenda
  // (aucun séjour posé) — un séjour à zéro personne reste un séjour.
  if (demande.exclusif && (sejoursEnTravers.length > 0 || occupation.total > 0)) {
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

  return { compatible: conflits.length === 0, conflits: trierConflits(conflits) }
}
