/**
 * Manipulation des dates — logique pure, aucune dépendance.
 *
 * Deux natures de valeur, jamais mélangées :
 *
 *   · un **jour** (arrivée, départ, période bloquée) est une date nue. Il est
 *     représenté par un `Date` calé à minuit UTC. Aucun fuseau n'intervient :
 *     « le 25 octobre » est le 25 octobre partout.
 *   · un **instant** (début d'un événement, horodatage) est un point du temps
 *     stocké en UTC et affiché en `Europe/Paris` (CORE-R5).
 *
 * Convention `[arrivée, départ[` (CORE-R6) : le jour du départ n'est pas occupé.
 */

export const FUSEAU_PARIS = 'Europe/Paris'
export const LOCALE = 'fr-FR'

const MS_PAR_JOUR = 86_400_000
const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/

// ---------------------------------------------------------------------------
// Jours
// ---------------------------------------------------------------------------

/** Construit un jour à partir de `AAAA-MM-JJ`. Lève si le format est invalide. */
export function jour(texte: string): Date {
  if (!FORMAT_JOUR.test(texte)) {
    throw new RangeError(`Jour invalide : « ${texte} » (attendu AAAA-MM-JJ)`)
  }
  const [a, m, j] = texte.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(a, m - 1, j))
  if (
    date.getUTCFullYear() !== a ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== j
  ) {
    throw new RangeError(`Jour inexistant : « ${texte} »`)
  }
  return date
}

/** `AAAA-MM-JJ` d'un jour. */
export function versTexteJour(valeur: Date): string {
  const a = String(valeur.getUTCFullYear()).padStart(4, '0')
  const m = String(valeur.getUTCMonth() + 1).padStart(2, '0')
  const j = String(valeur.getUTCDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

/** Ramène un `Date` quelconque au jour UTC qui le contient. */
export function debutDeJour(valeur: Date): Date {
  return new Date(
    Date.UTC(
      valeur.getUTCFullYear(),
      valeur.getUTCMonth(),
      valeur.getUTCDate(),
    ),
  )
}

export function ajouterJours(valeur: Date, nombre: number): Date {
  return new Date(debutDeJour(valeur).getTime() + nombre * MS_PAR_JOUR)
}

/**
 * Nombre de nuits entre une arrivée et un départ.
 *
 * Le calcul porte sur des jours calés à minuit UTC : il ne dépend d'aucun
 * changement d'heure saisonnier (CORE-011).
 */
export function nombreDeNuits(arrivee: Date, depart: Date): number {
  const a = debutDeJour(arrivee).getTime()
  const d = debutDeJour(depart).getTime()
  return Math.round((d - a) / MS_PAR_JOUR)
}

/** Les jours effectivement occupés par `[arrivée, départ[`. */
export function joursOccupes(arrivee: Date, depart: Date): Date[] {
  const jours: Date[] = []
  const fin = debutDeJour(depart).getTime()
  for (
    let courant = debutDeJour(arrivee).getTime();
    courant < fin;
    courant += MS_PAR_JOUR
  ) {
    jours.push(new Date(courant))
  }
  return jours
}

/**
 * Test de chevauchement de deux intervalles semi-ouverts.
 * Un départ le 20 et une arrivée le 20 ne se chevauchent pas.
 */
export function chevauchent(
  debutA: Date,
  finA: Date,
  debutB: Date,
  finB: Date,
): boolean {
  return debutA.getTime() < finB.getTime() && debutB.getTime() < finA.getTime()
}

/** Jour de la semaine au sens ISO : 1 = lundi … 7 = dimanche. */
export function jourDeSemaine(valeur: Date): number {
  const js = debutDeJour(valeur).getUTCDay()
  return js === 0 ? 7 : js
}

// ---------------------------------------------------------------------------
// Instants ↔ jour parisien
// ---------------------------------------------------------------------------

const partiesParis = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU_PARIS,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Le jour parisien qui contient un instant.
 * Un événement du 14 juillet 23 h 00 (Paris) reste le 14 juillet, alors que
 * son instant UTC est déjà le 15.
 */
export function jourParisienDe(instant: Date): Date {
  return jour(partiesParis.format(instant))
}

const partiesCompletesParis = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU_PARIS,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Décalage de Paris par rapport à UTC, en millisecondes, à un instant donné. */
function decalageParis(instant: Date): number {
  const parties = Object.fromEntries(
    partiesCompletesParis
      .formatToParts(instant)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>

  const commeUtc = Date.UTC(
    parties.year ?? 1970,
    (parties.month ?? 1) - 1,
    parties.day ?? 1,
    parties.hour ?? 0,
    parties.minute ?? 0,
    parties.second ?? 0,
  )
  return commeUtc - instant.getTime()
}

/**
 * Construit l'instant UTC correspondant à une heure lue sur une horloge
 * parisienne. « Le 25 octobre à 18 h » ne désigne pas le même instant selon
 * qu'on est en heure d'été ou d'hiver : c'est ici que la question se règle,
 * une fois pour toutes.
 */
export function instantDepuisHeureParis(
  jourLocal: Date,
  heures: number,
  minutes = 0,
): Date {
  const base = debutDeJour(jourLocal).getTime() + heures * 3_600_000 + minutes * 60_000
  // Première approximation avec le décalage à cet instant supposé, puis
  // correction : deux passes suffisent, y compris les nuits de changement d'heure.
  let candidat = new Date(base - decalageParis(new Date(base)))
  candidat = new Date(base - decalageParis(candidat))
  return candidat
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

const formateurs = new Map<string, Intl.DateTimeFormat>()

function formateur(cle: string, options: Intl.DateTimeFormatOptions) {
  let f = formateurs.get(cle)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, options)
    formateurs.set(cle, f)
  }
  return f
}

/**
 * Met en forme un jour, en disant « 1er » là où le français le dit.
 *
 * `Intl` écrit « 1 septembre ». Personne ne parle ainsi : le premier jour du
 * mois est le seul à porter son rang. La correction se fait sur la **partie**
 * `day` du résultat, jamais sur la chaîne entière — sans quoi un millésime ou
 * une heure commençant par 1 y passerait aussi.
 */
function mettreEnForme(
  cle: string,
  options: Intl.DateTimeFormatOptions,
  valeur: Date,
): string {
  return formateur(cle, options)
    .formatToParts(valeur)
    .map((part) => (part.type === 'day' && part.value === '1' ? '1er' : part.value))
    .join('')
}

/** « samedi 25 octobre 2026 » — pour un jour. */
export function formaterJourLong(valeur: Date): string {
  return mettreEnForme(
    'jour-long',
    {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
    debutDeJour(valeur),
  )
}

/** « 25 oct. » — pour un jour, en contexte compact. */
export function formaterJourCourt(valeur: Date): string {
  return mettreEnForme(
    'jour-court',
    { timeZone: 'UTC', day: 'numeric', month: 'short' },
    debutDeJour(valeur),
  )
}

/** « 25/10/2026 » — pour un jour. */
export function formaterJourNumerique(valeur: Date): string {
  return formateur('jour-num', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(debutDeJour(valeur))
}

/** « 25 octobre 2026 à 18:30 » — pour un instant, en heure de Paris. */
export function formaterInstant(valeur: Date): string {
  return mettreEnForme(
    'instant',
    {
      timeZone: FUSEAU_PARIS,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
    valeur,
  )
}

/** « 18:30 » — pour un instant, en heure de Paris. */
export function formaterHeure(valeur: Date): string {
  return formateur('heure', {
    timeZone: FUSEAU_PARIS,
    hour: '2-digit',
    minute: '2-digit',
  }).format(valeur)
}

/** « du 25 au 27 octobre 2026 » — un séjour, lisible d'un coup d'œil. */
export function formaterPeriode(arrivee: Date, depart: Date): string {
  const a = debutDeJour(arrivee)
  const d = debutDeJour(depart)
  const memeMois =
    a.getUTCFullYear() === d.getUTCFullYear() &&
    a.getUTCMonth() === d.getUTCMonth()

  if (memeMois) {
    const jourSeul = mettreEnForme(
      'jour-seul',
      { timeZone: 'UTC', day: 'numeric' },
      a,
    )
    return `du ${jourSeul} au ${formaterJourLongSansJourSemaine(d)}`
  }
  return `du ${formaterJourLongSansJourSemaine(a)} au ${formaterJourLongSansJourSemaine(d)}`
}

function formaterJourLongSansJourSemaine(valeur: Date): string {
  return mettreEnForme(
    'jour-long-sans-semaine',
    { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' },
    debutDeJour(valeur),
  )
}
