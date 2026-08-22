import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GaleriePhotos } from '@/components/maison/galerie-photos'
import { PhotoCouverture } from '@/components/maison/photo-couverture'

/**
 * HOUSE-012 — une maison sans photo.
 *
 * Le défaut à éviter n'est pas l'absence d'image : c'est l'icône d'image
 * brisée, ou pire, un cadre vide sans un mot. On vérifie donc qu'aucune balise
 * `img` n'est posée et qu'un texte chaleureux prend sa place.
 */

const PHOTOS = ['/media/a.webp', '/media/b.webp', '/media/c.webp']

describe('HOUSE-012 — état vide de la galerie', () => {
  it('n’affiche aucune image et propose un mot d’attente', () => {
    render(<GaleriePhotos photos={[]} nomMaison="La maison de Solenne" />)

    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(
      screen.getByRole('heading', { name: /photos arrivent/i }),
    ).toBeInTheDocument()
  })

  it('remplace la couverture manquante par un aplat, jamais par une image cassée', () => {
    render(<PhotoCouverture url={null} nomMaison="La maison de Solenne" />)

    expect(document.querySelectorAll('img')).toHaveLength(0)
  })
})

describe('HOUSE-011 — rendu de la galerie', () => {
  it('affiche une image par photo, dans l’ordre reçu', () => {
    render(<GaleriePhotos photos={PHOTOS} nomMaison="La maison de Solenne" />)

    const images = [...document.querySelectorAll('img')]
    expect(images).toHaveLength(PHOTOS.length)
    expect(images.map((image) => image.getAttribute('src'))).toEqual(PHOTOS)
  })

  it('nomme la couverture pour la lecture d’écran', () => {
    render(
      <PhotoCouverture url={PHOTOS[0] ?? null} nomMaison="La maison de Solenne" />,
    )

    expect(screen.getByAltText('La maison de Solenne')).toBeInTheDocument()
  })
})
