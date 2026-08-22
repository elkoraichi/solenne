import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ListeRegles } from '@/components/maison/liste-regles'
import type { RegleDeLaMaison } from '@/server/actions/regles'

function regle(
  id: string,
  titre: string,
  acceptationObligatoire: boolean,
  texte = 'Un texte de règle.',
): RegleDeLaMaison {
  return {
    id,
    titre,
    texte,
    icone: null,
    acceptationObligatoire,
    ordre: 0,
    active: true,
    version: 1,
  }
}

describe('HOUSE-016 — les règles obligatoires se distinguent', () => {
  it('marque les règles à accepter par un libellé, pas par une couleur seule', () => {
    render(
      <ListeRegles
        regles={[
          regle('a', 'Le calme après 22 h', true),
          regle('b', 'Le café est dans le placard', false),
        ]}
      />,
    )

    // Le repère doit survivre à un rendu en nuances de gris.
    expect(screen.getAllByText('À accepter')).toHaveLength(1)
    expect(screen.getByText('Le calme après 22 h')).toBeInTheDocument()
    expect(screen.getByText('Le café est dans le placard')).toBeInTheDocument()
  })

  it('restitue les règles dans l’ordre reçu', () => {
    render(
      <ListeRegles
        regles={[
          regle('a', 'Première', false),
          regle('b', 'Deuxième', false),
          regle('c', 'Troisième', false),
        ]}
      />,
    )

    const titres = screen.getAllByRole('heading').map((n) => n.textContent)
    expect(titres).toEqual(['Première', 'Deuxième', 'Troisième'])
  })
})

describe('HOUSE-017 — texte très long', () => {
  it('affiche les 5 000 caractères sans les tronquer', () => {
    const texte = 'Lorem ipsum dolor sit amet. '.repeat(180).slice(0, 5_000)
    render(<ListeRegles regles={[regle('a', 'Règle bavarde', false, texte)]} />)

    expect(screen.getByText(texte)).toBeInTheDocument()
  })

  it('coupe les mots interminables pour qu’ils ne débordent pas en 320 px', () => {
    render(
      <ListeRegles
        regles={[regle('a', 'a'.repeat(200), false, 'b'.repeat(400))]}
      />,
    )

    const titre = screen.getByRole('heading')
    expect(titre.className).toContain('break-words')
    expect(titre.parentElement?.nextElementSibling?.className).toContain(
      'break-words',
    )
  })
})

describe('HOUSE-012 — aucune règle', () => {
  it('propose un mot chaleureux plutôt qu’une liste vide', () => {
    render(<ListeRegles regles={[]} />)

    expect(
      screen.getByRole('heading', { name: /aucune règle/i }),
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
