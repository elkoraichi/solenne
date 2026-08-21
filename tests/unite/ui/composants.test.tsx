import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Avatar, initiales } from '@/components/ui/avatar'
import { Bouton } from '@/components/ui/bouton'
import { Carte, CarteCorps, CarteTitre } from '@/components/ui/carte'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue-confirmation'
import { EtatVide } from '@/components/ui/etat-vide'
import { SqueletteCarte } from '@/components/ui/squelette'

describe('UI-002 — cibles tactiles', () => {
  it('donne à chaque taille de bouton une hauteur minimale d’au moins 44 px', () => {
    const { rerender } = render(<Bouton>Envoyer</Bouton>)
    expect(screen.getByRole('button').className).toMatch(/min-h-11/)

    rerender(<Bouton taille="large">Envoyer</Bouton>)
    expect(screen.getByRole('button').className).toMatch(/min-h-13/)

    rerender(
      <Bouton taille="icone" aria-label="Fermer">
        ×
      </Bouton>,
    )
    const icone = screen.getByRole('button')
    expect(icone.className).toMatch(/min-h-11/)
    expect(icone.className).toMatch(/min-w-11/)
  })

  it('donne aux champs de saisie la même hauteur minimale', () => {
    render(<Champ etiquette="Email" nom="email" />)
    expect(screen.getByLabelText('Email').className).toMatch(/min-h-11/)
  })
})

describe('UI-006 — navigation au clavier', () => {
  it('rend un vrai bouton, atteignable à la tabulation', async () => {
    const utilisateur = userEvent.setup()
    const clic = vi.fn()
    render(<Bouton onClick={clic}>Demander un séjour</Bouton>)

    await utilisateur.tab()
    const bouton = screen.getByRole('button', { name: 'Demander un séjour' })
    expect(bouton).toHaveFocus()

    await utilisateur.keyboard('{Enter}')
    expect(clic).toHaveBeenCalledTimes(1)
  })

  it('n’envoie pas un formulaire par accident : le type par défaut est « button »', () => {
    render(<Bouton>Ajouter une activité</Bouton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('relie étiquette, aide et erreur au champ pour la lecture d’écran', () => {
    render(
      <Champ
        etiquette="Nombre d’adultes"
        nom="adults"
        aide="Vous compris."
        erreur="Il faut au moins un adulte."
      />,
    )
    const champ = screen.getByLabelText('Nombre d’adultes')
    expect(champ).toHaveAttribute('aria-invalid', 'true')
    expect(champ).toHaveAccessibleDescription('Il faut au moins un adulte.')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Il faut au moins un adulte.',
    )
  })

  it('relie aussi une zone de texte à son message d’aide', () => {
    render(
      <ZoneTexte etiquette="Commentaire" nom="comment" aide="Facultatif." />,
    )
    expect(screen.getByLabelText('Commentaire')).toHaveAccessibleDescription(
      'Facultatif.',
    )
  })
})

describe('UI-007 — états vides', () => {
  it('affiche un message chaleureux et l’action suggérée, jamais une page blanche', () => {
    render(
      <EtatVide
        titre="Aucun séjour pour l’instant"
        texte="Vos demandes et vos séjours s’afficheront ici."
        action={<Bouton>Demander un séjour</Bouton>}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Aucun séjour pour l’instant' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Vos demandes et vos séjours s’afficheront ici.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Demander un séjour' }),
    ).toBeInTheDocument()
  })

  it('reste lisible sans texte ni action', () => {
    render(<EtatVide titre="Rien ici" />)
    expect(screen.getByRole('heading', { name: 'Rien ici' })).toBeVisible()
  })
})

describe('UI-008 — états de chargement', () => {
  it('annonce le chargement et réserve la place du contenu', () => {
    const { container } = render(<SqueletteCarte />)
    const zone = screen.getByRole('status', { name: 'Chargement en cours' })
    expect(zone).toBeInTheDocument()
    // Le visuel réserve exactement le format de la future photo : pas de saut.
    expect(container.querySelector('.aspect-\\[16\\/10\\]')).not.toBeNull()
  })
})

describe('UI-009 — titre très long', () => {
  it('tronque proprement au lieu de déformer la carte', () => {
    const titreLong = 'Anniversaire '.repeat(20).trim()
    render(
      <Carte>
        <CarteCorps>
          <CarteTitre>{titreLong}</CarteTitre>
        </CarteCorps>
      </Carte>,
    )
    const titre = screen.getByRole('heading')
    expect(titre.className).toMatch(/line-clamp-2/)
    expect(titre.className).toMatch(/break-words/)
    expect(titre).toHaveTextContent('Anniversaire')
  })
})

describe('UI-010 — image absente', () => {
  it('affiche les initiales plutôt qu’une icône cassée', () => {
    render(<Avatar nom="Léa Fournier" />)
    expect(screen.getByText('LF')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('calcule des initiales lisibles dans tous les cas', () => {
    expect(initiales('Léa Fournier')).toBe('LF')
    expect(initiales('Solenne')).toBe('S')
    expect(initiales('  jean   pierre  martin ')).toBe('JP')
    expect(initiales('')).toBe('?')
  })

  it('conserve le nom pour la lecture d’écran', () => {
    render(<Avatar nom="Marc Delaunay" />)
    expect(screen.getByText('Marc Delaunay')).toBeInTheDocument()
  })
})

describe('UI-011 — confirmation destructive', () => {
  it('nomme l’objet supprimé et n’agit qu’après confirmation', async () => {
    const utilisateur = userEvent.setup()
    const confirmer = vi.fn()

    render(
      <DialogueConfirmation
        ouvert
        onOuvertureChange={() => {}}
        titre="Supprimer cet événement ?"
        objet="L’anniversaire de Léa"
        consequence="les 4 invités seront prévenus"
        onConfirmer={confirmer}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Supprimer cet événement ?' }),
    ).toBeInTheDocument()
    expect(screen.getByText('L’anniversaire de Léa')).toBeInTheDocument()
    expect(
      screen.getByText(/les 4 invités seront prévenus/),
    ).toBeInTheDocument()

    expect(confirmer).not.toHaveBeenCalled()
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(confirmer).toHaveBeenCalledTimes(1)
  })

  it('propose toujours une porte de sortie', () => {
    render(
      <DialogueConfirmation
        ouvert
        onOuvertureChange={() => {}}
        titre="Désactiver ce compte ?"
        objet="Camille Roux"
        onConfirmer={() => {}}
        libelleConfirmer="Désactiver"
      />,
    )
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Désactiver' }),
    ).toBeInTheDocument()
  })
})
