import {
  ajouterJours,
  debutDeJour,
  joursOccupes,
  jourDeSemaine,
  LOCALE,
  versTexteJour,
} from '@/domain/core/dates'

/**
 * `CAL` — le moteur de l'agenda, en logique pure.
 *
 * Ce fichier ne sait ni qui regarde, ni ce qu'il a le droit de voir : il reçoit
 * des éléments déjà filtrés par `PRIV` et se contente de les poser au bon
 * endroit (CAL-R1 — l'agenda n'ajoute aucun filtrage, il n'en enlève aucun).
 *
 * Il tient trois promesses, et ce sont les seules qu'un agenda puisse trahir :
 *
 *   · **CAL-R2** — convention `[arrivée, départ[`. Un séjour du 10 au 12 occupe
 *     le 10 et le 11. Le 12, la maison est libre : quelqu'un peut arriver.
 *   · **CAL-R3** — un départ et une arrivée le même jour ne sont pas un
 *     conflit. Les deux bandes tiennent sur la même ligne, bout à bout.
 *   · **CAL-R5** — les jours sont des dates nues calées à minuit UTC. Aucune
 *     arithmétique de fuseau n'intervient, donc aucun changement d'heure ne
 *     peut décaler quoi que ce soit. L'heure de Paris n'apparaît que pour les
 *     éléments qui ont vraiment une heure (un événement de 14 h à 18 h).
 */

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

/**
 * `EVENEMENT` est déclaré dès la vague 1 et reste **dormant** : aucun élément
 * ne porte cette catégorie tant que le lot 4 n'existe pas. Même parti que le
 * registre de contributeurs d'`OCCUP` (§6.1) — la vague 2 l'allume, elle ne
 * réécrit rien.
 */
export const CATEGORIES_AGENDA = [
  'INDISPONIBLE',
  'OCCUPEE',
  'SEJOUR',
  'SEJOUR_SOLENNE',
  'MA_DEMANDE',
  'EVENEMENT',
] as const

export type CategorieAgenda = (typeof CATEGORIES_AGENDA)[number]

/**
 * CAL-R4 — chaque catégorie se reconnaît à **un symbole et un mot**, pas
 * seulement à une couleur. Le `ton` est un agrément ; le `symbole` est ce qui
 * reste quand l'écran est en nuances de gris (CAL-015).
 *
 * Le symbole est nommé, pas dessiné : le domaine ne connaît aucune icône. La
 * correspondance vers `lucide-react` se fait dans le composant.
 */
export const MARQUE_CATEGORIE: Readonly<
  Record<
    CategorieAgenda,
    { readonly libelle: string; readonly symbole: string; readonly ton: string }
  >
> = {
  INDISPONIBLE: { libelle: 'Maison fermée', symbole: 'calendrier-barre', ton: 'bois' },
  OCCUPEE: { libelle: 'Maison occupée', symbole: 'porte-fermee', ton: 'contour' },
  SEJOUR: { libelle: 'Séjour', symbole: 'personnes', ton: 'olive' },
  SEJOUR_SOLENNE: { libelle: 'Solenne est là', symbole: 'maison', ton: 'olive' },
  MA_DEMANDE: { libelle: 'Votre demande', symbole: 'sablier', ton: 'terracotta' },
  EVENEMENT: { libelle: 'Événement', symbole: 'fete', ton: 'terracotta' },
}

/** L'ordre d'empilement : ce qui ferme la maison passe devant ce qui l'occupe. */
const PRIORITE: Readonly<Record<CategorieAgenda, number>> = {
  INDISPONIBLE: 0,
  EVENEMENT: 1,
  SEJOUR_SOLENNE: 2,
  SEJOUR: 3,
  OCCUPEE: 4,
  MA_DEMANDE: 5,
}

// ---------------------------------------------------------------------------
// Éléments
// ---------------------------------------------------------------------------

/**
 * Un élément posé sur l'agenda. `du` et `au` sont des **jours**, bornes
 * `[du, au[`. `debut` et `fin` sont des instants, et n'existent que pour un
 * élément à l'heure — un événement du lot 4 (CAL-010). Un séjour n'en a pas :
 * on n'arrive pas chez quelqu'un à 14 h 03.
 */
export interface ElementAgenda {
  readonly cle: string
  readonly categorie: CategorieAgenda
  readonly titre: string
  readonly du: Date
  readonly au: Date
  readonly precision?: string | null
  readonly debut?: Date | null
  readonly fin?: Date | null
  /** Là où mène un clic, quand l'élément a une page à lui. */
  readonly lien?: string | null
}

/** Les jours qu'un élément occupe réellement — CAL-R2, le départ exclu. */
export function joursDeLElement(element: ElementAgenda): readonly Date[] {
  return joursOccupes(element.du, element.au)
}

function couvre(element: ElementAgenda, jourVise: Date): boolean {
  const j = debutDeJour(jourVise).getTime()
  return (
    debutDeJour(element.du).getTime() <= j && j < debutDeJour(element.au).getTime()
  )
}

function ordonner(
  elements: readonly ElementAgenda[],
): readonly ElementAgenda[] {
  return [...elements].sort(
    (a, b) =>
      a.du.getTime() - b.du.getTime() ||
      PRIORITE[a.categorie] - PRIORITE[b.categorie] ||
      a.cle.localeCompare(b.cle),
  )
}

/** Ce qui occupe un jour donné. Le jour d'un départ n'est plus occupé. */
export function elementsDuJour(
  elements: readonly ElementAgenda[],
  jourVise: Date,
): readonly ElementAgenda[] {
  return ordonner(elements).filter((element) => couvre(element, jourVise))
}

/**
 * CAL-R3 — qui part, qui arrive. Deux listes, aucun jugement : un départ et
 * une arrivée le même jour sont l'usage normal d'une maison, pas un incident.
 */
export function mouvementsDuJour(
  elements: readonly ElementAgenda[],
  jourVise: Date,
): {
  readonly arrivees: readonly ElementAgenda[]
  readonly departs: readonly ElementAgenda[]
} {
  const j = debutDeJour(jourVise).getTime()
  const tries = ordonner(elements)
  return {
    arrivees: tries.filter((e) => debutDeJour(e.du).getTime() === j),
    departs: tries.filter((e) => debutDeJour(e.au).getTime() === j),
  }
}

/**
 * CAL-009 — une journée chargée montre ce qui tient et annonce le reste.
 * Le « +N » se lit ici ; le composant ne recompte pas.
 */
export function apercuDuJour(
  elements: readonly ElementAgenda[],
  jourVise: Date,
  limite: number,
): { readonly visibles: readonly ElementAgenda[]; readonly reste: number } {
  const presents = elementsDuJour(elements, jourVise)
  if (limite < 0 || presents.length <= limite) {
    return { visibles: presents, reste: 0 }
  }
  return {
    visibles: presents.slice(0, limite),
    reste: presents.length - limite,
  }
}

// ---------------------------------------------------------------------------
// Repères de mois
// ---------------------------------------------------------------------------

export interface ReferenceMois {
  readonly annee: number
  /** 1 = janvier … 12 = décembre. */
  readonly mois: number
}

const FORMAT_MOIS = /^\d{4}-\d{2}$/

/**
 * Lit un mois écrit `AAAA-MM`. Renvoie `null` sur tout le reste : une adresse
 * trafiquée ne doit pas produire un agenda de l'an 0, elle doit ne rien
 * produire du tout — l'appelant retombe alors sur le mois courant.
 */
export function moisDepuisTexte(texte: string): ReferenceMois | null {
  if (!FORMAT_MOIS.test(texte)) return null
  const [annee, mois] = texte.split('-').map(Number) as [number, number]
  if (mois < 1 || mois > 12 || annee < 1970 || annee > 9999) return null
  return { annee, mois }
}

const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/

/**
 * Lit un jour écrit `AAAA-MM-JJ`, ou `null`. Même parti que `moisDepuisTexte` :
 * une adresse abîmée ne fabrique pas une date, elle n'en fabrique aucune.
 */
export function jourDepuisTexte(texte: string): Date | null {
  if (!FORMAT_JOUR.test(texte)) return null
  const [annee, mois, quantieme] = texte.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const candidat = new Date(Date.UTC(annee, mois - 1, quantieme))
  if (
    candidat.getUTCFullYear() !== annee ||
    candidat.getUTCMonth() !== mois - 1 ||
    candidat.getUTCDate() !== quantieme
  ) {
    return null
  }
  return candidat
}

export function versTexteMois(reference: ReferenceMois): string {
  return `${String(reference.annee).padStart(4, '0')}-${String(reference.mois).padStart(2, '0')}`
}

export function decalerMois(
  reference: ReferenceMois,
  nombre: number,
): ReferenceMois {
  const total = reference.annee * 12 + (reference.mois - 1) + nombre
  return { annee: Math.floor(total / 12), mois: (total % 12) + 1 }
}

export function moisPrecedent(reference: ReferenceMois): ReferenceMois {
  return decalerMois(reference, -1)
}

export function moisSuivant(reference: ReferenceMois): ReferenceMois {
  return decalerMois(reference, 1)
}

export function premierJourDuMois(reference: ReferenceMois): Date {
  return new Date(Date.UTC(reference.annee, reference.mois - 1, 1))
}

export function moisDuJour(valeur: Date): ReferenceMois {
  const j = debutDeJour(valeur)
  return { annee: j.getUTCFullYear(), mois: j.getUTCMonth() + 1 }
}

const formateurMois = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
})

/** « septembre 2026 ». */
export function libelleMois(reference: ReferenceMois): string {
  return formateurMois.format(premierJourDuMois(reference))
}

/** Le lundi de la semaine qui contient ce jour. */
export function lundiDeLaSemaine(valeur: Date): Date {
  return ajouterJours(valeur, 1 - jourDeSemaine(valeur))
}

/** « lun. mar. mer. … » — l'en-tête des sept colonnes. */
export const JOURS_DE_SEMAINE: readonly string[] = (() => {
  const formateur = new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC',
    weekday: 'short',
  })
  // 2026-01-05 est un lundi : sept jours à partir de là suffisent à les nommer.
  return Array.from({ length: 7 }, (_, index) =>
    formateur.format(new Date(Date.UTC(2026, 0, 5 + index))),
  )
})()

// ---------------------------------------------------------------------------
// La grille
// ---------------------------------------------------------------------------

export interface CaseJour {
  readonly jour: Date
  /** `AAAA-MM-JJ` — clé de rendu et de test. */
  readonly cle: string
  readonly numero: number
  readonly dansLeMois: boolean
  readonly estAujourdhui: boolean
  readonly estWeekend: boolean
  /** Nombre d'éléments que la place manquante empêche d'afficher (CAL-009). */
  readonly masques: number
}

export interface Segment {
  readonly element: ElementAgenda
  /** 1 = lundi … 7 = dimanche. */
  readonly colonne: number
  readonly longueur: number
  /** L'élément déborde-t-il de cette ligne, à gauche ou à droite ? */
  readonly continueAvant: boolean
  readonly continueApres: boolean
  /** Ligne d'empilement, stable d'une semaine à l'autre. */
  readonly rangee: number
}

export interface SemaineGrille {
  readonly cle: string
  readonly jours: readonly CaseJour[]
  readonly segments: readonly Segment[]
}

export interface GrilleMois {
  readonly reference: ReferenceMois
  readonly libelle: string
  readonly semaines: readonly SemaineGrille[]
}

export interface OptionsGrille {
  /** Le jour à mettre en évidence. Passé en paramètre : le domaine n'a pas d'horloge. */
  readonly aujourdhui?: Date | null
  /** Au-delà, les éléments sont comptés en « +N » plutôt qu'affichés. */
  readonly rangeesMax?: number
}

const RANGEES_MAX_DEFAUT = 3

/**
 * Attribue une ligne à chaque élément, pour toute la période affichée.
 *
 * L'attribution est **globale** et non hebdomadaire : une bande garde la même
 * ligne d'une semaine à l'autre, sinon l'œil perd le fil d'un séjour qui
 * traverse le mois. Deux éléments qui ne se chevauchent pas partagent une
 * ligne — c'est ce qui rend lisible un départ suivi d'une arrivée le même jour
 * (CAL-R3).
 */
function attribuerRangees(
  elements: readonly ElementAgenda[],
): ReadonlyMap<string, number> {
  const rangees = new Map<string, number>()
  const occupees: ElementAgenda[][] = []

  for (const element of ordonner(elements)) {
    let rangee = occupees.findIndex(
      (ligne) =>
        !ligne.some(
          (autre) =>
            debutDeJour(element.du).getTime() < debutDeJour(autre.au).getTime() &&
            debutDeJour(autre.du).getTime() < debutDeJour(element.au).getTime(),
        ),
    )
    if (rangee === -1) {
      rangee = occupees.length
      occupees.push([])
    }
    occupees[rangee]?.push(element)
    rangees.set(element.cle, rangee)
  }

  return rangees
}

function construireSemaine(
  lundi: Date,
  elements: readonly ElementAgenda[],
  rangees: ReadonlyMap<string, number>,
  contexte: {
    readonly mois: number | null
    readonly aujourdhui: Date | null
    readonly rangeesMax: number
  },
): SemaineGrille {
  const debutSemaine = debutDeJour(lundi).getTime()
  const finSemaine = ajouterJours(lundi, 7).getTime()

  const segments: Segment[] = []
  for (const element of ordonner(elements)) {
    const debut = Math.max(debutDeJour(element.du).getTime(), debutSemaine)
    const fin = Math.min(debutDeJour(element.au).getTime(), finSemaine)
    if (fin <= debut) continue

    const rangee = rangees.get(element.cle) ?? 0
    if (rangee >= contexte.rangeesMax) continue

    const colonne = Math.round((debut - debutSemaine) / 86_400_000) + 1
    segments.push({
      element,
      colonne,
      longueur: Math.round((fin - debut) / 86_400_000),
      continueAvant: debutDeJour(element.du).getTime() < debutSemaine,
      continueApres: debutDeJour(element.au).getTime() > finSemaine,
      rangee,
    })
  }

  const jours = Array.from({ length: 7 }, (_, index) => {
    const courant = ajouterJours(lundi, index)
    const masques = elements.filter(
      (element) =>
        couvre(element, courant) &&
        (rangees.get(element.cle) ?? 0) >= contexte.rangeesMax,
    ).length

    return {
      jour: courant,
      cle: versTexteJour(courant),
      numero: courant.getUTCDate(),
      dansLeMois:
        contexte.mois === null || courant.getUTCMonth() + 1 === contexte.mois,
      estAujourdhui:
        contexte.aujourdhui !== null &&
        debutDeJour(contexte.aujourdhui).getTime() === courant.getTime(),
      estWeekend: index >= 5,
      masques,
    } satisfies CaseJour
  })

  return { cle: versTexteJour(lundi), jours, segments }
}

/**
 * La grille d'un mois : des semaines entières de lundi à dimanche, débordant
 * sur les mois voisins. Quatre, cinq ou **six** lignes selon le calendrier —
 * août 2026 commence un samedi et compte 31 jours, il en faut six.
 */
export function grilleDuMois(
  reference: ReferenceMois,
  elements: readonly ElementAgenda[],
  options: OptionsGrille = {},
): GrilleMois {
  const rangeesMax = options.rangeesMax ?? RANGEES_MAX_DEFAUT
  const premier = premierJourDuMois(reference)
  const dernier = new Date(Date.UTC(reference.annee, reference.mois, 0))
  const debut = lundiDeLaSemaine(premier)
  const fin = ajouterJours(lundiDeLaSemaine(dernier), 7)

  const rangees = attribuerRangees(elements)
  const semaines: SemaineGrille[] = []
  for (
    let lundi = debut;
    lundi.getTime() < fin.getTime();
    lundi = ajouterJours(lundi, 7)
  ) {
    semaines.push(
      construireSemaine(lundi, elements, rangees, {
        mois: reference.mois,
        aujourdhui: options.aujourdhui ?? null,
        rangeesMax,
      }),
    )
  }

  return { reference, libelle: libelleMois(reference), semaines }
}

/**
 * La grille d'une semaine — le même moteur, sept jours. Les bornes y sont
 * calculées à l'identique : une vue qui recalculerait ses dates autrement
 * serait une seconde occasion de se tromper d'un jour.
 */
export function grilleDeSemaine(
  jourRepere: Date,
  elements: readonly ElementAgenda[],
  options: OptionsGrille = {},
): SemaineGrille {
  const lundi = lundiDeLaSemaine(jourRepere)
  return construireSemaine(lundi, elements, attribuerRangees(elements), {
    mois: null,
    aujourdhui: options.aujourdhui ?? null,
    rangeesMax: options.rangeesMax ?? Number.POSITIVE_INFINITY,
  })
}
