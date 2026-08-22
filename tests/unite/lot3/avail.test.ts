import { describe, expect, it } from 'vitest'

import { instantDepuisHeureParis, jour } from '@/domain/core/dates'
import {
  conflit,
  resumePourSolenne,
  type ResultatDisponibilite,
} from '@/domain/availability/conflits'
import {
  verifierChevauchementEvenements,
  verifierDisponibilite,
  type ContexteDisponibilite,
  type DemandeDisponibilite,
  type SejourExistant,
} from '@/domain/availability/disponibilite'
import type { Presence } from '@/domain/occupancy/registre'

/**
 * `AVAIL` — garde-fou G1 (fichier voisin), les 8 règles.
 * Arrêt S3 : contrôles préalables, R1, R2, R3, R4.
 * Arrêt S4 : R5 cohabitation, R6 événements (dormant), R7 séjour pendant
 * événement, R8 délégation à `POLICY`. Leurs combinaisons arrivent à S5.
 */

function demande(modifications: Partial<DemandeDisponibilite> = {}): DemandeDisponibilite {
  return {
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    personnes: 4,
    ...modifications,
  }
}

/** Un séjour existant : des dates, une exclusivité — jamais un effectif (G1). */
function sejour(modifications: Partial<SejourExistant> = {}): SejourExistant {
  return {
    reference: 'sejour-existant',
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    exclusif: false,
    ...modifications,
  }
}

/** Les personnes de ce séjour, telles que `OCCUP` les verra. */
function presence(personnes: number, modifications: Partial<Presence> = {}): Presence {
  return {
    contributeur: 'SEJOUR_CONFIRME',
    reference: 'sejour-existant',
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    personnes,
    ...modifications,
  }
}

function contexte(modifications: Partial<ContexteDisponibilite> = {}): ContexteDisponibilite {
  return { capacite: 10, presences: [], ...modifications }
}

function codes(resultat: ResultatDisponibilite): readonly string[] {
  return resultat.conflits.map((conflit) => conflit.code)
}

describe('AVAIL-001 — période libre', () => {
  it('accepte 4 personnes du 10 au 12 dans une maison vide de 10 places', () => {
    const resultat = verifierDisponibilite(demande(), contexte())

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })
})

describe('AVAIL-002 à 004 — R1, les périodes bloquées', () => {
  it('AVAIL-002 — refuse une demande entièrement dans un blocage', () => {
    const resultat = verifierDisponibilite(
      demande(),
      contexte({ blocages: [{ du: jour('2026-09-08'), au: jour('2026-09-15') }] }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['BLOCKED_PERIOD'])
    expect(resultat.conflits[0]?.message).toBe('Ces dates ne sont pas disponibles.')
  })

  it('AVAIL-003 — refuse un chevauchement partiel', () => {
    const resultat = verifierDisponibilite(
      demande(),
      contexte({ blocages: [{ du: jour('2026-09-11'), au: jour('2026-09-20') }] }),
    )

    expect(codes(resultat)).toEqual(['BLOCKED_PERIOD'])
  })

  it('AVAIL-004 — accepte un blocage adjacent : le 12 n’est pas occupé', () => {
    const resultat = verifierDisponibilite(
      demande(),
      contexte({ blocages: [{ du: jour('2026-09-12'), au: jour('2026-09-15') }] }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })
})

describe('AVAIL-005 à 008 — R2 et R3, l’exclusivité dans les deux sens', () => {
  it('AVAIL-005 — refuse une demande qui chevauche un séjour exclusif', () => {
    const resultat = verifierDisponibilite(
      demande({ arrivee: jour('2026-09-11'), depart: jour('2026-09-13'), personnes: 2 }),
      contexte({
        sejours: [sejour({ exclusif: true })],
        presences: [presence(2)],
      }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['EXCLUSIVE_CONFLICT'])
    expect(resultat.conflits[0]?.message).toBe(
      'La maison est déjà privatisée sur ces dates.',
    )
  })

  it('AVAIL-006 — refuse même quand la place ne manque pas : 4 personnes pour 25 places', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 2 }),
      contexte({
        capacite: 25,
        sejours: [sejour({ exclusif: true })],
        presences: [presence(2)],
      }),
    )

    expect(codes(resultat)).toEqual(['EXCLUSIVE_CONFLICT'])
  })

  it('AVAIL-007 — refuse une privatisation sur une période déjà occupée', () => {
    const resultat = verifierDisponibilite(
      demande({ exclusif: true }),
      contexte({ sejours: [sejour()], presences: [presence(3)] }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['EXCLUSIVE_REQUEST_CONFLICT'])
    expect(resultat.conflits[0]?.message).toBe(
      "Un séjour est déjà prévu : la privatisation n'est pas possible.",
    )
  })

  it('AVAIL-008 — accepte une privatisation sur une période libre', () => {
    const resultat = verifierDisponibilite(demande({ exclusif: true }), contexte())

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('ne s’oppose pas au séjour qu’on est justement en train de modifier', () => {
    const resultat = verifierDisponibilite(
      demande({ exclusif: true, referenceAExclure: 'sejour-existant' }),
      contexte({ sejours: [sejour({ exclusif: true })], presences: [presence(3)] }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })
})

describe('AVAIL-009 à 013 — R4, la capacité', () => {
  it('AVAIL-009 — refuse 8 occupés plus 4 demandés pour 10 places', () => {
    const resultat = verifierDisponibilite(demande(), contexte({ presences: [presence(8)] }))

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['CAPACITY_EXCEEDED'])
    expect(resultat.conflits[0]?.details).toEqual({
      occupation: 8,
      demande: 4,
      total: 12,
      capacite: 10,
    })
    // Le message de l'ami ne chiffre rien (PRIV-005) ; celui de Solenne, si.
    expect(resumePourSolenne(resultat.conflits[0]!)).toContain('12 personnes pour 10 places')
  })

  it('AVAIL-010 — accepte la capacité exactement atteinte : 6 + 4 pour 10', () => {
    const resultat = verifierDisponibilite(demande(), contexte({ presences: [presence(6)] }))

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('AVAIL-011 — refuse un dépassement de 1 : 7 + 4 pour 10', () => {
    const resultat = verifierDisponibilite(demande(), contexte({ presences: [presence(7)] }))

    expect(codes(resultat)).toEqual(['CAPACITY_EXCEEDED'])
    expect(resultat.conflits[0]?.details?.total).toBe(11)
  })

  it('AVAIL-012 — accepte la borne minimale : 1 personne pour 1 place', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 1 }),
      contexte({ capacite: 1 }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('AVAIL-013 — accepte la borne maximale : 25 personnes pour 25 places', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 25 }),
      contexte({ capacite: 25 }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('compare la capacité au jour le plus chargé, pas à une moyenne', () => {
    // Six personnes le 10 seulement. La demande de 5 tient les 11, 12 et 13 ;
    // elle ne tient pas le 10 — un seul jour suffit à refuser.
    const resultat = verifierDisponibilite(
      demande({ arrivee: jour('2026-09-10'), depart: jour('2026-09-14'), personnes: 5 }),
      contexte({
        presences: [
          presence(6, { arrivee: jour('2026-09-08'), depart: jour('2026-09-11') }),
        ],
      }),
    )

    expect(codes(resultat)).toEqual(['CAPACITY_EXCEEDED'])
    expect(resultat.conflits[0]?.details?.total).toBe(11)
  })
})

describe('AVAIL-014 à 017 — R5, la cohabitation n’a pas de code : c’est l’absence de R2/R4', () => {
  it('AVAIL-014 — un séjour de 4 plus une demande de 3 tient à 7/10', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 3 }),
      contexte({ sejours: [sejour()], presences: [presence(4)] }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('AVAIL-015 — trois séjours simultanés tiennent à 11/12', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 4 }),
      contexte({
        capacite: 12,
        presences: [
          presence(4, { reference: 'sejour-a' }),
          presence(3, { reference: 'sejour-b' }),
        ],
      }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('AVAIL-016 — cohabitation partielle : seul le 10 dépasse (11/10)', () => {
    const resultat = verifierDisponibilite(
      demande({ arrivee: jour('2026-09-10'), depart: jour('2026-09-14'), personnes: 5 }),
      contexte({
        presences: [presence(6, { arrivee: jour('2026-09-08'), depart: jour('2026-09-11') })],
      }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['CAPACITY_EXCEEDED'])
    expect(resultat.conflits[0]?.details?.total).toBe(11)
  })

  it('AVAIL-017 — aucun chevauchement, aucune interférence', () => {
    const resultat = verifierDisponibilite(
      demande({ arrivee: jour('2026-09-10'), depart: jour('2026-09-12') }),
      contexte({
        presences: [presence(6, { arrivee: jour('2026-09-08'), depart: jour('2026-09-10') })],
      }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })
})

describe('AVAIL-018 à 020 — R6, deux événements qui se chevauchent (D8) — dormant', () => {
  // `verifierChevauchementEvenements` applique déjà la règle ; personne ne
  // l'appelle encore (`EVENT` arrive au lot 4). Les trois cas la testent
  // directement, comme un futur appelant le fera.
  function evenement(depart: string, debutH: number, finH: number) {
    const jourLocal = jour(depart)
    return {
      reference: 'evenement-existant',
      debut: instantDepuisHeureParis(jourLocal, debutH),
      fin: instantDepuisHeureParis(jourLocal, finH),
    }
  }

  it('AVAIL-018 — 14h→22h et 18h→23h le même jour se chevauchent', () => {
    const resultat = verifierChevauchementEvenements(
      { debut: instantDepuisHeureParis(jour('2026-09-12'), 18), fin: instantDepuisHeureParis(jour('2026-09-12'), 23) },
      [evenement('2026-09-12', 14, 22)],
    )

    expect(resultat).toEqual(conflit('R6', 'EVENT_OVERLAP'))
  })

  it('AVAIL-019 — 14h→18h puis 18h→22h sont contigus, pas chevauchants', () => {
    const resultat = verifierChevauchementEvenements(
      { debut: instantDepuisHeureParis(jour('2026-09-12'), 18), fin: instantDepuisHeureParis(jour('2026-09-12'), 22) },
      [evenement('2026-09-12', 14, 18)],
    )

    expect(resultat).toBeNull()
  })

  it('AVAIL-020 — deux jours distincts, aucun conflit', () => {
    const resultat = verifierChevauchementEvenements(
      { debut: instantDepuisHeureParis(jour('2026-09-13'), 14), fin: instantDepuisHeureParis(jour('2026-09-13'), 22) },
      [evenement('2026-09-12', 14, 22)],
    )

    expect(resultat).toBeNull()
  })
})

describe('AVAIL-021 à 023 — R7, un séjour pendant un événement est le cas nominal (D3)', () => {
  // Aucun code n'existe pour « un événement a lieu » : rien ne le vérifie, donc
  // rien ne le refuse. Seule R4 arbitre — ici via les dormeurs de l'événement.
  // `DORMEUR_ÉVÉNEMENT` étant encore dormant dans `OCCUP` (lot 4 l'activera),
  // ces dormeurs sont représentés par des séjours confirmés, comme `OCCUP-018`
  // l'a fait avant nous : le mécanisme est identique, seule la source change.

  it('AVAIL-021 — cas nominal : un événement a lieu, la demande passe', () => {
    const resultat = verifierDisponibilite(
      demande({ arrivee: jour('2026-09-11'), depart: jour('2026-09-13'), personnes: 4 }),
      contexte({ capacite: 15 }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('AVAIL-022 — capacité saturée par les dormeurs de l’événement : c’est R4 qui tranche, pas R7', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 5 }),
      contexte({ capacite: 15, presences: [presence(12, { reference: 'dormeurs-evenement' })] }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['CAPACITY_EXCEEDED'])
  })

  it('AVAIL-023 — plusieurs séjours pendant l’événement, la place suffit encore', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 5 }),
      contexte({
        capacite: 20,
        presences: [
          presence(3, { reference: 'sejour-a' }),
          presence(4, { reference: 'sejour-b' }),
        ],
      }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })
})

describe('AVAIL-024 et 025 — R8, `AVAIL` rapporte les refus de `POLICY`, il ne les calcule pas', () => {
  it('AVAIL-024 — un seul refus de politique', () => {
    const resultat = verifierDisponibilite(
      demande(),
      contexte({ conflitsPolitique: [conflit('R8', 'MIN_LEAD_TIME', { parametres: { n: 48 } })] }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['MIN_LEAD_TIME'])
    expect(resultat.conflits[0]?.message).toBe('Il faut demander au moins 48 h à l’avance.')
  })

  it('AVAIL-025 — plusieurs refus de politique, tous rapportés', () => {
    const resultat = verifierDisponibilite(
      demande(),
      contexte({
        conflitsPolitique: [
          conflit('R8', 'MAX_DURATION', { parametres: { n: 7 } }),
          conflit('R8', 'MAX_ADVANCE', { parametres: { n: 180 } }),
        ],
      }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['MAX_DURATION', 'MAX_ADVANCE'])
  })

  it('mêle un refus de politique à un refus d’`AVAIL`, trié par gravité', () => {
    const resultat = verifierDisponibilite(
      demande(),
      contexte({
        presences: [presence(8)],
        conflitsPolitique: [conflit('R8', 'MAX_DURATION', { parametres: { n: 7 } })],
      }),
    )

    // R4 (capacité) passe avant R8 (`ORDRE_GRAVITE`) : ce qui se corrige en
    // changeant un nombre d'abord, ce qui tient à un réglage ensuite.
    expect(codes(resultat)).toEqual(['CAPACITY_EXCEEDED', 'MAX_DURATION'])
  })
})

describe('AVAIL-026 — dates invalides (avancé depuis S4 : sans lui, le calcul lèverait)', () => {
  it.each([
    ['départ avant arrivée', jour('2026-09-12'), jour('2026-09-10')],
    ['départ le jour de l’arrivée', jour('2026-09-10'), jour('2026-09-10')],
  ])('refuse %s, et n’évalue aucune autre règle', (_cas, arrivee, depart) => {
    const resultat = verifierDisponibilite(
      { arrivee, depart, personnes: 40 },
      contexte({ blocages: [{ du: jour('2026-09-01'), au: jour('2026-09-30') }] }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['INVALID_DATES'])
  })
})
