import { describe, expect, it } from 'vitest'

import {
  apercuDuJour,
  CATEGORIES_AGENDA,
  elementsDuJour,
  grilleDeSemaine,
  grilleDuMois,
  jourDepuisTexte,
  joursDeLElement,
  libelleMois,
  MARQUE_CATEGORIE,
  moisDepuisTexte,
  moisPrecedent,
  moisSuivant,
  mouvementsDuJour,
  versTexteMois,
  type ElementAgenda,
  type GrilleMois,
} from '@/domain/calendar/grille'
import { jour, nombreDeNuits, versTexteJour } from '@/domain/core/dates'

/**
 * `CAL` — le moteur de grille, en logique pure.
 *
 * Ce fichier ne teste aucun pixel. Il teste la seule chose qu'un agenda peut
 * vraiment rater : **poser une donnée sur le mauvais jour**. Convention
 * `[arrivée, départ[` (CAL-R2), départ et arrivée le même jour (CAL-R3),
 * changement d'heure (CAL-R5), mois affiché sur six semaines.
 *
 * Le risque « décalage d'un jour » du §9 de la fiche se joue ici, pas à l'écran.
 */

function sejour(cle: string, du: string, au: string): ElementAgenda {
  return {
    cle,
    categorie: 'SEJOUR',
    titre: cle,
    du: jour(du),
    au: jour(au),
  }
}

function joursDe(grille: GrilleMois): string[] {
  return grille.semaines.flatMap((semaine) =>
    semaine.jours.map((jour) => jour.cle),
  )
}

function segmentsDe(grille: GrilleMois, cle: string) {
  return grille.semaines.flatMap((semaine) =>
    semaine.segments.filter((segment) => segment.element.cle === cle),
  )
}

// ---------------------------------------------------------------------------
// CAL-004 — les bornes d'un séjour
// ---------------------------------------------------------------------------

describe('CAL-004 — bornes d’un séjour', () => {
  const marc = sejour('marc', '2026-09-10', '2026-09-12')

  it('occupe le 10 et le 11, jamais le 12', () => {
    expect(joursDeLElement(marc).map(versTexteJour)).toEqual([
      '2026-09-10',
      '2026-09-11',
    ])
  })

  it('laisse le jour du départ libre dans la grille', () => {
    expect(elementsDuJour([marc], jour('2026-09-11'))).toHaveLength(1)
    expect(elementsDuJour([marc], jour('2026-09-12'))).toHaveLength(0)
  })

  it('n’étale pas la bande sur le jour du départ', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, [marc])
    const [segment] = segmentsDe(grille, 'marc')
    expect(segment).toBeDefined()
    expect(segment?.longueur).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// CAL-005 — départ et arrivée le même jour
// ---------------------------------------------------------------------------

describe('CAL-005 — un départ et une arrivée le même jour', () => {
  const partant = sejour('partant', '2026-09-08', '2026-09-10')
  const arrivant = sejour('arrivant', '2026-09-10', '2026-09-12')
  const elements = [partant, arrivant]

  it('n’attribue le 10 qu’à celui qui arrive', () => {
    const presents = elementsDuJour(elements, jour('2026-09-10'))
    expect(presents.map((element) => element.cle)).toEqual(['arrivant'])
  })

  it('sait dire qui part et qui arrive, sans parler de conflit', () => {
    const mouvements = mouvementsDuJour(elements, jour('2026-09-10'))
    expect(mouvements.departs.map((e) => e.cle)).toEqual(['partant'])
    expect(mouvements.arrivees.map((e) => e.cle)).toEqual(['arrivant'])
  })

  it('les pose sur la même ligne — la transition se lit d’un trait', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, elements)
    const [avant] = segmentsDe(grille, 'partant')
    const [apres] = segmentsDe(grille, 'arrivant')
    expect(avant?.rangee).toBe(0)
    expect(apres?.rangee).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// CAL-011 — le changement d'heure
// ---------------------------------------------------------------------------

describe('CAL-011 — nuit de changement d’heure', () => {
  // Le 25 octobre 2026, Paris repasse à l'heure d'hiver : la nuit dure 25 h.
  const week = sejour('automne', '2026-10-24', '2026-10-27')

  it('compte trois nuits, sans en gagner ni en perdre une', () => {
    expect(nombreDeNuits(week.du, week.au)).toBe(3)
    expect(joursDeLElement(week).map(versTexteJour)).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ])
  })

  it('n’introduit aucun décalage dans la grille', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 10 }, [week])
    const segments = segmentsDe(grille, 'automne')
    // Le 24 est un samedi : la bande se coupe au dimanche soir et reprend lundi.
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({
      colonne: 6,
      longueur: 2,
      continueApres: true,
      continueAvant: false,
    })
    expect(segments[1]).toMatchObject({
      colonne: 1,
      longueur: 1,
      continueAvant: true,
      continueApres: false,
    })
  })
})

// ---------------------------------------------------------------------------
// La grille elle-même
// ---------------------------------------------------------------------------

describe('Grille du mois', () => {
  it('commence toujours un lundi et finit un dimanche', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, [])
    const jours = joursDe(grille)
    expect(jours.at(0)).toBe('2026-08-31')
    expect(jours.at(-1)).toBe('2026-10-04')
    expect(jours).toHaveLength(35)
  })

  it('affiche six semaines quand le mois l’exige', () => {
    // Août 2026 commence un samedi et dure 31 jours : six lignes, pas cinq.
    const grille = grilleDuMois({ annee: 2026, mois: 8 }, [])
    expect(grille.semaines).toHaveLength(6)
    expect(joursDe(grille).at(0)).toBe('2026-07-27')
    expect(joursDe(grille).at(-1)).toBe('2026-09-06')
  })

  it('distingue les jours du mois de ceux des mois voisins', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, [])
    const dehors = grille.semaines
      .flatMap((semaine) => semaine.jours)
      .filter((jour) => !jour.dansLeMois)
      .map((jour) => jour.cle)
    expect(dehors).toEqual([
      '2026-08-31',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('marque le jour courant, et lui seul', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, [], {
      aujourdhui: jour('2026-09-12'),
    })
    const marques = grille.semaines
      .flatMap((semaine) => semaine.jours)
      .filter((jour) => jour.estAujourdhui)
      .map((jour) => jour.cle)
    expect(marques).toEqual(['2026-09-12'])
  })

  it('empile deux éléments qui se chevauchent sur deux lignes', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, [
      sejour('a', '2026-09-08', '2026-09-12'),
      sejour('b', '2026-09-09', '2026-09-11'),
    ])
    expect(segmentsDe(grille, 'a')[0]?.rangee).toBe(0)
    expect(segmentsDe(grille, 'b')[0]?.rangee).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// CAL-007 / CAL-008 — les éléments à cheval
// ---------------------------------------------------------------------------

describe('CAL-007 — séjour à cheval sur deux mois', () => {
  // Le 28 septembre est un lundi ; la bande court jusqu'au 2 octobre inclus.
  const rentree = sejour('rentree', '2026-09-28', '2026-10-03')

  it('est posé au bon endroit dans la grille de septembre', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, [rentree])
    expect(segmentsDe(grille, 'rentree')).toHaveLength(1)
    expect(segmentsDe(grille, 'rentree')[0]).toMatchObject({
      colonne: 1,
      longueur: 5,
    })
  })

  it('est posé au même endroit dans la grille d’octobre', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 10 }, [rentree])
    expect(segmentsDe(grille, 'rentree')[0]).toMatchObject({
      colonne: 1,
      longueur: 5,
    })
  })

  it('n’occupe ni le 3 octobre, ni au-delà', () => {
    expect(elementsDuJour([rentree], jour('2026-10-02'))).toHaveLength(1)
    expect(elementsDuJour([rentree], jour('2026-10-03'))).toHaveLength(0)
  })

  it('montre les jours d’octobre pour ce qu’ils sont — hors du mois affiché', () => {
    const grille = grilleDuMois({ annee: 2026, mois: 9 }, [rentree])
    const premierOctobre = grille.semaines
      .flatMap((semaine) => semaine.jours)
      .find((jour) => jour.cle === '2026-10-01')
    expect(premierOctobre?.dansLeMois).toBe(false)
  })
})

describe('CAL-008 — séjour à cheval sur deux années', () => {
  const nouvelAn = sejour('nouvel-an', '2026-12-30', '2027-01-02')

  it('apparaît des deux côtés du 31 décembre', () => {
    expect(
      segmentsDe(grilleDuMois({ annee: 2026, mois: 12 }, [nouvelAn]), 'nouvel-an'),
    ).not.toHaveLength(0)
    expect(
      segmentsDe(grilleDuMois({ annee: 2027, mois: 1 }, [nouvelAn]), 'nouvel-an'),
    ).not.toHaveLength(0)
  })

  it('n’occupe pas le 2 janvier', () => {
    expect(joursDeLElement(nouvelAn).map(versTexteJour)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ])
  })
})

// ---------------------------------------------------------------------------
// CAL-009 — journée chargée
// ---------------------------------------------------------------------------

describe('CAL-009 — six éléments le même jour', () => {
  const charge = Array.from({ length: 6 }, (_, index) =>
    sejour(`e${index}`, '2026-09-12', '2026-09-14'),
  )

  it('n’en montre que ce qui tient, et compte le reste', () => {
    const apercu = apercuDuJour(charge, jour('2026-09-12'), 3)
    expect(apercu.visibles).toHaveLength(3)
    expect(apercu.reste).toBe(3)
  })

  it('ne compte aucun reste quand tout tient', () => {
    const apercu = apercuDuJour(charge.slice(0, 2), jour('2026-09-12'), 3)
    expect(apercu.visibles).toHaveLength(2)
    expect(apercu.reste).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// CAL-R4 — se distinguer sans la couleur
// ---------------------------------------------------------------------------

describe('CAL-R4 — chaque catégorie a sa marque propre', () => {
  it('donne à chacune un libellé, un symbole et un ton', () => {
    for (const categorie of CATEGORIES_AGENDA) {
      const marque = MARQUE_CATEGORIE[categorie]
      expect(marque.libelle.length).toBeGreaterThan(0)
      expect(marque.symbole.length).toBeGreaterThan(0)
      expect(marque.ton.length).toBeGreaterThan(0)
    }
  })

  it('n’attribue jamais deux fois le même symbole', () => {
    const symboles = CATEGORIES_AGENDA.map(
      (categorie) => MARQUE_CATEGORIE[categorie].symbole,
    )
    expect(new Set(symboles).size).toBe(symboles.length)
  })
})

// ---------------------------------------------------------------------------
// Navigation — la part pure de CAL-012
// ---------------------------------------------------------------------------

describe('Navigation entre mois', () => {
  it('passe d’une année à l’autre dans les deux sens', () => {
    expect(moisSuivant({ annee: 2026, mois: 12 })).toEqual({
      annee: 2027,
      mois: 1,
    })
    expect(moisPrecedent({ annee: 2027, mois: 1 })).toEqual({
      annee: 2026,
      mois: 12,
    })
  })

  it('revient au point de départ après six mois aller-retour', () => {
    let reference = { annee: 2026, mois: 9 }
    for (let i = 0; i < 6; i += 1) reference = moisSuivant(reference)
    for (let i = 0; i < 6; i += 1) reference = moisPrecedent(reference)
    expect(reference).toEqual({ annee: 2026, mois: 9 })
  })

  it('lit et réécrit un mois sous la forme AAAA-MM', () => {
    expect(moisDepuisTexte('2026-09')).toEqual({ annee: 2026, mois: 9 })
    expect(versTexteMois({ annee: 2026, mois: 9 })).toBe('2026-09')
  })

  it('refuse ce qui n’est pas un mois plutôt que d’inventer une date', () => {
    for (const texte of ['', '2026', '2026-13', '2026-00', 'septembre', '26-09']) {
      expect(moisDepuisTexte(texte)).toBeNull()
    }
  })

  it('nomme le mois en français', () => {
    expect(libelleMois({ annee: 2026, mois: 9 })).toBe('septembre 2026')
  })

  it('lit un jour de la semaine affichée, ou rien', () => {
    expect(versTexteJour(jourDepuisTexte('2026-09-10') ?? jour('1970-01-01'))).toBe(
      '2026-09-10',
    )
    for (const texte of ['2026-02-30', '2026-9-10', '', 'demain', '2026-13-01']) {
      expect(jourDepuisTexte(texte)).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// La semaine — même moteur, sept jours
// ---------------------------------------------------------------------------

describe('Grille de la semaine', () => {
  it('part du lundi de la semaine demandée', () => {
    const semaine = grilleDeSemaine(jour('2026-09-10'), [])
    expect(semaine.jours.map((jour) => jour.cle)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ])
  })

  it('y pose les éléments aux mêmes bornes que le mois', () => {
    const semaine = grilleDeSemaine(jour('2026-09-10'), [
      sejour('marc', '2026-09-10', '2026-09-12'),
    ])
    expect(semaine.segments).toHaveLength(1)
    expect(semaine.segments[0]).toMatchObject({ colonne: 4, longueur: 2 })
  })
})
