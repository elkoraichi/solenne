import { describe, expect, it } from 'vitest'

import { elementsDeLaConsole, elementsDuCercle } from '@/domain/calendar/elements'
import { jour } from '@/domain/core/dates'
import type { SejourDetaille, SejourNomme } from '@/domain/privacy/visibilite'

/**
 * `CAL` — ce qui entre dans l'agenda.
 *
 * L'agenda ne filtre rien (CAL-R1) : il reçoit ce que `PRIV` a bien voulu
 * envoyer et le met en forme. Ce fichier vérifie qu'il ne **rajoute** rien non
 * plus — une bande « Maison occupée » qui gagnerait un nom en chemin serait une
 * fuite, quand bien même la donnée serait arrivée jusqu'ici par un autre canal.
 */

const RIEN = {
  indisponibilites: [],
  occupations: [],
  sejours: [],
  mesDemandes: [],
} as const

function nomme(modifications: Partial<SejourNomme> = {}): SejourNomme {
  return {
    nature: 'NOMME',
    du: jour('2026-09-10'),
    au: jour('2026-09-12'),
    qui: 'Marc',
    personnes: 4,
    ...modifications,
  }
}

function detaille(
  modifications: Partial<SejourDetaille> = {},
): SejourDetaille {
  return {
    nature: 'COMPLET',
    id: 'sej-1',
    du: jour('2026-09-10'),
    au: jour('2026-09-12'),
    qui: 'Marc',
    adultes: 2,
    enfants: 2,
    personnes: 4,
    motif: 'Week-end en famille',
    commentaire: 'Arrivée tardive',
    besoins: null,
    niveau: 'BUSY_ONLY',
    estSejourDeSolenne: false,
    estLeMien: false,
    ...modifications,
  }
}

describe('CAL-001 — ce que le cercle voit posé sur l’agenda', () => {
  it('range chaque source dans sa catégorie', () => {
    const elements = elementsDuCercle({
      indisponibilites: [{ du: jour('2026-09-01'), au: jour('2026-09-03') }],
      occupations: [{ du: jour('2026-09-05'), au: jour('2026-09-08') }],
      sejours: [nomme()],
      mesDemandes: [
        {
          id: 'dem-1',
          du: jour('2026-09-20'),
          au: jour('2026-09-22'),
          personnes: 2,
        },
      ],
    })

    expect(elements.map((element) => element.categorie)).toEqual([
      'INDISPONIBLE',
      'OCCUPEE',
      'SEJOUR',
      'MA_DEMANDE',
    ])
  })

  it('nomme un séjour `FULL` et compte ses personnes', () => {
    const [element] = elementsDuCercle({ ...RIEN, sejours: [nomme()] })
    expect(element?.titre).toBe('Marc')
    expect(element?.precision).toBe('4 personnes')
  })

  it('accorde le singulier', () => {
    const [element] = elementsDuCercle({
      ...RIEN,
      sejours: [nomme({ personnes: 1 })],
    })
    expect(element?.precision).toBe('1 personne')
  })

  it('donne à une bande anonyme un titre qui ne dit rien de plus', () => {
    const [element] = elementsDuCercle({
      ...RIEN,
      occupations: [{ du: jour('2026-09-05'), au: jour('2026-09-08') }],
    })
    expect(element?.titre).toBe('Maison occupée')
    expect(element?.precision ?? null).toBeNull()
  })

  it('reconnaît le séjour de celui qui regarde', () => {
    const [element] = elementsDuCercle({
      ...RIEN,
      sejours: [detaille({ estLeMien: true })],
    })
    expect(element?.titre).toBe('Votre séjour')
    expect(element?.categorie).toBe('SEJOUR')
  })
})

describe('CAL-016 — l’agenda ne rajoute rien à ce qu’il a reçu', () => {
  it('ne fait apparaître ni motif ni commentaire dans un élément', () => {
    const elements = elementsDuCercle({
      ...RIEN,
      sejours: [detaille({ estLeMien: true })],
    })
    const texte = JSON.stringify(elements)
    expect(texte).not.toContain('Week-end en famille')
    expect(texte).not.toContain('Arrivée tardive')
  })

  it('ne porte aucun identifiant sur une bande anonyme', () => {
    const [element] = elementsDuCercle({
      ...RIEN,
      occupations: [{ du: jour('2026-09-05'), au: jour('2026-09-08') }],
    })
    expect(element?.lien ?? null).toBeNull()
    expect(JSON.stringify(element)).not.toContain('sej-1')
  })
})

describe('CAL-006 — un agenda vide', () => {
  it('ne produit aucun élément plutôt qu’un élément vide', () => {
    expect(elementsDuCercle({ ...RIEN })).toHaveLength(0)
    expect(
      elementsDeLaConsole({ indisponibilites: [], sejours: [] }),
    ).toHaveLength(0)
  })
})

describe('La console de Solenne', () => {
  it('distingue ses propres séjours de ceux du cercle', () => {
    const elements = elementsDeLaConsole({
      indisponibilites: [],
      sejours: [
        detaille({ id: 'a', qui: 'Marc' }),
        detaille({ id: 'b', qui: 'Solenne', estSejourDeSolenne: true }),
      ],
    })
    // L'adaptateur conserve l'ordre reçu : le tri appartient au moteur de grille.
    expect(
      elements.map((element) => [element.titre, element.categorie]),
    ).toEqual([
      ['Marc', 'SEJOUR'],
      ['Solenne', 'SEJOUR_SOLENNE'],
    ])
  })

  it('lui signale un séjour que le cercle ne voit pas', () => {
    const [element] = elementsDeLaConsole({
      indisponibilites: [],
      sejours: [detaille({ niveau: 'HIDDEN' })],
    })
    expect(element?.precision).toContain('invisible pour le cercle')
  })

  it('ne renvoie vers aucune page de séjour tant qu’il n’en existe pas', () => {
    // La fiche d'un séjour est le module `STAY` (lot 3.6). Un lien posé
    // maintenant mènerait à une page absente : mieux vaut pas de lien du tout
    // qu'un lien mort.
    const [element] = elementsDeLaConsole({
      indisponibilites: [],
      sejours: [detaille({ id: 'sej-9' })],
    })
    expect(element?.lien ?? null).toBeNull()
  })
})
