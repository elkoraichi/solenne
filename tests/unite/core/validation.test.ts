import { describe, expect, it } from 'vitest'

import { CATALOGUE_MESSAGES } from '@/domain/core/messages'
import { LONGUEURS, validerEntree, z } from '@/domain/core/validation'

/** Schéma représentatif d'une demande de séjour, sans la logique métier. */
const schemaDemande = z.object({
  arrivalDate: z.string({ error: 'La date d’arrivée est obligatoire.' }),
  adults: z
    .number({ error: 'Le nombre d’adultes doit être un nombre.' })
    .int({ error: 'Le nombre d’adultes doit être un nombre entier.' })
    .min(1, { error: 'Il faut au moins un adulte.' })
    .max(25, { error: 'Le nombre d’adultes ne peut pas dépasser 25.' }),
  comment: z
    .string()
    .max(LONGUEURS.longue, {
      error: `Le commentaire ne peut pas dépasser ${LONGUEURS.longue} caractères.`,
    })
    .optional(),
})

describe('CORE-007 — entrée invalide rejetée', () => {
  it('refuse « abc » comme nombre d’adultes, sans toucher à la base', () => {
    const resultat = validerEntree(schemaDemande, {
      arrivalDate: '2026-05-01',
      adults: 'abc',
    })

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(resultat.message).toBe(CATALOGUE_MESSAGES.VALIDATION)
    expect(resultat.champs?.adults).toBe(
      'Le nombre d’adultes doit être un nombre.',
    )
  })

  it('refuse une valeur hors bornes', () => {
    const resultat = validerEntree(schemaDemande, {
      arrivalDate: '2026-05-01',
      adults: 0,
    })
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.champs?.adults).toBe('Il faut au moins un adulte.')
  })

  it('accepte une entrée correcte et renvoie la valeur analysée', () => {
    const resultat = validerEntree(schemaDemande, {
      arrivalDate: '2026-05-01',
      adults: 2,
    })
    expect(resultat).toEqual({
      ok: true,
      data: { arrivalDate: '2026-05-01', adults: 2 },
    })
  })
})

describe('CORE-008 — entrée absente rejetée', () => {
  it('nomme le champ manquant', () => {
    const resultat = validerEntree(schemaDemande, { adults: 2 })
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(Object.keys(resultat.champs ?? {})).toContain('arrivalDate')
    expect(resultat.champs?.arrivalDate).toBe(
      'La date d’arrivée est obligatoire.',
    )
  })

  it('signale tous les champs manquants d’un coup', () => {
    const resultat = validerEntree(schemaDemande, {})
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(Object.keys(resultat.champs ?? {}).sort()).toEqual([
      'adults',
      'arrivalDate',
    ])
  })

  it('rejette une entrée qui n’est pas un objet', () => {
    for (const valeur of [null, undefined, 'texte', 42, []]) {
      expect(validerEntree(schemaDemande, valeur).ok).toBe(false)
    }
  })
})

describe('CORE-009 — entrée démesurée rejetée', () => {
  it('refuse proprement un commentaire de 100 000 caractères', () => {
    const debut = Date.now()
    const resultat = validerEntree(schemaDemande, {
      arrivalDate: '2026-05-01',
      adults: 2,
      comment: 'x'.repeat(100_000),
    })
    const duree = Date.now() - debut

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(resultat.champs?.comment).toContain('5000 caractères')
    // Pas de saturation : le rejet est immédiat.
    expect(duree).toBeLessThan(1_000)
  })

  it('accepte un commentaire à la limite exacte', () => {
    const resultat = validerEntree(schemaDemande, {
      arrivalDate: '2026-05-01',
      adults: 2,
      comment: 'x'.repeat(LONGUEURS.longue),
    })
    expect(resultat.ok).toBe(true)
  })
})
