import { describe, expect, it } from 'vitest'

import { jour } from '@/domain/core/dates'
import { sejourEstPasse, verifierAnnulable } from '@/domain/stays/sejour'

/**
 * `STAY` — la part de domaine pur : ce qui rend un séjour annulable ou non
 * (STAY-R2, R6). La preuve d'intégration (écriture, notification, audit) est
 * dans `tests/integration/lot3/sejours.test.ts`.
 */

describe('sejourEstPasse — STAY-R6', () => {
  it('un séjour dont le départ est demain n’est pas passé', () => {
    expect(sejourEstPasse(jour('2027-09-20'), jour('2027-09-19'))).toBe(false)
  })

  it('un séjour dont le départ est aujourd’hui est passé — convention [arrivée, départ[', () => {
    expect(sejourEstPasse(jour('2027-09-20'), jour('2027-09-20'))).toBe(true)
  })

  it('un séjour dont le départ est hier est passé', () => {
    expect(sejourEstPasse(jour('2027-09-20'), jour('2027-09-21'))).toBe(true)
  })
})

describe('verifierAnnulable — STAY-R2 / R6', () => {
  const maintenant = jour('2027-09-10')

  it('un séjour confirmé à venir est annulable', () => {
    expect(verifierAnnulable('CONFIRMED', jour('2027-09-20'), maintenant)).toBeNull()
  })

  it('un séjour confirmé déjà terminé refuse — STAY-007', () => {
    const refus = verifierAnnulable('CONFIRMED', jour('2027-09-01'), maintenant)
    expect(refus?.code).toBe('STAY_NOT_CANCELLABLE')
  })

  it('un séjour déjà annulé refuse', () => {
    const refus = verifierAnnulable('CANCELLED', jour('2027-09-20'), maintenant)
    expect(refus?.code).toBe('STAY_NOT_CANCELLABLE')
  })

  it('un séjour déjà `COMPLETED` refuse', () => {
    const refus = verifierAnnulable('COMPLETED', jour('2027-09-01'), maintenant)
    expect(refus?.code).toBe('STAY_NOT_CANCELLABLE')
  })
})
