import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VueSemaine } from '@/components/agenda/vue-semaine'
import { grilleDeSemaine, type ElementAgenda } from '@/domain/calendar/grille'
import { instantDepuisHeureParis, jour } from '@/domain/core/dates'

/**
 * `CAL` — la vue Semaine.
 *
 * Sept jours l'un sous l'autre. Ce qui se vérifie ici : le jour d'un départ
 * n'affiche pas le séjour qui s'achève mais annonce le départ (CAL-R3,
 * CAL-005), et un élément à l'heure montre son heure (CAL-002, CAL-010).
 */

function rendre(elements: readonly ElementAgenda[], repere = '2026-09-10') {
  return render(
    <VueSemaine
      semaine={grilleDeSemaine(jour(repere), elements, {
        aujourdhui: jour('2026-09-10'),
      })}
      elements={elements}
    />,
  )
}

function sejour(cle: string, du: string, au: string): ElementAgenda {
  return {
    cle,
    categorie: 'SEJOUR',
    titre: cle,
    du: jour(du),
    au: jour(au),
    precision: '4 personnes',
  }
}

describe('CAL-002 — la semaine, du lundi au dimanche', () => {
  it('affiche les sept jours, nommés', () => {
    rendre([])
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('lundi 7 septembre 2026')).toBeInTheDocument()
    expect(screen.getByText('dimanche 13 septembre 2026')).toBeInTheDocument()
  })

  it('dit qu’un jour est libre plutôt que de le laisser muet', () => {
    rendre([])
    expect(screen.getAllByText('La maison est libre ce jour-là.')).toHaveLength(
      7,
    )
  })

  it('marque le jour courant', () => {
    rendre([])
    expect(screen.getByTestId('semaine-2026-09-10')).toHaveAttribute(
      'aria-current',
      'date',
    )
  })

  it('CAL-010 — montre l’heure d’un élément qui en a une', () => {
    rendre([
      {
        cle: 'fete',
        categorie: 'EVENEMENT',
        titre: 'Déjeuner au jardin',
        du: jour('2026-09-09'),
        au: jour('2026-09-10'),
        debut: instantDepuisHeureParis(jour('2026-09-09'), 14),
        fin: instantDepuisHeureParis(jour('2026-09-09'), 18),
      },
    ])

    const mercredi = within(screen.getByTestId('semaine-2026-09-09'))
    expect(mercredi.getByText('Déjeuner au jardin')).toBeInTheDocument()
    expect(mercredi.getByText('14:00 – 18:00')).toBeInTheDocument()
  })
})

describe('CAL-005 — départ et arrivée le même jour', () => {
  const elements = [
    sejour('Léa', '2026-09-08', '2026-09-10'),
    sejour('Marc', '2026-09-10', '2026-09-12'),
  ]

  it('n’occupe le jour qu’avec celui qui arrive', () => {
    rendre(elements)
    const jeudi = within(screen.getByTestId('semaine-2026-09-10'))
    expect(jeudi.getByText(/Marc/)).toBeInTheDocument()
    expect(jeudi.getByText('Départ — Léa')).toBeInTheDocument()
  })

  it('signale l’arrivée sans parler de conflit', () => {
    rendre(elements)
    const jeudi = within(screen.getByTestId('semaine-2026-09-10'))
    expect(jeudi.getByText(/arrivée/)).toBeInTheDocument()
    expect(jeudi.queryByText(/conflit/i)).toBeNull()
  })

  it('n’annonce plus le séjour parti le lendemain', () => {
    rendre(elements)
    const vendredi = within(screen.getByTestId('semaine-2026-09-11'))
    expect(vendredi.queryByText(/Léa/)).toBeNull()
  })
})
