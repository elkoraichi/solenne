import { describe, expect, it } from 'vitest'

import { jour } from '@/domain/core/dates'
import {
  verifierCoherence,
  verifierReglages,
  type DemandeReservation,
  type ReglagesReservation,
} from '@/domain/policy/reglages'

/**
 * `POLICY` — arrêt S6 (`POLICY-A`) : les huit réglages en domaine pur,
 * jamais opposés à Solenne (POL-R1), une règle désactivée ne s'évalue pas
 * (POL-R2). POL-R3 à R5 (persistance, console) attendent `POLICY-B`.
 */

const AUCUN_REGLAGE: ReglagesReservation = {
  dureeMaxNuits: null,
  delaiMinHeures: null,
  horizonMaxJours: null,
  joursArriveeInterdits: [],
  maxPersonnesParDemande: null,
  cohabitationAutorisee: true,
}

function reglages(modifications: Partial<ReglagesReservation> = {}): ReglagesReservation {
  return { ...AUCUN_REGLAGE, ...modifications }
}

function demande(modifications: Partial<DemandeReservation> = {}): DemandeReservation {
  return {
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    personnes: 4,
    maintenant: jour('2026-01-01'),
    ...modifications,
  }
}

function codes(refus: readonly { readonly code: string }[]): readonly string[] {
  return refus.map((r) => r.code)
}

const HEURE = 3_600_000
const JOUR = 86_400_000

describe('POLICY-001 et 002 — durée maximale', () => {
  it('POLICY-001 — refuse 10 nuits pour un maximum de 7', () => {
    const resultat = verifierReglages(
      demande({ arrivee: jour('2026-09-10'), depart: jour('2026-09-20') }),
      reglages({ dureeMaxNuits: 7 }),
    )

    expect(codes(resultat)).toEqual(['MAX_DURATION'])
    expect(resultat[0]?.message).toBe('Un séjour ne peut pas dépasser 7 nuits.')
  })

  it('POLICY-002 — accepte exactement 7 nuits pour un maximum de 7', () => {
    const resultat = verifierReglages(
      demande({ arrivee: jour('2026-09-10'), depart: jour('2026-09-17') }),
      reglages({ dureeMaxNuits: 7 }),
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-003 et 004 — délai minimum avant l’arrivée', () => {
  it('POLICY-003 — refuse une demande faite 24 h avant l’arrivée pour un délai de 48 h', () => {
    const arrivee = jour('2026-09-10')
    const resultat = verifierReglages(
      demande({ arrivee, maintenant: new Date(arrivee.getTime() - 24 * HEURE) }),
      reglages({ delaiMinHeures: 48 }),
    )

    expect(codes(resultat)).toEqual(['MIN_LEAD_TIME'])
  })

  it('POLICY-004 — accepte une demande faite 48 h et 1 min avant l’arrivée', () => {
    const arrivee = jour('2026-09-10')
    const resultat = verifierReglages(
      demande({
        arrivee,
        maintenant: new Date(arrivee.getTime() - (48 * HEURE + 60_000)),
      }),
      reglages({ delaiMinHeures: 48 }),
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-005 — horizon maximum de réservation', () => {
  it('refuse une demande faite 200 jours à l’avance pour un horizon de 180 jours', () => {
    const arrivee = jour('2026-09-10')
    const resultat = verifierReglages(
      demande({ arrivee, maintenant: new Date(arrivee.getTime() - 200 * JOUR) }),
      reglages({ horizonMaxJours: 180 }),
    )

    expect(codes(resultat)).toEqual(['MAX_ADVANCE'])
  })
})

describe('POLICY-006 — jour d’arrivée interdit', () => {
  it('refuse une arrivée un lundi quand le lundi est interdit', () => {
    // Le 2026-09-14 est un lundi.
    const resultat = verifierReglages(
      demande({ arrivee: jour('2026-09-14'), depart: jour('2026-09-16') }),
      reglages({ joursArriveeInterdits: [1] }),
    )

    expect(codes(resultat)).toEqual(['FORBIDDEN_WEEKDAY'])
  })

  it('accepte une arrivée un mardi quand seul le lundi est interdit', () => {
    // Le 2026-09-15 est un mardi.
    const resultat = verifierReglages(
      demande({ arrivee: jour('2026-09-15'), depart: jour('2026-09-17') }),
      reglages({ joursArriveeInterdits: [1] }),
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-007 — maximum de personnes par demande', () => {
  it('refuse 8 personnes pour un maximum de 6', () => {
    const resultat = verifierReglages(
      demande({ personnes: 8 }),
      reglages({ maxPersonnesParDemande: 6 }),
    )

    expect(codes(resultat)).toEqual(['MAX_PARTY_SIZE'])
    expect(resultat[0]?.message).toBe('Une demande ne peut pas dépasser 6 personnes.')
  })

  it('accepte exactement 6 personnes pour un maximum de 6', () => {
    const resultat = verifierReglages(
      demande({ personnes: 6 }),
      reglages({ maxPersonnesParDemande: 6 }),
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-008 — une règle désactivée n’est pas évaluée (POL-R2)', () => {
  it('accepte 30 nuits quand la durée maximale est désactivée', () => {
    const resultat = verifierReglages(
      demande({ arrivee: jour('2026-09-10'), depart: jour('2026-10-10') }),
      reglages({ dureeMaxNuits: null }),
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-010 — toutes les règles désactivées', () => {
  it('n’oppose jamais rien à une demande extrême quand aucun réglage n’est actif', () => {
    const arrivee = jour('2026-09-15') // un mardi, jamais interdit ici
    const resultat = verifierReglages(
      demande({
        arrivee,
        depart: jour('2026-11-15'), // 61 nuits
        personnes: 25,
        maintenant: new Date(arrivee.getTime() - HEURE), // 1 h d’avance
        periodeOccupee: true,
      }),
      AUCUN_REGLAGE,
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-015 — cohabitation désactivée (POL-R6)', () => {
  it('refuse une demande sur une période déjà occupée quand la cohabitation est désactivée', () => {
    const resultat = verifierReglages(
      demande({ periodeOccupee: true }),
      reglages({ cohabitationAutorisee: false }),
    )

    expect(codes(resultat)).toEqual(['EXCLUSIVE_CONFLICT'])
    expect(resultat[0]?.message).toBe('La maison est déjà privatisée sur ces dates.')
  })

  it('accepte une demande sur une période libre même cohabitation désactivée', () => {
    const resultat = verifierReglages(
      demande({ periodeOccupee: false }),
      reglages({ cohabitationAutorisee: false }),
    )

    expect(resultat).toEqual([])
  })
})

describe('POL-R1 — aucune règle ne s’applique à Solenne', () => {
  it('ignore tous les réglages actifs pour une demande de Solenne', () => {
    const resultat = verifierReglages(
      demande({
        arrivee: jour('2026-09-14'), // lundi interdit
        depart: jour('2026-11-14'),
        personnes: 25,
        estSolenne: true,
        periodeOccupee: true,
      }),
      reglages({
        dureeMaxNuits: 7,
        delaiMinHeures: 48,
        horizonMaxJours: 30,
        joursArriveeInterdits: [1],
        maxPersonnesParDemande: 6,
        cohabitationAutorisee: false,
      }),
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-009 — réglages contradictoires (POL-R9)', () => {
  it('refuse un délai minimum qui dépasse l’horizon maximum', () => {
    const resultat = verifierCoherence(
      reglages({ delaiMinHeures: 200 * 24, horizonMaxJours: 180 }),
      10,
    )

    expect(resultat.map((i) => i.code)).toEqual(['POLICY_UNREACHABLE'])
  })

  it('accepte un délai minimum qui tient dans l’horizon maximum', () => {
    const resultat = verifierCoherence(
      reglages({ delaiMinHeures: 48, horizonMaxJours: 180 }),
      10,
    )

    expect(resultat).toEqual([])
  })

  it('refuse les sept jours de la semaine interdits à l’arrivée', () => {
    const resultat = verifierCoherence(
      reglages({ joursArriveeInterdits: [1, 2, 3, 4, 5, 6, 7] }),
      10,
    )

    expect(resultat).toEqual([{ code: 'POLICY_UNREACHABLE' }])
  })

  it('accepte six jours interdits sur sept', () => {
    const resultat = verifierCoherence(
      reglages({ joursArriveeInterdits: [1, 2, 3, 4, 5, 6] }),
      10,
    )

    expect(resultat).toEqual([])
  })
})

describe('POLICY-011 — maximum par demande au-delà de la capacité (POL-R5)', () => {
  it('refuse un maximum de 15 pour une capacité de 10', () => {
    const resultat = verifierCoherence(
      reglages({ maxPersonnesParDemande: 15 }),
      10,
    )

    expect(resultat).toEqual([
      { code: 'MAX_PARTY_ABOVE_CAPACITY', parametres: { max: 10 } },
    ])
  })

  it('accepte un maximum égal à la capacité', () => {
    const resultat = verifierCoherence(
      reglages({ maxPersonnesParDemande: 10 }),
      10,
    )

    expect(resultat).toEqual([])
  })
})

describe('plusieurs réglages violés à la fois', () => {
  it('rend tous les refus, pas seulement le premier', () => {
    const arrivee = jour('2026-09-14') // lundi
    const resultat = verifierReglages(
      demande({
        arrivee,
        depart: jour('2026-09-25'), // 11 nuits
        personnes: 8,
        maintenant: new Date(arrivee.getTime() - 10 * HEURE),
      }),
      reglages({
        dureeMaxNuits: 7,
        delaiMinHeures: 48,
        joursArriveeInterdits: [1],
        maxPersonnesParDemande: 6,
      }),
    )

    expect(codes(resultat)).toEqual([
      'MAX_DURATION',
      'MIN_LEAD_TIME',
      'FORBIDDEN_WEEKDAY',
      'MAX_PARTY_SIZE',
    ])
  })
})
