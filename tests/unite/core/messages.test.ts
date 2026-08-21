import { describe, expect, it } from 'vitest'

import { CODES, CODES_METIER } from '@/domain/core/error-codes'
import {
  CATALOGUE_MESSAGES,
  catalogueComplet,
  messagePour,
} from '@/domain/core/messages'

describe('CORE-012 — catalogue de messages', () => {
  it('couvre chacun des codes déclarés', () => {
    expect(catalogueComplet()).toBe(true)
    for (const code of CODES) {
      expect(CATALOGUE_MESSAGES[code], `code ${code}`).toBeTruthy()
    }
  })

  it('reprend au mot près les 11 refus métier du §12.4', () => {
    const attendus: Record<(typeof CODES_METIER)[number], string> = {
      BLOCKED_PERIOD: 'Ces dates ne sont pas disponibles.',
      CAPACITY_EXCEEDED: 'La maison serait à {n} personnes pour {max} places.',
      EXCLUSIVE_CONFLICT: 'La maison est déjà privatisée sur ces dates.',
      EXCLUSIVE_REQUEST_CONFLICT:
        "Un séjour est déjà prévu : la privatisation n'est pas possible.",
      EVENT_OVERLAP: 'Un autre événement est déjà prévu sur ce créneau.',
      MIN_LEAD_TIME: "Il faut demander au moins {n} h à l'avance.",
      MAX_ADVANCE: "Les demandes sont possibles jusqu'à {n} jours à l'avance.",
      MAX_DURATION: 'Un séjour ne peut pas dépasser {n} nuits.',
      FORBIDDEN_WEEKDAY: 'Les arrivées ne sont pas possibles ce jour-là.',
      INVALID_DATES: "La date de départ doit être après la date d'arrivée.",
      PAST_DATES: 'Ces dates sont déjà passées.',
    }

    const sansApostropheTypographique = (texte: string) =>
      texte.replace(/’/g, "'")

    for (const code of CODES_METIER) {
      expect(
        sansApostropheTypographique(CATALOGUE_MESSAGES[code]),
        `code ${code}`,
      ).toBe(attendus[code])
    }
  })

  it('est intégralement en français, sans terme technique', () => {
    const termesInterdits = [
      'error',
      'exception',
      'null',
      'undefined',
      'prisma',
      'sql',
      'stack',
      'timeout',
      'internal server',
    ]
    for (const code of CODES) {
      const message = CATALOGUE_MESSAGES[code].toLowerCase()
      for (const terme of termesInterdits) {
        expect(message, `code ${code}`).not.toContain(terme)
      }
    }
  })

  it('substitue les paramètres nommés', () => {
    expect(messagePour('CAPACITY_EXCEEDED', { n: 12, max: 10 })).toBe(
      'La maison serait à 12 personnes pour 10 places.',
    )
    expect(messagePour('MAX_DURATION', { n: 14 })).toBe(
      'Un séjour ne peut pas dépasser 14 nuits.',
    )
  })

  it('laisse le gabarit visible quand un paramètre manque, plutôt que « undefined »', () => {
    expect(messagePour('CAPACITY_EXCEEDED', { n: 12 })).toContain('{max}')
    expect(messagePour('CAPACITY_EXCEEDED', { n: 12 })).not.toContain(
      'undefined',
    )
  })
})
