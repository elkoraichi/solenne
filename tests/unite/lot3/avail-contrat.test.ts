import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { jour } from '@/domain/core/dates'
import { pourAmi } from '@/domain/availability/conflits'
import { verifierDisponibilite } from '@/domain/availability/disponibilite'
import type { Presence } from '@/domain/occupancy/registre'

/**
 * `AVAIL-CT-01` — **le garde-fou G1** : `AVAIL` ne compte jamais lui-même.
 *
 * Règle non négociable n°3 : un seul endroit du projet additionne des
 * personnes, et c'est `OCCUP`. Ce fichier le prouve de deux manières, parce
 * qu'aucune des deux ne suffit seule :
 *
 * - **par le comportement** — on donne à `AVAIL` une présence que `OCCUP`
 *   ignore (contributeur dormant). Un module qui compterait pour son compte
 *   la verrait ; `AVAIL` doit rendre le même verdict que `OCCUP`, pas un autre.
 * - **par la forme du code** — un futur `if` maladroit sur `contexte.presences`
 *   passerait le test de comportement ci-dessus tant qu'il tomberait juste.
 *   L'analyse statique, elle, le refuse par principe.
 *
 * Ces tests sont figés. Le lot 4 activera `DORMEUR_ÉVÉNEMENT` : le premier
 * bloc changera alors de valeur attendue — **et rien d'autre**.
 */

const CHEMINS = [
  'src/domain/availability/disponibilite.ts',
  'src/domain/availability/conflits.ts',
] as const

function source(chemin: string): string {
  return readFileSync(chemin, 'utf8')
}

describe('AVAIL-CT-01 — `AVAIL` consomme `OCCUP` et ne recompte rien', () => {
  it('suit `OCCUP` jusque dans ses silences : un contributeur dormant ne remplit pas la maison', () => {
    // Vingt dormeurs d'événement sur les dates demandées. `OCCUP` les ignore
    // (le contributeur est dormant), donc la maison est vide, donc la demande
    // passe. Un `AVAIL` qui compterait lui-même verrait 20 + 4 pour 10 places.
    const presences: Presence[] = [
      {
        contributeur: 'DORMEUR_EVENEMENT',
        reference: 'rsvp-1',
        arrivee: jour('2026-09-10'),
        depart: jour('2026-09-12'),
        personnes: 20,
      },
    ]

    const resultat = verifierDisponibilite(
      {
        arrivee: jour('2026-09-10'),
        depart: jour('2026-09-12'),
        personnes: 4,
      },
      { capacite: 10, presences },
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it.each(CHEMINS)('%s ne lit jamais `presences` autrement que par `occupationSur`', (chemin) => {
    const lignes = source(chemin).split('\n')

    const lectures = lignes.filter((ligne) => {
      if (!/\bpresences\b/.test(ligne)) return false
      const nue = ligne.trim()
      // Commentaires et documentation : ils parlent des présences, ils ne les lisent pas.
      if (nue.startsWith('*') || nue.startsWith('//') || nue.startsWith('/*')) return false
      // La déclaration du champ dans le contexte, qui ne fait que le recevoir.
      if (/^readonly presences\??:/.test(nue)) return false
      return true
    })

    expect(lectures.length).toBeGreaterThanOrEqual(0)
    for (const ligne of lectures) {
      expect(ligne).toMatch(/occupationSur\(/)
    }
  })

  it.each(CHEMINS)('%s n’accède ni aux séjours, ni à la base, ni à l’interface', (chemin) => {
    const contenu = source(chemin)
    const imports = [...contenu.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

    expect(imports.length).toBeGreaterThan(0)
    for (const cible of imports) {
      expect(cible).not.toMatch(/^(react|next|@prisma)/)
      expect(cible).not.toMatch(/generated/)
      // `occupancy/sejours` sait transformer des séjours en présences : c'est
      // l'affaire de l'appelant. `AVAIL` ne voit que le résultat de `OCCUP`.
      expect(cible).not.toMatch(/occupancy\/sejours/)
    }

    // Le registre n'est importé que pour son type — rien de ce qui compte.
    if (/occupancy\/registre/.test(contenu)) {
      expect(contenu).toMatch(/import type \{[^}]*\} from '@\/domain\/occupancy\/registre'/)
    }
  })

  it('ne donne à `AVAIL` aucun effectif à additionner : un séjour existant n’a pas de personnes', () => {
    const contenu = source('src/domain/availability/disponibilite.ts')
    const bloc = /export interface SejourExistant \{([\s\S]*?)\n\}/.exec(contenu)

    expect(bloc).not.toBeNull()
    expect(bloc?.[1]).not.toMatch(/personnes|adultes|enfants|effectif/)
  })
})

describe('AVAIL-CT-01 — le résultat envoyé à un ami ne porte aucun chiffre (règle n°4)', () => {
  it('retire le détail chiffré au lieu de compter sur l’écran pour le masquer', () => {
    const resultat = verifierDisponibilite(
      { arrivee: jour('2026-09-10'), depart: jour('2026-09-12'), personnes: 4 },
      {
        capacite: 10,
        presences: [
          {
            contributeur: 'SEJOUR_CONFIRME',
            reference: 'sejour-1',
            arrivee: jour('2026-09-10'),
            depart: jour('2026-09-12'),
            personnes: 8,
          },
        ],
      },
    )

    expect(resultat.conflits[0]?.details).toBeDefined()

    const ami = pourAmi(resultat)
    expect(ami.conflits).toEqual([
      {
        regle: 'R4',
        code: 'CAPACITY_EXCEEDED',
        message: 'La maison n’a plus assez de place sur ces dates. Essayez d’autres dates.',
      },
    ])
    for (const conflit of ami.conflits) {
      expect(conflit).not.toHaveProperty('details')
      expect(conflit.message).not.toMatch(/\d/)
    }
  })
})
