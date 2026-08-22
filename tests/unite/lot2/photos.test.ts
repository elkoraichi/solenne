import { describe, expect, it } from 'vitest'

import { ErreurMetier } from '@/domain/core/result'
import {
  ajouterPhoto,
  couvertureEffective,
  MAX_PHOTOS,
  reordonnerPhotos,
  retirerPhoto,
} from '@/domain/house/photos'

/**
 * `HOUSE` — règles pures de la galerie.
 *
 * Aucune base, aucun fichier : ces fonctions décident seulement de l'ordre et
 * de la photo mise en avant. Le stockage est ailleurs.
 */

const A = '/media/a.webp'
const B = '/media/b.webp'
const C = '/media/c.webp'

describe('HOUSE-011 — la photo de couverture', () => {
  it('retient la couverture désignée quand elle fait partie de la galerie', () => {
    expect(couvertureEffective([A, B, C], B)).toBe(B)
  })

  it('retombe sur la première photo quand aucune couverture n’est désignée', () => {
    expect(couvertureEffective([A, B], null)).toBe(A)
  })

  it('retombe sur la première photo quand la couverture a été retirée', () => {
    // Sans ce repli, retirer une photo laisserait la page d'accueil sans image.
    expect(couvertureEffective([A, B], C)).toBe(A)
  })
})

describe('HOUSE-012 — galerie vide', () => {
  it('ne renvoie aucune couverture plutôt qu’une adresse cassée', () => {
    expect(couvertureEffective([], null)).toBeNull()
    expect(couvertureEffective([], C)).toBeNull()
  })
})

describe('HOUSE-011 — ajout et retrait', () => {
  it('ajoute une photo à la fin de la galerie', () => {
    expect(ajouterPhoto([A], B)).toEqual([A, B])
  })

  it('ignore un ajout déjà présent plutôt que de créer un doublon', () => {
    expect(ajouterPhoto([A, B], A)).toEqual([A, B])
  })

  it('refuse d’ajouter au-delà de la limite', () => {
    const pleine = Array.from({ length: MAX_PHOTOS }, (_, i) => `/media/${i}.webp`)
    expect(() => ajouterPhoto(pleine, C)).toThrowError(ErreurMetier)
    try {
      ajouterPhoto(pleine, C)
    } catch (erreur) {
      expect((erreur as ErreurMetier).code).toBe('TOO_MANY_PHOTOS')
      expect((erreur as ErreurMetier).message).toContain(String(MAX_PHOTOS))
    }
  })

  it('retire une photo sans déranger l’ordre des autres', () => {
    expect(retirerPhoto([A, B, C], B)).toEqual([A, C])
  })

  it('refuse de retirer une photo qui n’est pas dans la galerie', () => {
    try {
      retirerPhoto([A, B], C)
      expect.unreachable('le retrait aurait dû être refusé')
    } catch (erreur) {
      expect((erreur as ErreurMetier).code).toBe('NOT_FOUND')
    }
  })
})

describe('HOUSE-014 — réordonnancement', () => {
  it('applique un ordre qui est bien une permutation de la galerie', () => {
    expect(reordonnerPhotos([A, B, C], [C, A, B])).toEqual([C, A, B])
  })

  it('refuse un ordre incomplet — la page travaillait sur un état périmé', () => {
    try {
      reordonnerPhotos([A, B, C], [C, A])
      expect.unreachable('l’ordre incomplet aurait dû être refusé')
    } catch (erreur) {
      expect((erreur as ErreurMetier).code).toBe('CONFLICT')
    }
  })

  it('refuse un ordre contenant une photo étrangère', () => {
    try {
      reordonnerPhotos([A, B], [A, C])
      expect.unreachable('la photo étrangère aurait dû être refusée')
    } catch (erreur) {
      expect((erreur as ErreurMetier).code).toBe('CONFLICT')
    }
  })

  it('refuse un ordre qui répète une photo', () => {
    try {
      reordonnerPhotos([A, B], [A, A])
      expect.unreachable('le doublon aurait dû être refusé')
    } catch (erreur) {
      expect((erreur as ErreurMetier).code).toBe('CONFLICT')
    }
  })
})
