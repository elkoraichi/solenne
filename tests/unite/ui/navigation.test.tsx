import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  estOngletActif,
  NavigationBasse,
  ONGLETS_COMMUNS,
  ONGLET_GERER,
} from '@/components/layout/navigation-basse'

const cheminActuel = vi.hoisted(() => ({ valeur: '/' }))

vi.mock('next/navigation', () => ({
  usePathname: () => cheminActuel.valeur,
}))

beforeEach(() => {
  cheminActuel.valeur = '/'
})

describe('Navigation basse — 5 onglets, 6 pour Solenne', () => {
  it('montre les 5 onglets communs à un ami', () => {
    render(<NavigationBasse estAdministratrice={false} />)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    const liens = within(nav).getAllByRole('link')

    expect(liens).toHaveLength(5)
    expect(liens.map((lien) => lien.textContent)).toEqual([
      'Accueil',
      'Agenda',
      'Séjours',
      'Maison',
      'Profil',
    ])
    expect(
      within(nav).queryByRole('link', { name: /Gérer/ }),
    ).toBeNull()
  })

  it('ajoute le 6ᵉ onglet « Gérer » pour Solenne', () => {
    render(<NavigationBasse estAdministratrice />)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getAllByRole('link')).toHaveLength(6)
    expect(within(nav).getByRole('link', { name: /Gérer/ })).toHaveAttribute(
      'href',
      '/gerer',
    )
  })

  it('affiche une pastille sur le nombre de demandes à traiter', () => {
    render(<NavigationBasse estAdministratrice demandesEnAttente={2} />)
    const gerer = screen.getByRole('link', { name: /Gérer/ })
    expect(gerer).toHaveTextContent('2')
    expect(gerer).toHaveTextContent('demandes à traiter')
  })

  it('accorde le singulier quand il n’y a qu’une demande', () => {
    render(<NavigationBasse estAdministratrice demandesEnAttente={1} />)
    expect(screen.getByRole('link', { name: /Gérer/ })).toHaveTextContent(
      'demande à traiter',
    )
  })

  it('borne l’affichage de la pastille à « 9+ »', () => {
    render(<NavigationBasse estAdministratrice demandesEnAttente={42} />)
    expect(screen.getByRole('link', { name: /Gérer/ })).toHaveTextContent('9+')
  })

  it('n’affiche pas de pastille quand il n’y a rien à traiter', () => {
    render(<NavigationBasse estAdministratrice demandesEnAttente={0} />)
    expect(
      screen.getByRole('link', { name: /Gérer/ }),
    ).not.toHaveTextContent(/\d/)
  })

  it('signale l’onglet courant par aria-current', () => {
    cheminActuel.valeur = '/sejours/nouvelle-demande'
    render(<NavigationBasse estAdministratrice={false} />)

    const actif = screen.getByRole('link', { name: 'Séjours' })
    expect(actif).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Accueil' })).not.toHaveAttribute(
      'aria-current',
    )
  })
})

describe('UI-002 — cibles tactiles de la navigation', () => {
  it('donne à chaque onglet une cible d’au moins 44 × 44 px', () => {
    render(<NavigationBasse estAdministratrice />)
    for (const lien of screen.getAllByRole('link')) {
      expect(lien.className).toMatch(/cible-tactile/)
    }
  })
})

describe('Onglet actif', () => {
  it('n’active « Accueil » que sur la racine exacte', () => {
    expect(estOngletActif('/', '/')).toBe(true)
    expect(estOngletActif('/', '/agenda')).toBe(false)
  })

  it('active un onglet sur ses sous-chemins', () => {
    expect(estOngletActif('/sejours', '/sejours')).toBe(true)
    expect(estOngletActif('/sejours', '/sejours/12')).toBe(true)
    expect(estOngletActif('/sejours', '/sejours-archives')).toBe(false)
  })
})

describe('Déclaration des onglets', () => {
  it('énumère exactement les 5 destinations du §5, plus « Gérer »', () => {
    expect(ONGLETS_COMMUNS.map((onglet) => onglet.href)).toEqual([
      '/',
      '/agenda',
      '/sejours',
      '/maison',
      '/profil',
    ])
    expect(ONGLET_GERER.href).toBe('/gerer')
  })
})
