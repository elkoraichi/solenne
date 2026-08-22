import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ListeEspaces } from '@/components/maison/liste-espaces'
import type { EspaceDeLaMaison } from '@/server/actions/espaces'

function espace(
  modifications: Partial<EspaceDeLaMaison> & { readonly id: string },
): EspaceDeLaMaison {
  return {
    type: 'ROOM',
    nom: 'Chambre bleue',
    description: null,
    couchages: 2,
    typeDeLit: '1 lit double',
    equipements: [],
    photos: [],
    ordre: 0,
    active: true,
    ...modifications,
  }
}

describe('SPACE-001 / SPACE-002 — chambre et bureau se distinguent', () => {
  it('annonce la chambre, son lit et son nombre de personnes', () => {
    render(<ListeEspaces espaces={[espace({ id: 'a' })]} />)

    expect(screen.getByText('Chambre')).toBeInTheDocument()
    expect(screen.getByText('Chambre bleue')).toBeInTheDocument()
    expect(screen.getByText('1 lit double — 2 personnes')).toBeInTheDocument()
  })

  it('marque le bureau par un mot, pas par une seule couleur, et sans couchage', () => {
    render(
      <ListeEspaces
        espaces={[
          espace({
            id: 'b',
            type: 'OFFICE',
            nom: 'Bureau de Solenne',
            couchages: 0,
            typeDeLit: null,
            equipements: ['écran', 'Wi-Fi', 'imprimante'],
          }),
        ]}
      />,
    )

    expect(screen.getByText('Bureau')).toBeInTheDocument()
    expect(screen.getByText('écran · Wi-Fi · imprimante')).toBeInTheDocument()
    expect(screen.queryByText(/personne/)).not.toBeInTheDocument()
  })

  it('restitue les espaces dans l’ordre reçu (SPACE-010)', () => {
    render(
      <ListeEspaces
        espaces={[
          espace({ id: 'a', nom: 'Première' }),
          espace({ id: 'b', nom: 'Deuxième' }),
          espace({ id: 'c', nom: 'Troisième' }),
        ]}
      />,
    )

    const titres = screen.getAllByRole('heading').map((noeud) => noeud.textContent)
    expect(titres).toEqual(['Première', 'Deuxième', 'Troisième'])
  })
})

describe('SPACE-011 — rendu en 320 px', () => {
  it('coupe les noms interminables plutôt que de déborder', () => {
    render(<ListeEspaces espaces={[espace({ id: 'a', nom: 'a'.repeat(200) })]} />)

    expect(screen.getByRole('heading').className).toContain('break-words')
  })

  it('n’affiche que la première photo, en vignette de carte', () => {
    render(
      <ListeEspaces
        espaces={[espace({ id: 'a', photos: ['/media/un.webp', '/media/deux.webp'] })]}
      />,
    )

    const images = document.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute('src')).toBe('/media/un.webp')
  })
})

describe('SPACE-008 — aucun espace décrit', () => {
  it('propose un mot d’attente plutôt qu’une liste vide', () => {
    render(<ListeEspaces espaces={[]} />)

    expect(
      screen.getByRole('heading', { name: /pièces arrivent/i }),
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
