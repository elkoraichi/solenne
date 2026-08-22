import { chevauchent, joursOccupes, versTexteJour } from '@/domain/core/dates'

/**
 * `BLOCK` — les périodes pendant lesquelles la maison n'accueille personne.
 *
 * Logique pure : aucune de ces fonctions ne lit la base ni ne refuse quoi que
 * ce soit. Elles répondent à des questions, le serveur en tire les conclusions.
 *
 * Deux d'entre elles seront consommées telles quelles par des modules à venir :
 * `blocageSur` est la règle R1 de `AVAIL` (lot 3) — un blocage interdit toute
 * demande sur la période — et `fusionnerPeriodes` est ce que l'agenda (`CAL`)
 * montre à un ami : une seule bande « indisponible », même si Solenne a posé
 * trois blocages qui se recouvrent.
 *
 * Convention `[début, fin[` (CORE-R6) : le jour de fin n'est pas bloqué.
 */

export const TYPES_BLOCAGE = ['MAINTENANCE', 'PERSONAL', 'OTHER'] as const
export type TypeBlocage = (typeof TYPES_BLOCAGE)[number]

/** Ce que Solenne lit dans sa console — le type reste privé (BLOCK-S09). */
export const LIBELLE_TYPE: Readonly<Record<TypeBlocage, string>> = {
  MAINTENANCE: 'Travaux ou entretien',
  PERSONAL: 'Personnel',
  OTHER: 'Autre',
}

export interface Periode {
  readonly du: Date
  readonly au: Date
}

export function estTypeBlocage(valeur: unknown): valeur is TypeBlocage {
  return TYPES_BLOCAGE.includes(valeur as TypeBlocage)
}

/**
 * BLOCK-003 — une période tient debout si elle dure au moins une nuit.
 * Un blocage du 12 au 12 ne bloquerait aucun jour : c'est une saisie inachevée,
 * pas un blocage d'un jour (celui-là s'écrit du 12 au 13).
 */
export function periodeValide(du: Date, au: Date): boolean {
  return au.getTime() > du.getTime()
}

/** BLOCK-004 — période entièrement derrière nous. Signalée, jamais refusée. */
export function estRevolue(periode: Periode, aujourdhui: Date): boolean {
  return periode.au.getTime() <= aujourdhui.getTime()
}

export function seChevauchent(a: Periode, b: Periode): boolean {
  return chevauchent(a.du, a.au, b.du, b.au)
}

/**
 * BLK-R1 — le blocage qui s'oppose à des dates demandées, s'il y en a un.
 *
 * Renvoie le premier trouvé : le refus n'a besoin que d'un motif, et la liste
 * complète n'intéresse que Solenne, qui la lit dans sa console.
 */
export function blocageSur<T extends Periode>(
  blocages: readonly T[],
  arrivee: Date,
  depart: Date,
): T | null {
  return (
    blocages.find((blocage) =>
      chevauchent(blocage.du, blocage.au, arrivee, depart),
    ) ?? null
  )
}

/** Les blocages qui touchent une période donnée — la liste, cette fois. */
export function blocagesSur<T extends Periode>(
  blocages: readonly T[],
  arrivee: Date,
  depart: Date,
): readonly T[] {
  return blocages.filter((blocage) =>
    chevauchent(blocage.du, blocage.au, arrivee, depart),
  )
}

/** L'ensemble des jours bloqués, en clefs `AAAA-MM-JJ`. Un jour n'y est qu'une fois. */
export function joursBloques(
  blocages: readonly Periode[],
): ReadonlySet<string> {
  const jours = new Set<string>()
  for (const blocage of blocages) {
    for (const jour of joursOccupes(blocage.du, blocage.au)) {
      jours.add(versTexteJour(jour))
    }
  }
  return jours
}

/**
 * BLOCK-005 — l'union des périodes, en ordre.
 *
 * Deux blocages qui se chevauchent, ou qui se touchent bout à bout, ne font
 * qu'une seule bande : l'agenda ne doit pas empiler deux fois « indisponible »
 * sur le même jour. C'est aussi la forme envoyée aux amis — elle ne dit ni
 * combien de blocages existent, ni pourquoi (D4).
 */
export function fusionnerPeriodes(
  periodes: readonly Periode[],
): readonly Periode[] {
  const triees = [...periodes]
    .filter((periode) => periodeValide(periode.du, periode.au))
    .sort((a, b) => a.du.getTime() - b.du.getTime())

  const fusion: { du: Date; au: Date }[] = []
  for (const periode of triees) {
    const derniere = fusion.at(-1)
    if (derniere && periode.du.getTime() <= derniere.au.getTime()) {
      if (periode.au.getTime() > derniere.au.getTime()) derniere.au = periode.au
    } else {
      fusion.push({ du: periode.du, au: periode.au })
    }
  }
  return fusion
}
