import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { jour } from '@/domain/core/dates'
import { occupationSur } from '@/domain/occupancy/occupation'
import { REGISTRE, type Presence } from '@/domain/occupancy/registre'

/**
 * `OCCUP-CT-01→08` — **le contrat figé** (garde-fou G2, Mode Opératoire §6.2).
 *
 * Ces huit tests ne décrivent pas un comportement métier : ils décrivent la
 * forme de la réponse et les promesses qu'`AVAIL`, `STAYDEC` et l'agenda ont le
 * droit de tenir pour acquises. Le lot 4 **activera** un contributeur ; il ne
 * doit toucher à aucune ligne de ce fichier. Si l'un d'eux devient rouge, c'est
 * que la formule d'occupation a bougé — pas qu'un test est à ajuster.
 */

function presence(modifications: Partial<Presence> = {}): Presence {
  return {
    contributeur: 'SEJOUR_CONFIRME',
    reference: 'sejour-1',
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    personnes: 4,
    ...modifications,
  }
}

const PERIODE = { debut: jour('2026-09-10'), fin: jour('2026-09-12') }

function somme(detail: Readonly<Record<string, number>>): number {
  return Object.values(detail).reduce((a, b) => a + b, 0)
}

describe('OCCUP-CT-01 — signature stable', () => {
  it('rend un total, un détail par source et le détail jour par jour', () => {
    const resultat = occupationSur([presence()], PERIODE)

    expect(resultat).toMatchObject({
      total: expect.any(Number),
      parSource: expect.any(Object),
      jours: expect.any(Array),
    })
  })

  it('renseigne les trois contributeurs du registre, même à zéro', () => {
    const { parSource } = occupationSur([], PERIODE)

    expect(Object.keys(parSource).sort()).toEqual(REGISTRE.map((c) => c.nom).sort())
  })
})

describe('OCCUP-CT-02 — fonction pure', () => {
  it('rend deux fois le même résultat pour la même entrée', () => {
    const presences = [presence(), presence({ reference: 'sejour-2', personnes: 3 })]

    expect(occupationSur(presences, PERIODE)).toEqual(occupationSur(presences, PERIODE))
  })

  it('ne touche ni à ses présences ni à sa période', () => {
    const presences = [presence()]
    const copie = structuredClone(presences)
    const periode = { debut: jour('2026-09-10'), fin: jour('2026-09-12') }

    occupationSur(presences, periode)

    expect(presences).toEqual(copie)
    expect(periode).toEqual({ debut: jour('2026-09-10'), fin: jour('2026-09-12') })
  })
})

describe('OCCUP-CT-03 — le total est exactement la somme des sources', () => {
  it('vaut la somme du détail, sur le pic comme sur chaque journée', () => {
    const resultat = occupationSur(
      [
        presence({ personnes: 4 }),
        presence({ reference: 'sejour-2', personnes: 3 }),
        presence({
          contributeur: 'DORMEUR_EVENEMENT',
          reference: 'rsvp-1',
          personnes: 6,
        }),
      ],
      PERIODE,
    )

    expect(resultat.total).toBe(somme(resultat.parSource))
    for (const journee of resultat.jours) {
      expect(journee.total).toBe(somme(journee.parSource))
    }
  })
})

describe('OCCUP-CT-04 — le total n’est jamais négatif', () => {
  it.each([
    ['maison vide', [] as Presence[]],
    ['présence sans personne', [presence({ personnes: 0 })]],
    ['présence à effectif aberrant', [presence({ personnes: -5 })]],
    [
      'présence hors période',
      [presence({ arrivee: jour('2026-01-01'), depart: jour('2026-01-03') })],
    ],
  ])('reste à zéro ou au-dessus — %s', (_cas, presences) => {
    const resultat = occupationSur(presences, PERIODE)

    expect(resultat.total).toBeGreaterThanOrEqual(0)
    for (const journee of resultat.jours) {
      expect(journee.total).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('OCCUP-CT-05 — un contributeur dormant rend zéro sans lever', () => {
  it('ignore les dormeurs d’événement tant que le lot 4 n’a pas basculé l’interrupteur', () => {
    const resultat = occupationSur(
      [
        presence({
          contributeur: 'DORMEUR_EVENEMENT',
          reference: 'rsvp-1',
          personnes: 6,
        }),
      ],
      PERIODE,
    )

    expect(resultat.total).toBe(0)
    expect(resultat.parSource.DORMEUR_EVENEMENT).toBe(0)
  })

  it('ignore aussi l’affectation de chambre, prévue après le MVP', () => {
    const resultat = occupationSur(
      [
        presence({
          contributeur: 'AFFECTATION_CHAMBRE',
          reference: 'chambre-1',
          personnes: 2,
        }),
      ],
      PERIODE,
    )

    expect(resultat.total).toBe(0)
  })
})

describe('OCCUP-CT-06 — le registre est énumérable', () => {
  it('liste les trois contributeurs avec leur état et leur date d’arrivée', () => {
    expect(REGISTRE.map((c) => ({ nom: c.nom, actif: c.actif }))).toEqual([
      { nom: 'SEJOUR_CONFIRME', actif: true },
      { nom: 'DORMEUR_EVENEMENT', actif: false },
      { nom: 'AFFECTATION_CHAMBRE', actif: false },
    ])
    for (const contributeur of REGISTRE) {
      expect(contributeur.arrivee).not.toBe('')
      expect(contributeur.quoi).not.toBe('')
    }
  })
})

describe('OCCUP-CT-07 — le calcul ne connaît ni l’interface ni la base', () => {
  it.each([
    'src/domain/occupancy/registre.ts',
    'src/domain/occupancy/occupation.ts',
    'src/domain/occupancy/sejours.ts',
  ])('%s n’importe ni React, ni Next.js, ni Prisma', (chemin) => {
    const source = readFileSync(chemin, 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

    expect(source.length).toBeGreaterThan(0)
    for (const cible of imports) {
      expect(cible).not.toMatch(/^(react|next|@prisma)/)
      expect(cible).not.toMatch(/generated/)
    }
  })
})

describe('OCCUP-CT-08 — convention de bornes [arrivée, départ[', () => {
  it('évalue le 10 et le 11 d’une période 10→12, jamais le 12', () => {
    const { jours } = occupationSur([], {
      debut: jour('2026-09-10'),
      fin: jour('2026-09-12'),
    })

    expect(jours.map((j) => j.jour.toISOString().slice(0, 10))).toEqual([
      '2026-09-10',
      '2026-09-11',
    ])
  })
})
