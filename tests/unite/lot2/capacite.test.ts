import { describe, expect, it } from 'vitest'

import {
  CAPACITE_MAX,
  CAPACITE_MIN,
  MESSAGE_BORNES,
  MESSAGE_ENTIER,
  schemaCapacite,
} from '@/domain/house/capacite'

/**
 * HOUSE-R1 — la capacité est le paramètre le plus structurant du système.
 * Ses bornes sont vérifiées ici, hors de toute base de données : aucune valeur
 * hors 1–25 ne doit pouvoir exister, quelle que soit la porte d'entrée.
 */

function analyser(valeur: unknown) {
  return schemaCapacite.safeParse(valeur)
}

function messageDe(valeur: unknown): string {
  const resultat = analyser(valeur)
  expect(resultat.success).toBe(false)
  return resultat.success ? '' : (resultat.error.issues[0]?.message ?? '')
}

describe('HOUSE-002 / 003 / 004 — valeurs acceptées', () => {
  it('accepte la valeur courante', () => {
    expect(analyser(12)).toMatchObject({ success: true, data: 12 })
  })

  it('accepte la borne basse', () => {
    expect(analyser(CAPACITE_MIN)).toMatchObject({ success: true, data: 1 })
  })

  it('accepte la borne haute', () => {
    expect(analyser(CAPACITE_MAX)).toMatchObject({ success: true, data: 25 })
  })

  it('accepte une saisie de formulaire, qui arrive en texte', () => {
    expect(analyser('12')).toMatchObject({ success: true, data: 12 })
  })
})

describe('HOUSE-005 — sous la borne', () => {
  it('refuse zéro avec le message attendu', () => {
    expect(messageDe(0)).toBe(MESSAGE_BORNES)
  })

  it('refuse une valeur négative', () => {
    expect(messageDe(-3)).toBe(MESSAGE_BORNES)
  })
})

describe('HOUSE-006 — au-dessus de la borne', () => {
  it('refuse 26 avec le même message', () => {
    expect(messageDe(26)).toBe(MESSAGE_BORNES)
  })

  it('refuse une valeur absurde', () => {
    expect(messageDe(9999)).toBe(MESSAGE_BORNES)
  })
})

describe('HOUSE-010 — valeurs non entières', () => {
  it('refuse une décimale', () => {
    expect(messageDe(12.5)).toBe(MESSAGE_ENTIER)
  })

  it('refuse une décimale saisie à la française', () => {
    expect(messageDe('12,5')).toBe(MESSAGE_ENTIER)
  })

  it('refuse un mot', () => {
    expect(messageDe('douze')).toBe(MESSAGE_ENTIER)
  })

  it('refuse une saisie vide', () => {
    expect(messageDe('')).toBe(MESSAGE_ENTIER)
  })

  it('refuse null et undefined', () => {
    expect(analyser(null).success).toBe(false)
    expect(analyser(undefined).success).toBe(false)
  })

  it('énonce les bornes dans le message', () => {
    expect(MESSAGE_BORNES).toContain(String(CAPACITE_MIN))
    expect(MESSAGE_BORNES).toContain(String(CAPACITE_MAX))
  })
})
