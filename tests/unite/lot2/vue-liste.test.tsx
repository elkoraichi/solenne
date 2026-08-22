import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NavigationAgenda } from '@/components/agenda/navigation-agenda'
import { VueListe } from '@/components/agenda/vue-liste'
import type { ElementAgenda } from '@/domain/calendar/grille'
import { jour } from '@/domain/core/dates'

/**
 * `CAL` — la vue Liste et la navigation.
 *
 * La liste est alimentée par les mêmes éléments que la grille : c'est la seule
 * garantie que les deux vues racontent la même chose. La navigation, elle, ne
 * garde rien en mémoire — tout est dans l'adresse (CAL-012).
 */

function element(
  cle: string,
  du: string,
  reste: Partial<ElementAgenda> = {},
): ElementAgenda {
  return {
    cle,
    categorie: 'SEJOUR',
    titre: cle,
    du: jour(du),
    au: jour('2026-12-31'),
    ...reste,
  }
}

describe('CAL-003 — la vue Liste', () => {
  it('range par date d’arrivée, la plus proche d’abord', () => {
    render(
      <VueListe
        elements={[
          element('tardif', '2026-10-01'),
          element('proche', '2026-09-02'),
        ]}
      />,
    )

    const titres = screen
      .getAllByRole('listitem')
      .map((ligne) => ligne.querySelector('p')?.textContent)
    expect(titres).toEqual(['proche', 'tardif'])
  })

  it('nomme la catégorie de chaque ligne', () => {
    render(
      <VueListe
        elements={[
          element('fermeture', '2026-09-02', { categorie: 'INDISPONIBLE' }),
        ]}
      />,
    )
    expect(screen.getByText('Maison fermée')).toBeInTheDocument()
  })

  it('CAL-006 — dit chaleureusement qu’il n’y a rien', () => {
    render(<VueListe elements={[]} />)
    expect(screen.getByText('Rien de prévu pour l’instant')).toBeInTheDocument()
  })
})

function rendreNavigation(
  vue: 'mois' | 'semaine' | 'liste',
  mois = 9,
  jourRepere = '2026-09-10',
) {
  return render(
    <NavigationAgenda
      vue={vue}
      reference={{ annee: 2026, mois }}
      jourRepere={jour(jourRepere)}
    />,
  )
}

describe('CAL-012 — la navigation', () => {
  it('porte le mois et la vue dans l’adresse', () => {
    rendreNavigation('mois')

    expect(
      screen.getByRole('link', { name: /Mois précédent/ }),
    ).toHaveAttribute('href', '/agenda?vue=mois&mois=2026-08')
    expect(screen.getByRole('link', { name: /Mois suivant/ })).toHaveAttribute(
      'href',
      '/agenda?vue=mois&mois=2026-10',
    )
  })

  it('franchit l’année sans se perdre', () => {
    rendreNavigation('mois', 12)
    expect(screen.getByRole('link', { name: /Mois suivant/ })).toHaveAttribute(
      'href',
      '/agenda?vue=mois&mois=2027-01',
    )
  })

  it('garde le mois affiché en changeant de vue', () => {
    rendreNavigation('mois')
    expect(screen.getByRole('link', { name: 'Liste' })).toHaveAttribute(
      'href',
      '/agenda?vue=liste&mois=2026-09',
    )
    expect(screen.getByRole('link', { name: 'Mois' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('ne propose pas de période à parcourir en vue Liste', () => {
    rendreNavigation('liste')
    expect(screen.queryByRole('link', { name: /Mois suivant/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Semaine suivante/ })).toBeNull()
  })

  it('CAL-002 — se déplace de semaine en semaine, calée sur le lundi', () => {
    rendreNavigation('semaine')
    expect(
      screen.getByRole('link', { name: /Semaine suivante/ }),
    ).toHaveAttribute('href', '/agenda?vue=semaine&jour=2026-09-14')
    expect(
      screen.getByRole('link', { name: /Semaine précédente/ }),
    ).toHaveAttribute('href', '/agenda?vue=semaine&jour=2026-08-31')
  })

  it('passe de la grille à la semaine sans changer de dates', () => {
    rendreNavigation('mois')
    expect(screen.getByRole('link', { name: 'Semaine' })).toHaveAttribute(
      'href',
      '/agenda?vue=semaine&jour=2026-09-07',
    )
  })
})
