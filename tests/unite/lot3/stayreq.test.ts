import { describe, expect, it } from 'vitest'

import { jour } from '@/domain/core/dates'
import type { ReglagesReservation } from '@/domain/policy/reglages'
import {
  evaluerDemande,
  verifierPrealables,
  type CandidatDemande,
  type ContexteEvaluation,
} from '@/domain/stays/demande'

/**
 * `STAYREQ` — arrêt `STAYREQ-A`, cas de domaine pur (`003` à `007`) :
 * les refus qui n'appartiennent ni à `AVAIL` ni à `POLICY`, et la composition
 * (`evaluerDemande`) qui les fond avec la délégation `R8` déjà écrite côté
 * `AVAIL`/`POLICY`. Le reste des 17 cas de l'arrêt (persistance, permissions,
 * concurrence) est couvert en intégration (`tests/integration/lot3/demandes-sejour.test.ts`).
 */

const AUCUN_REGLAGE: ReglagesReservation = {
  dureeMaxNuits: null,
  delaiMinHeures: null,
  horizonMaxJours: null,
  joursArriveeInterdits: [],
  maxPersonnesParDemande: null,
  cohabitationAutorisee: true,
}

function candidat(modifications: Partial<CandidatDemande> = {}): CandidatDemande {
  return {
    arrivee: jour('2026-09-18'),
    depart: jour('2026-09-20'),
    adultes: 4,
    enfants: 0,
    invites: [],
    maintenant: jour('2026-09-01'),
    reglesObligatoiresNonAcceptees: false,
    ...modifications,
  }
}

function contexte(modifications: Partial<ContexteEvaluation> = {}): ContexteEvaluation {
  return {
    capacite: 10,
    presences: [],
    sejours: [],
    blocages: [],
    reglages: AUCUN_REGLAGE,
    estSolenne: false,
    periodeOccupee: false,
    ...modifications,
  }
}

function codes(refus: readonly { readonly code: string }[]): readonly string[] {
  return refus.map((r) => r.code)
}

describe('STAYREQ-003 — dates passées', () => {
  it('refuse une arrivée déjà passée', () => {
    const refus = verifierPrealables(
      candidat({ arrivee: jour('2026-08-01'), depart: jour('2026-08-03'), maintenant: jour('2026-09-01') }),
    )
    expect(codes(refus)).toEqual(['PAST_DATES'])
  })

  it('accepte une arrivée aujourd’hui même', () => {
    const refus = verifierPrealables(
      candidat({ arrivee: jour('2026-09-01'), depart: jour('2026-09-03'), maintenant: jour('2026-09-01') }),
    )
    expect(refus).toEqual([])
  })
})

describe('STAYREQ-004 — dates inversées', () => {
  it('AVAIL renvoie INVALID_DATES, aucun préalable ne le masque', () => {
    const { prealables, disponibilite } = evaluerDemande(
      candidat({ arrivee: jour('2026-09-20'), depart: jour('2026-09-18') }),
      contexte(),
    )
    expect(prealables).toEqual([])
    expect(disponibilite.compatible).toBe(false)
    expect(codes(disponibilite.conflits)).toEqual(['INVALID_DATES'])
  })
})

describe('STAYREQ-005 — séjour de zéro nuit', () => {
  it('arrivée et départ identiques sont refusés, message explicite', () => {
    const { disponibilite } = evaluerDemande(
      candidat({ arrivee: jour('2026-09-18'), depart: jour('2026-09-18') }),
      contexte(),
    )
    expect(disponibilite.compatible).toBe(false)
    expect(disponibilite.conflits[0]?.message).toBe(
      'La date de départ doit être après la date d’arrivée.',
    )
  })
})

describe('STAYREQ-006 — zéro personne', () => {
  it('refuse 0 adulte et 0 enfant', () => {
    const refus = verifierPrealables(candidat({ adultes: 0, enfants: 0 }))
    expect(codes(refus)).toEqual(['AT_LEAST_ONE_GUEST'])
    expect(refus[0]?.message).toBe('Au moins une personne doit être déclarée.')
  })
})

describe('STAYREQ-007 — cohérence des invités (SREQ-R7)', () => {
  it('signale une incohérence : 2 adultes déclarés, 4 noms saisis', () => {
    const refus = verifierPrealables(
      candidat({
        adultes: 2,
        enfants: 0,
        invites: [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }, { nom: 'D' }],
      }),
    )
    expect(codes(refus)).toEqual(['GUEST_COUNT_MISMATCH'])
  })

  it('ne signale rien quand les invités nommés tiennent dans l’effectif déclaré', () => {
    const refus = verifierPrealables(
      candidat({ adultes: 2, enfants: 1, invites: [{ nom: 'A' }, { nom: 'B' }] }),
    )
    expect(refus).toEqual([])
  })
})

describe('SREQ-R3 — règles obligatoires non acceptées', () => {
  it('refuse quand des règles obligatoires existent et n’ont pas été acceptées', () => {
    const refus = verifierPrealables(candidat({ reglesObligatoiresNonAcceptees: true }))
    expect(codes(refus)).toEqual(['RULES_NOT_ACCEPTED'])
  })
})

describe('evaluerDemande — R8, la délégation POLICY → AVAIL', () => {
  it('un refus POLICY se retrouve dans les conflits AVAIL, sous la règle R8', () => {
    const { disponibilite } = evaluerDemande(
      candidat({ adultes: 8 }),
      contexte({ reglages: { ...AUCUN_REGLAGE, maxPersonnesParDemande: 6 } }),
    )
    expect(disponibilite.compatible).toBe(false)
    const refusPolitique = disponibilite.conflits.find((c) => c.code === 'MAX_PARTY_SIZE')
    expect(refusPolitique?.regle).toBe('R8')
    expect(refusPolitique?.message).toBe('Une demande ne peut pas dépasser 6 personnes.')
  })

  it('POL-R1 : Solenne n’est jamais soumise aux réglages', () => {
    const { disponibilite } = evaluerDemande(
      candidat({ adultes: 8 }),
      contexte({
        estSolenne: true,
        reglages: { ...AUCUN_REGLAGE, maxPersonnesParDemande: 6 },
      }),
    )
    expect(disponibilite.compatible).toBe(true)
  })

  it('une demande nominale, compatible, sans aucun conflit', () => {
    const { prealables, disponibilite } = evaluerDemande(candidat(), contexte())
    expect(prealables).toEqual([])
    expect(disponibilite.compatible).toBe(true)
    expect(disponibilite.conflits).toEqual([])
  })
})
