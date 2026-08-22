import { describe, expect, it } from 'vitest'

import {
  coherenceCouchages,
  MESSAGE_BUREAU_AVEC_COUCHAGE,
  MESSAGE_CHAMBRE_SANS_COUCHAGE,
  MESSAGE_TYPE,
  schemaEspace,
  type EspaceCompte,
} from '@/domain/house/espaces'

/** `SPACE` — les règles pures : R1, R2 et le repère R3. */

function defaut(modifications: Record<string, unknown>) {
  return { type: 'ROOM', nom: 'Chambre blanche', couchages: 2, ...modifications }
}

function messageDe(entree: Record<string, unknown>, champ: string) {
  const resultat = schemaEspace.safeParse(entree)
  expect(resultat.success).toBe(false)
  if (resultat.success) return ''
  return resultat.error.issues.find((issue) => issue.path.join('.') === champ)
    ?.message
}

describe('SPACE-R1 — chambre ou bureau, jamais les deux', () => {
  it('accepte les deux seuls types connus', () => {
    expect(schemaEspace.safeParse(defaut({})).success).toBe(true)
    expect(
      schemaEspace.safeParse(defaut({ type: 'OFFICE', couchages: 0 })).success,
    ).toBe(true)
  })

  it('refuse un type inventé', () => {
    expect(messageDe(defaut({ type: 'ROOM_OFFICE' }), 'type')).toBe(MESSAGE_TYPE)
  })
})

describe('SPACE-003 — un bureau n’a pas de couchage (R2)', () => {
  it('refuse un bureau avec deux couchages, en le disant', () => {
    expect(
      messageDe(defaut({ type: 'OFFICE', nom: 'Bureau 1', couchages: 2 }), 'couchages'),
    ).toBe(MESSAGE_BUREAU_AVEC_COUCHAGE)
  })

  it('accepte un bureau sans champ couchages du tout', () => {
    const resultat = schemaEspace.safeParse({
      type: 'OFFICE',
      nom: 'Bureau de Solenne',
      equipements: ['écran', 'Wi-Fi', 'imprimante'],
    })
    expect(resultat.success).toBe(true)
    if (resultat.success) expect(resultat.data.couchages).toBe(0)
  })
})

describe('SPACE-004 — une chambre a au moins un couchage', () => {
  it('refuse zéro couchage avec le message imposé', () => {
    expect(messageDe(defaut({ couchages: 0 }), 'couchages')).toBe(
      MESSAGE_CHAMBRE_SANS_COUCHAGE,
    )
  })

  it('refuse « deux » et « 2,5 » comme il refuse un nombre négatif', () => {
    for (const couchages of ['deux', '2,5', -1, 99]) {
      expect(schemaEspace.safeParse(defaut({ couchages })).success).toBe(false)
    }
  })

  it('accepte un nombre saisi au clavier, donc en texte', () => {
    const resultat = schemaEspace.safeParse(defaut({ couchages: '3' }))
    expect(resultat.success && resultat.data.couchages).toBe(3)
  })
})

describe('SPACE-005 / SPACE-006 / R3 — le repère couchages ↔ capacité', () => {
  const chambre = (couchages: number, active = true): EspaceCompte => ({
    type: 'ROOM',
    couchages,
    active,
  })

  it('ne dit rien quand les deux chiffres coïncident', () => {
    const bilan = coherenceCouchages([chambre(6), chambre(4)], 10)
    expect(bilan.couchages).toBe(10)
    expect(bilan.avertissement).toBeNull()
  })

  it('SPACE-005 — signale les couchages manquants sans jamais bloquer', () => {
    const bilan = coherenceCouchages([chambre(4), chambre(4)], 12)
    expect(bilan.couchages).toBe(8)
    expect(bilan.avertissement).toContain('8 couchages')
    expect(bilan.avertissement).toContain('12 personnes')
    expect(bilan.avertissement).toContain('il en manque 4')
    expect(bilan.avertissement).toContain('rien n’est bloqué')
  })

  it('SPACE-006 — signale aussi le dépassement', () => {
    const bilan = coherenceCouchages([chambre(8), chambre(6)], 8)
    expect(bilan.couchages).toBe(14)
    expect(bilan.avertissement).toContain('6 de plus que de places')
  })

  it('ne compte ni les bureaux ni les espaces en sommeil', () => {
    const bilan = coherenceCouchages(
      [
        chambre(4),
        chambre(4, false),
        { type: 'OFFICE', couchages: 0, active: true },
      ],
      4,
    )
    expect(bilan.couchages).toBe(4)
    expect(bilan.avertissement).toBeNull()
  })
})
