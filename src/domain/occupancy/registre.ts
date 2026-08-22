import { joursOccupes, versTexteJour } from '@/domain/core/dates'

/**
 * `OCCUP` — l'unique endroit du projet où l'on additionne des personnes.
 *
 * Règle non négociable n°3 : aucun autre module ne compte. `HOUSE` (capacité),
 * puis `AVAIL` (règles R1→R8) consomment ce registre et rien d'autre.
 *
 * **Registre de contributeurs (Mode Opératoire §6.1, option B).** Les trois
 * sources d'occupation sont déclarées dès maintenant ; celles qui n'existent
 * pas encore rendent zéro. Le jour où `SLEEP` (lot 4) arrive, il bascule un
 * interrupteur — aucune formule n'est réécrite.
 *
 * Ce fichier est l'amorce du module : le lot 3 lui ajoutera son contrat figé
 * (`OCCUP-CT-01→08`) et la sentinelle `OCCUP-024`. Il est ici parce que
 * `HOUSE-R2` — refuser une réduction de capacité sous l'occupation déjà
 * confirmée — ne peut pas être écrit sans lui.
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
}

export interface JourOccupe {
  readonly jour: Date
  readonly personnes: number
}

/**
 * Occupation par jour, clef `AAAA-MM-JJ`.
 *
 * Garde-fou G3 : la somme n'intègre que les contributeurs **actifs**. Ajouter
 * une source sans l'activer ne change rien ; l'activer change tout, partout, au
 * même instant.
 */
export function occupationParJour(
  presences: readonly Presence[],
): ReadonlyMap<string, number> {
  const total = new Map<string, number>()

  for (const presence of presences) {
    if (!estActif(presence.contributeur)) continue
    for (const jour of joursOccupes(presence.arrivee, presence.depart)) {
      const cle = versTexteJour(jour)
      total.set(cle, (total.get(cle) ?? 0) + presence.personnes)
    }
  }

  return total
}

function versJour(cle: string): Date {
  return new Date(`${cle}T00:00:00.000Z`)
}

/** Le jour le plus chargé, ou `null` si la maison est vide. */
export function occupationMaximale(
  presences: readonly Presence[],
): JourOccupe | null {
  let pic: JourOccupe | null = null

  for (const [cle, personnes] of occupationParJour(presences)) {
    if (!pic || personnes > pic.personnes) {
      pic = { jour: versJour(cle), personnes }
    }
  }

  return pic
}

/** Les journées où l'occupation dépasse une capacité donnée, en ordre. */
export function joursAuDela(
  presences: readonly Presence[],
  capacite: number,
): readonly JourOccupe[] {
  return [...occupationParJour(presences)]
    .filter(([, personnes]) => personnes > capacite)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cle, personnes]) => ({ jour: versJour(cle), personnes }))
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
    joursAuDela(presences, capacite).map((j) => versTexteJour(j.jour)),
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
 * les demandes en cours. `AVAIL` (lot 3) fera de même, avec ses sept autres
 * règles autour.
 */
export function tientDansLaCapacite(
  presences: readonly Presence[],
  capacite: number,
  ajout: { readonly arrivee: Date; readonly depart: Date; readonly personnes: number },
): boolean {
  const occupation = occupationParJour(presences)

  return joursOccupes(ajout.arrivee, ajout.depart).every(
    (jour) =>
      (occupation.get(versTexteJour(jour)) ?? 0) + ajout.personnes <= capacite,
  )
}
