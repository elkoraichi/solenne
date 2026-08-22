import { debutDeJour, joursOccupes, versTexteJour } from '@/domain/core/dates'
import { ErreurMetier } from '@/domain/core/result'

import {
  REGISTRE,
  estActif,
  type JourOccupe,
  type NomContributeur,
  type Presence,
} from './registre'

/**
 * `OCCUP` — **la** formule d'occupation, et le seul endroit du projet où l'on
 * additionne des personnes (règle non négociable n°3).
 *
 * Le contrat rendu ici est figé par `OCCUP-CT-01→08`. Le lot 4 (`SLEEP`)
 * activera le contributeur `DORMEUR_ÉVÉNEMENT` en basculant un booléen dans le
 * registre : **aucune ligne de ce fichier ne doit changer ce jour-là.**
 *
 * Trois décisions y sont prises une fois pour toutes.
 *
 * 1. **Le `total` d'une période est son pic** — le jour le plus chargé. C'est
 *    la seule grandeur qu'on ait le droit de comparer à la capacité : une
 *    moyenne laisserait passer un samedi soir à quinze dans une maison de dix.
 * 2. **`parSource` est le détail de ce jour de pic**, pas le pic de chaque
 *    source. Sans quoi `total === Σ parSource` (`OCCUP-CT-03`) serait faux dès
 *    que deux sources culminent des jours différents.
 * 3. **Une personne identifiée n'est comptée qu'une fois par jour**, quel que
 *    soit le nombre de sources qui la réclament (`OCCUP-018`). En cas de
 *    litige, elle est attribuée au premier contributeur du registre —
 *    l'ordre de `REGISTRE` est donc un ordre de priorité, pas un hasard.
 */

export type ParSource = Readonly<Record<NomContributeur, number>>

export interface OccupationJour {
  readonly jour: Date
  readonly total: number
  readonly parSource: ParSource
}

export interface Periode {
  readonly debut: Date
  /** Exclue : convention `[arrivée, départ[`. */
  readonly fin: Date
}

export interface OptionsOccupation {
  /**
   * Présence à retirer du calcul — le séjour qu'on est justement en train de
   * modifier, et qu'il serait absurde de compter contre lui-même.
   */
  readonly exclureReference?: string
}

export interface Occupation {
  /** Le pic : le nombre de personnes du jour le plus chargé de la période. */
  readonly total: number
  /** D'où viennent ces personnes, le jour du pic. */
  readonly parSource: ParSource
  readonly jours: readonly OccupationJour[]
}

interface PresenceRetenue {
  readonly presence: Presence
  readonly jours: ReadonlySet<string>
}

function sourcesAZero(): Record<NomContributeur, number> {
  const detail = {} as Record<NomContributeur, number>
  for (const contributeur of REGISTRE) detail[contributeur.nom] = 0
  return detail
}

/**
 * Les présences que le calcul a le droit de voir : contributeur actif, et non
 * exclue. Elles sortent triées dans l'ordre du registre — cet ordre décide qui
 * garde une personne réclamée par deux sources.
 */
function retenir(
  presences: readonly Presence[],
  options: OptionsOccupation,
): readonly PresenceRetenue[] {
  const rang = new Map(REGISTRE.map((contributeur, index) => [contributeur.nom, index]))

  return presences
    .filter((presence) => estActif(presence.contributeur))
    .filter(
      (presence) =>
        options.exclureReference === undefined ||
        presence.reference !== options.exclureReference,
    )
    .sort((a, b) => (rang.get(a.contributeur) ?? 0) - (rang.get(b.contributeur) ?? 0))
    .map((presence) => ({
      presence,
      jours: new Set(joursOccupes(presence.arrivee, presence.depart).map(versTexteJour)),
    }))
}

function occupationDUneJournee(
  jour: Date,
  retenues: readonly PresenceRetenue[],
): OccupationJour {
  const cle = versTexteJour(jour)
  const parSource = sourcesAZero()
  const dejaComptees = new Set<string>()

  for (const { presence, jours } of retenues) {
    if (!jours.has(cle)) continue

    const identifiees = presence.identifiees ?? []
    let personnes = 0

    for (const identifiant of identifiees) {
      if (dejaComptees.has(identifiant)) continue
      dejaComptees.add(identifiant)
      personnes += 1
    }
    // Le reste de la troupe : des lits, pas des noms. Un effectif aberrant
    // n'enlève jamais personne (`OCCUP-CT-04`).
    personnes += Math.max(0, presence.personnes - identifiees.length)

    parSource[presence.contributeur] += personnes
  }

  let total = 0
  for (const contributeur of REGISTRE) total += parSource[contributeur.nom]

  return { jour, total, parSource }
}

/**
 * Combien de personnes dans la maison, jour par jour, sur `[début, fin[`.
 * Fonction pure : elle ne lit rien d'autre que ses arguments et ne les touche
 * pas (`OCCUP-CT-02`).
 */
export function occupationSur(
  presences: readonly Presence[],
  periode: Periode,
  options: OptionsOccupation = {},
): Occupation {
  const debut = debutDeJour(periode.debut)
  const fin = debutDeJour(periode.fin)

  if (fin.getTime() < debut.getTime()) {
    throw new ErreurMetier('INVALID_DATES')
  }

  const retenues = retenir(presences, options)
  const jours = joursOccupes(debut, fin).map((jour) =>
    occupationDUneJournee(jour, retenues),
  )

  let pic: OccupationJour | undefined
  for (const journee of jours) {
    if (!pic || journee.total > pic.total) pic = journee
  }

  return {
    total: pic?.total ?? 0,
    parSource: pic?.parSource ?? sourcesAZero(),
    jours,
  }
}

/** L'occupation d'une seule journée — `[jour, lendemain[`. */
export function occupationLeJour(
  presences: readonly Presence[],
  jour: Date,
  options: OptionsOccupation = {},
): Occupation {
  const debut = debutDeJour(jour)

  return occupationSur(
    presences,
    { debut, fin: new Date(debut.getTime() + 86_400_000) },
    options,
  )
}

/* -------------------------------------------------------------------------
 * Lectures dérivées. Elles ne comptent rien : elles interrogent `occupationSur`
 * et se contentent de mettre en forme sa réponse.
 * ---------------------------------------------------------------------- */

/** La période couverte par un ensemble de présences, ou `null` s'il est vide. */
function etendue(presences: readonly Presence[]): Periode | null {
  let debut: number | undefined
  let fin: number | undefined

  for (const presence of presences) {
    if (!estActif(presence.contributeur)) continue
    const arrivee = debutDeJour(presence.arrivee).getTime()
    const depart = debutDeJour(presence.depart).getTime()
    if (depart <= arrivee) continue
    if (debut === undefined || arrivee < debut) debut = arrivee
    if (fin === undefined || depart > fin) fin = depart
  }

  if (debut === undefined || fin === undefined) return null
  return { debut: new Date(debut), fin: new Date(fin) }
}

/** Occupation par jour, clef `AAAA-MM-JJ`. Les journées vides sont absentes. */
export function occupationParJour(
  presences: readonly Presence[],
): ReadonlyMap<string, number> {
  const periode = etendue(presences)
  if (!periode) return new Map()

  const total = new Map<string, number>()
  for (const journee of occupationSur(presences, periode).jours) {
    if (journee.total > 0) total.set(versTexteJour(journee.jour), journee.total)
  }

  return total
}

/** Le jour le plus chargé, ou `null` si la maison est vide. */
export function occupationMaximale(presences: readonly Presence[]): JourOccupe | null {
  const periode = etendue(presences)
  if (!periode) return null

  const { total, jours } = occupationSur(presences, periode)
  const pic = jours.find((journee) => journee.total === total)

  return pic && pic.total > 0 ? { jour: pic.jour, personnes: pic.total } : null
}

/** Les journées où l'occupation dépasse une capacité donnée, en ordre. */
export function joursAuDela(
  presences: readonly Presence[],
  capacite: number,
): readonly JourOccupe[] {
  const periode = etendue(presences)
  if (!periode) return []

  return occupationSur(presences, periode)
    .jours.filter((journee) => journee.total > capacite)
    .map((journee) => ({ jour: journee.jour, personnes: journee.total }))
}

/**
 * Les présences qui touchent au moins une journée en dépassement.
 * C'est la liste que Solenne doit voir avant de réduire la capacité.
 */
export function presencesConcernees(
  presences: readonly Presence[],
  capacite: number,
): readonly Presence[] {
  const enCause = new Set(
    joursAuDela(presences, capacite).map((journee) => versTexteJour(journee.jour)),
  )
  if (enCause.size === 0) return []

  return presences.filter(
    (presence) =>
      estActif(presence.contributeur) &&
      joursOccupes(presence.arrivee, presence.depart).some((jour) =>
        enCause.has(versTexteJour(jour)),
      ),
  )
}

/**
 * Un effectif supplémentaire tient-il sur toute une période ?
 * `HOUSE` s'en sert pour dire à Solenne l'effet d'un changement de capacité sur
 * les demandes en cours ; `AVAIL` (R4) s'en servira pour la même question posée
 * à l'envers — et sans jamais recompter lui-même (garde-fou G1).
 */
export function tientDansLaCapacite(
  presences: readonly Presence[],
  capacite: number,
  ajout: {
    readonly arrivee: Date
    readonly depart: Date
    readonly personnes: number
  },
): boolean {
  const debut = debutDeJour(ajout.arrivee)
  const fin = debutDeJour(ajout.depart)
  if (fin.getTime() <= debut.getTime()) return true

  return occupationSur(presences, { debut, fin }).jours.every(
    (journee) => journee.total + ajout.personnes <= capacite,
  )
}
