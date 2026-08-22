import { describe, expect, it } from 'vitest'

import { jour as leJour } from '@/domain/core/dates'
import {
  estNiveauVisibilite,
  LIBELLE_NIVEAU,
  MENTION_OCCUPEE,
  niveauParDefaut,
  NIVEAU_PAR_DEFAUT,
  NIVEAU_PAR_DEFAUT_SOLENNE,
  NIVEAUX_VISIBILITE,
  vueDesSejours,
  type Regard,
  type SejourPrive,
} from '@/domain/privacy/visibilite'

/**
 * `PRIV` — la part pure : qui voit quoi d'un séjour.
 *
 * Ces tests n'ont pas de base de données. Ils tiennent la décision D4 sur des
 * objets nus : ce qui n'apparaît pas ici ne pourra jamais apparaître à l'écran.
 */

const MARC = 'utilisateur-marc'
const JULIE = 'utilisateur-julie'
const SOLENNE = 'utilisateur-solenne'

const amiMarc: Regard = { id: MARC, estAdministratrice: false }
const amieJulie: Regard = { id: JULIE, estAdministratrice: false }
const solenne: Regard = { id: SOLENNE, estAdministratrice: true }

function sejour(partiel: Partial<SejourPrive> = {}): SejourPrive {
  return {
    id: 'sejour-1',
    proprietaireId: MARC,
    qui: 'Marc',
    du: leJour('2026-09-10'),
    au: leJour('2026-09-12'),
    adultes: 3,
    enfants: 1,
    personnes: 4,
    motif: 'Week-end famille',
    commentaire: 'On arrivera tard le vendredi',
    besoins: 'Un lit parapluie',
    niveau: 'BUSY_ONLY',
    estSejourDeSolenne: false,
    ...partiel,
  }
}

describe('niveaux de visibilité', () => {
  it('en compte trois, et le défaut est « Maison occupée » (D4)', () => {
    expect(NIVEAUX_VISIBILITE).toEqual(['HIDDEN', 'BUSY_ONLY', 'FULL'])
    expect(NIVEAU_PAR_DEFAUT).toBe('BUSY_ONLY')
  })

  it('nomme chaque niveau en français, sans jargon', () => {
    for (const niveau of NIVEAUX_VISIBILITE) {
      expect(LIBELLE_NIVEAU[niveau]).toMatch(/\p{L}/u)
      expect(LIBELLE_NIVEAU[niveau]).not.toMatch(/[A-Z_]{4,}/)
    }
  })

  it('refuse un niveau inventé', () => {
    expect(estNiveauVisibilite('BUSY_ONLY')).toBe(true)
    expect(estNiveauVisibilite('PUBLIC')).toBe(false)
    expect(estNiveauVisibilite(null)).toBe(false)
  })
})

describe('le niveau qu’un séjour prend à sa création', () => {
  it('« Maison occupée » pour un ami, sans réglage enregistré (D4)', () => {
    expect(niveauParDefaut()).toBe('BUSY_ONLY')
    expect(niveauParDefaut({ estSejourDeSolenne: false, reglage: null })).toBe(
      'BUSY_ONLY',
    )
  })

  it('suit le réglage global pour un séjour du cercle', () => {
    expect(niveauParDefaut({ reglage: 'HIDDEN' })).toBe('HIDDEN')
    expect(niveauParDefaut({ reglage: 'FULL' })).toBe('FULL')
  })

  it('« prénom et nombre » pour un séjour de Solenne : c’est sa maison', () => {
    expect(NIVEAU_PAR_DEFAUT_SOLENNE).toBe('FULL')
    expect(niveauParDefaut({ estSejourDeSolenne: true })).toBe('FULL')
  })

  it('ne laisse pas le réglage du cercle abaisser celui de Solenne', () => {
    // Le réglage global répond à « ce que mes amis montrent d’eux », pas à
    // « ce que je montre de moi ». Elle décide des siens séjour par séjour.
    expect(
      niveauParDefaut({ estSejourDeSolenne: true, reglage: 'HIDDEN' }),
    ).toBe('FULL')
    expect(
      niveauParDefaut({ estSejourDeSolenne: true, reglage: 'BUSY_ONLY' }),
    ).toBe('FULL')
  })

  it('reste un point de départ : un séjour existant garde son niveau', () => {
    // Le défaut ne se lit qu’à la création — `vueDesSejours` ne l’appelle pas.
    const cache = sejour({
      proprietaireId: SOLENNE,
      estSejourDeSolenne: true,
      niveau: 'HIDDEN',
    })
    expect(vueDesSejours([cache], amiMarc).sejours).toEqual([])
    expect(vueDesSejours([cache], amiMarc).occupations).toEqual([])
  })
})

describe('PRIV-001 — ce qu’un ami reçoit par défaut', () => {
  it('des dates, et rien d’autre', () => {
    const vue = vueDesSejours([sejour()], amieJulie)

    expect(vue.sejours).toEqual([])
    expect(vue.occupations).toEqual([
      { du: leJour('2026-09-10'), au: leJour('2026-09-12') },
    ])
  })

  it('la charge utile ne contient ni prénom, ni effectif, ni identifiant', () => {
    const vue = vueDesSejours(
      [
        sejour(),
        sejour({ id: 'sejour-2', proprietaireId: JULIE, qui: 'Julie' }),
      ],
      { id: 'utilisateur-lea', estAdministratrice: false },
    )

    const charge = JSON.stringify(vue)
    for (const interdit of [
      'Marc',
      'Julie',
      'sejour-1',
      'sejour-2',
      MARC,
      JULIE,
      'Week-end famille',
      'lit parapluie',
    ]) {
      expect(charge).not.toContain(interdit)
    }
  })
})

describe('PRIV-002 — Solenne voit tout', () => {
  it('nom, effectif, motif, commentaire et besoins', () => {
    const vue = vueDesSejours([sejour()], solenne)

    expect(vue.occupations).toEqual([])
    expect(vue.sejours).toHaveLength(1)
    expect(vue.sejours[0]).toMatchObject({
      nature: 'COMPLET',
      qui: 'Marc',
      personnes: 4,
      adultes: 3,
      enfants: 1,
      motif: 'Week-end famille',
      commentaire: 'On arrivera tard le vendredi',
      besoins: 'Un lit parapluie',
      estLeMien: false,
    })
  })

  it('y compris un séjour caché — le niveau ne s’applique pas à elle', () => {
    const vue = vueDesSejours([sejour({ niveau: 'HIDDEN' })], solenne)
    expect(vue.sejours).toHaveLength(1)
  })
})

describe('PRIV-003 — chacun voit son propre séjour en entier', () => {
  it('même quand le niveau le cacherait aux autres', () => {
    const vue = vueDesSejours([sejour({ niveau: 'HIDDEN' })], amiMarc)

    expect(vue.occupations).toEqual([])
    expect(vue.sejours[0]).toMatchObject({
      nature: 'COMPLET',
      qui: 'Marc',
      commentaire: 'On arrivera tard le vendredi',
      estLeMien: true,
    })
  })

  it('sans que le séjour d’à côté déteigne', () => {
    const vue = vueDesSejours(
      [
        sejour(),
        sejour({
          id: 'sejour-2',
          proprietaireId: JULIE,
          qui: 'Julie',
          du: leJour('2026-09-20'),
          au: leJour('2026-09-22'),
        }),
      ],
      amiMarc,
    )

    expect(vue.sejours).toHaveLength(1)
    expect(vue.sejours[0]).toMatchObject({ estLeMien: true })
    expect(vue.occupations).toEqual([
      { du: leJour('2026-09-20'), au: leJour('2026-09-22') },
    ])
  })
})

describe('PRIV-004 — un séjour caché n’apparaît pas du tout', () => {
  it('ni nommé, ni en bande « Maison occupée »', () => {
    const vue = vueDesSejours(
      [
        sejour({
          proprietaireId: SOLENNE,
          qui: 'Solenne',
          niveau: 'HIDDEN',
          estSejourDeSolenne: true,
        }),
      ],
      amiMarc,
    )

    expect(vue.sejours).toEqual([])
    expect(vue.occupations).toEqual([])
  })
})

describe('PRIV-006 — niveau FULL', () => {
  it('donne le prénom et l’effectif, jamais le commentaire', () => {
    const vue = vueDesSejours([sejour({ niveau: 'FULL' })], amieJulie)

    expect(vue.occupations).toEqual([])
    expect(vue.sejours).toEqual([
      {
        nature: 'NOMME',
        du: leJour('2026-09-10'),
        au: leJour('2026-09-12'),
        qui: 'Marc',
        personnes: 4,
      },
    ])
    expect(JSON.stringify(vue)).not.toContain('On arrivera tard')
    expect(JSON.stringify(vue)).not.toContain('lit parapluie')
    expect(JSON.stringify(vue)).not.toContain(MARC)
  })
})

describe('PRIV-007 — deux séjours simultanés', () => {
  it('ne font qu’une seule mention, sans décompte', () => {
    const vue = vueDesSejours(
      [
        sejour({ du: leJour('2026-09-10'), au: leJour('2026-09-13') }),
        sejour({
          id: 'sejour-2',
          proprietaireId: JULIE,
          qui: 'Julie',
          personnes: 3,
          du: leJour('2026-09-11'),
          au: leJour('2026-09-15'),
        }),
      ],
      { id: 'utilisateur-lea', estAdministratrice: false },
    )

    expect(vue.occupations).toEqual([
      { du: leJour('2026-09-10'), au: leJour('2026-09-15') },
    ])
    expect(vue.sejours).toEqual([])
  })

  it('mais deux périodes disjointes restent deux bandes', () => {
    const vue = vueDesSejours(
      [
        sejour({ du: leJour('2026-09-10'), au: leJour('2026-09-12') }),
        sejour({
          id: 'sejour-2',
          proprietaireId: JULIE,
          du: leJour('2026-09-20'),
          au: leJour('2026-09-22'),
        }),
      ],
      { id: 'utilisateur-lea', estAdministratrice: false },
    )

    expect(vue.occupations).toHaveLength(2)
  })
})

describe('PRIV-R6 — aucune inférence possible', () => {
  it('la mention est la même quel que soit l’effectif', () => {
    const petite = vueDesSejours([sejour({ personnes: 1 })], amieJulie)
    const grande = vueDesSejours([sejour({ personnes: 9 })], amieJulie)

    expect(petite).toEqual(grande)
    expect(MENTION_OCCUPEE).toBe('Maison occupée')
  })

  it('aucun nombre ne traverse la vue d’un ami', () => {
    const vue = vueDesSejours(
      [sejour({ personnes: 7, adultes: 5, enfants: 2 })],
      amieJulie,
    )
    expect(JSON.stringify(vue)).not.toMatch(/"(personnes|adultes|enfants)"/)
  })
})
