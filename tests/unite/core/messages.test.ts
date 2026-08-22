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
      // Seule dérogation au §12.4, décidée au module `PRIV` : la formulation
      // d'origine — « La maison serait à {n} personnes pour {max} places » —
      // révèle à un ami l'occupation en cours, séjours cachés compris
      // (PRIV-005, PRIV-S12). Le chiffre revient à `STAYDEC`, côté Solenne.
      CAPACITY_EXCEEDED:
        "La maison n'a plus assez de place sur ces dates. Essayez d'autres dates.",
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
    expect(
      messagePour('CAPACITY_BELOW_OCCUPANCY', {
        n: 9,
        jour: 'vendredi 11 septembre',
        max: 6,
      }),
    ).toBe(
      'La maison accueille déjà 9 personnes le vendredi 11 septembre. Annulez ou réduisez ces séjours avant de descendre à 6 places.',
    )
    expect(messagePour('MAX_DURATION', { n: 14 })).toBe(
      'Un séjour ne peut pas dépasser 14 nuits.',
    )
  })

  it('laisse le gabarit visible quand un paramètre manque, plutôt que « undefined »', () => {
    expect(
      messagePour('CAPACITY_BELOW_OCCUPANCY', { n: 9, jour: 'lundi' }),
    ).toContain('{max}')
    expect(
      messagePour('CAPACITY_BELOW_OCCUPANCY', { n: 9, jour: 'lundi' }),
    ).not.toContain('undefined')
  })

  it('PRIV-S12 — aucun refus destiné à un ami ne chiffre l’occupation', () => {
    // Un nombre dans un refus est une fuite : il se soustrait de la capacité.
    for (const code of ['CAPACITY_EXCEEDED', 'BLOCKED_PERIOD'] as const) {
      expect(CATALOGUE_MESSAGES[code], `code ${code}`).not.toContain('{n}')
      expect(CATALOGUE_MESSAGES[code], `code ${code}`).not.toContain('{max}')
    }
  })
})
