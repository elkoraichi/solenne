import { describe, expect, it } from 'vitest'

import type { CodeMetier } from '@/domain/core/error-codes'
import { instantDepuisHeureParis, jour } from '@/domain/core/dates'
import {
  conflit,
  ORDRE_GRAVITE,
  resumePourSolenne,
  type Regle,
  type ResultatDisponibilite,
} from '@/domain/availability/conflits'
import {
  verifierChevauchementEvenements,
  verifierDisponibilite,
  type ContexteDisponibilite,
  type DemandeDisponibilite,
  type EvenementExistant,
  type SejourExistant,
} from '@/domain/availability/disponibilite'
import type { Presence } from '@/domain/occupancy/registre'

/**
 * `AVAIL` — garde-fou G1 (fichier voisin), les 8 règles.
 * Arrêt S3 : contrôles préalables, R1, R2, R3, R4.
 * Arrêt S4 : R5 cohabitation, R6 événements (dormant), R7 séjour pendant
 * événement, R8 délégation à `POLICY`.
 * Arrêt S5 : leurs **combinaisons** — `AVAIL-027` à `034`.
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
      'La maison est déjà occupée sur ces dates : la privatisation n’est pas possible.',
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

// ---------------------------------------------------------------------------
// Arrêt S5 — les combinaisons. Rien de neuf règle par règle : ce qui se joue
// ici, c'est ce que les règles se font les unes aux autres quand elles se
// rencontrent. Un moteur qui rend le premier refus venu passerait tous les
// tests précédents et échouerait sur tous ceux-ci.
// ---------------------------------------------------------------------------

/** Un événement à l'agenda, tel que le contexte le porte : des heures, pas des jours. */
function evenementLe(jourLocal: string, debutH = 14, finH = 22): EvenementExistant {
  const local = jour(jourLocal)
  return {
    reference: `evenement-${jourLocal}`,
    debut: instantDepuisHeureParis(local, debutH),
    fin: instantDepuisHeureParis(local, finH),
  }
}

describe('AVAIL-027 et 028 — deux règles refusent, les deux refus sortent', () => {
  it('AVAIL-027 — R1 + R4 : blocage et capacité saturée', () => {
    const resultat = verifierDisponibilite(
      demande({ arrivee: jour('2026-09-10'), depart: jour('2026-09-12'), personnes: 4 }),
      contexte({
        capacite: 10,
        blocages: [{ du: jour('2026-09-11'), au: jour('2026-09-13') }],
        presences: [presence(8)],
      }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['BLOCKED_PERIOD', 'CAPACITY_EXCEEDED'])
  })

  it('AVAIL-028 — R2 + R4 : séjour exclusif et capacité saturée', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 4 }),
      contexte({
        capacite: 10,
        sejours: [sejour({ exclusif: true })],
        presences: [presence(8)],
      }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['EXCLUSIVE_CONFLICT', 'CAPACITY_EXCEEDED'])
  })
})

describe('AVAIL-029 à 031 — R7 croisée avec les autres : l’événement n’est pas un joker', () => {
  // Un événement n'accorde rien et n'interdit rien par lui-même (D3, cas
  // nominal). Il pèse de deux façons seulement : par ses dormeurs, que `OCCUP`
  // compte et que R4 arbitre ; et par sa seule présence, qui empêche de
  // privatiser la maison — on ne vide pas une maison où l'on reçoit.

  it('AVAIL-029 — R4 + R7 + dormeurs : 4 + 6 + 3 pour 12 places', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 3 }),
      contexte({
        capacite: 12,
        evenements: [evenementLe('2026-09-11')],
        sejours: [sejour({ reference: 'sejour-amis' })],
        presences: [
          presence(4, { reference: 'sejour-amis' }),
          // `DORMEUR_ÉVÉNEMENT` reste dormant dans `OCCUP` : les six dormeurs
          // sont portés par un séjour confirmé, comme à `AVAIL-022`. À rejouer
          // tel quel quand `SLEEP` (lot 4) activera le vrai contributeur.
          presence(6, { reference: 'dormeurs-evenement' }),
        ],
      }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['CAPACITY_EXCEEDED'])
    expect(resultat.conflits[0]?.details).toEqual({
      occupation: 10,
      demande: 3,
      total: 13,
      capacite: 12,
    })
  })

  it('AVAIL-030 — R5 + R7 : un séjour, un événement sans dormeur, 8 sur 12', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 4 }),
      contexte({
        capacite: 12,
        evenements: [evenementLe('2026-09-11')],
        sejours: [sejour({ reference: 'sejour-amis' })],
        presences: [presence(4, { reference: 'sejour-amis' })],
      }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })

  it('AVAIL-031 — R3 + R7 : on ne privatise pas la maison pendant un événement', () => {
    const resultat = verifierDisponibilite(
      demande({ arrivee: jour('2026-09-11'), depart: jour('2026-09-13'), exclusif: true }),
      // Ni séjour ni dormeur : l'événement est seul à occuper la maison. Sans
      // lui, la même demande serait accordée (`AVAIL-008`).
      contexte({ capacite: 25, evenements: [evenementLe('2026-09-12')] }),
    )

    expect(resultat.compatible).toBe(false)
    expect(codes(resultat)).toEqual(['EXCLUSIVE_REQUEST_CONFLICT'])
  })

  it('un événement hors période ne s’oppose à rien', () => {
    const resultat = verifierDisponibilite(
      demande({ exclusif: true }),
      contexte({ capacite: 25, evenements: [evenementLe('2026-09-20')] }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
  })
})

describe('AVAIL-032 et 033 — l’ordre, et rien de masqué', () => {
  it('AVAIL-032 — trois refus simultanés, le plus grave en tête', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 4 }),
      contexte({
        capacite: 10,
        blocages: [{ du: jour('2026-09-08'), au: jour('2026-09-15') }],
        sejours: [sejour({ exclusif: true })],
        presences: [presence(8)],
      }),
    )

    // R1 (rien à négocier) · R2 (rien à négocier non plus, mais moins définitif)
    // · R4 (venir moins nombreux suffirait). `ORDRE_GRAVITE`, inchangé depuis S3.
    expect(codes(resultat)).toEqual([
      'BLOCKED_PERIOD',
      'EXCLUSIVE_CONFLICT',
      'CAPACITY_EXCEEDED',
    ])
  })

  it('AVAIL-033 — quatre refus d’`AVAIL`, les quatre renvoyés', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 4, exclusif: true }),
      contexte({
        capacite: 5,
        blocages: [{ du: jour('2026-09-08'), au: jour('2026-09-15') }],
        sejours: [sejour({ exclusif: true })],
        presences: [presence(4)],
      }),
    )

    expect(codes(resultat)).toEqual([
      'BLOCKED_PERIOD',
      'EXCLUSIVE_CONFLICT',
      'EXCLUSIVE_REQUEST_CONFLICT',
      'CAPACITY_EXCEEDED',
    ])
  })

  it('un refus de `POLICY` s’ajoute aux quatre sans en effacer aucun', () => {
    const resultat = verifierDisponibilite(
      demande({ personnes: 4, exclusif: true }),
      contexte({
        capacite: 5,
        blocages: [{ du: jour('2026-09-08'), au: jour('2026-09-15') }],
        sejours: [sejour({ exclusif: true })],
        presences: [presence(4)],
        conflitsPolitique: [conflit('R8', 'MAX_DURATION', { parametres: { n: 7 } })],
      }),
    )

    expect(codes(resultat)).toEqual([
      'BLOCKED_PERIOD',
      'EXCLUSIVE_CONFLICT',
      'EXCLUSIVE_REQUEST_CONFLICT',
      'CAPACITY_EXCEEDED',
      'MAX_DURATION',
    ])
  })
})

describe('AVAIL-034 — table de décision exhaustive', () => {
  /**
   * Un **levier** : le geste minimal qui met une règle en situation. Chacun ne
   * touche qu'à ce dont sa propre règle a besoin, pour qu'une combinaison ne
   * dise rien d'autre que la somme de ses deux leviers.
   *
   * `R5` et `R7` ont un levier et **aucun code** : leur verdict est ✅. C'est
   * la moitié de ce que la table démontre — qu'elles ne refusent jamais, seules
   * comme accompagnées.
   */
  interface Etat {
    readonly demande: DemandeDisponibilite
    readonly contexte: ContexteDisponibilite
  }

  interface Levier {
    readonly nom: string
    readonly regle: Regle
    readonly code: CodeMetier | null
    readonly appliquer: (etat: Etat) => Etat
  }

  const BASE: Etat = {
    demande: { arrivee: jour('2026-09-10'), depart: jour('2026-09-12'), personnes: 2 },
    contexte: { capacite: 25, presences: [] },
  }

  const LEVIERS: readonly Levier[] = [
    {
      nom: 'PRE dates inversées',
      regle: 'PRE',
      code: 'INVALID_DATES',
      appliquer: ({ demande, contexte }) => ({
        demande: { ...demande, arrivee: jour('2026-09-12'), depart: jour('2026-09-10') },
        contexte,
      }),
    },
    {
      nom: 'R1 maison fermée',
      regle: 'R1',
      code: 'BLOCKED_PERIOD',
      appliquer: ({ demande, contexte }) => ({
        demande,
        contexte: { ...contexte, blocages: [{ du: jour('2026-09-08'), au: jour('2026-09-15') }] },
      }),
    },
    {
      nom: 'R2 privatisée par un autre',
      regle: 'R2',
      code: 'EXCLUSIVE_CONFLICT',
      appliquer: ({ demande, contexte }) => ({
        demande,
        contexte: {
          ...contexte,
          sejours: [...(contexte.sejours ?? []), sejour({ reference: 'privatise', exclusif: true })],
        },
      }),
    },
    {
      // Une privatisation ne se refuse jamais toute seule : il faut que
      // quelque chose occupe la maison. L'événement est le plus léger des
      // occupants — il n'ajoute ni séjour ni personne, donc il ne réveille
      // ni R2 ni R4.
      nom: 'R3 privatisation demandée sur une maison occupée',
      regle: 'R3',
      code: 'EXCLUSIVE_REQUEST_CONFLICT',
      appliquer: ({ demande, contexte }) => ({
        demande: { ...demande, exclusif: true },
        contexte: {
          ...contexte,
          evenements: [...(contexte.evenements ?? []), evenementLe('2026-09-11')],
        },
      }),
    },
    {
      nom: 'R4 capacité dépassée',
      regle: 'R4',
      code: 'CAPACITY_EXCEEDED',
      appliquer: ({ demande, contexte }) => ({ demande, contexte: { ...contexte, capacite: 1 } }),
    },
    {
      nom: 'R5 cohabitation',
      regle: 'R5',
      code: null,
      appliquer: ({ demande, contexte }) => ({
        demande,
        contexte: {
          ...contexte,
          sejours: [...(contexte.sejours ?? []), sejour({ reference: 'voisins' })],
          presences: [...contexte.presences, presence(3, { reference: 'voisins' })],
        },
      }),
    },
    {
      nom: 'R7 séjour pendant un événement',
      regle: 'R7',
      code: null,
      appliquer: ({ demande, contexte }) => ({
        demande,
        contexte: {
          ...contexte,
          evenements: [...(contexte.evenements ?? []), evenementLe('2026-09-10', 18, 23)],
        },
      }),
    },
    {
      nom: 'R8 refus de POLICY',
      regle: 'R8',
      code: 'MIN_LEAD_TIME',
      appliquer: ({ demande, contexte }) => ({
        demande,
        contexte: {
          ...contexte,
          conflitsPolitique: [conflit('R8', 'MIN_LEAD_TIME', { parametres: { n: 48 } })],
        },
      }),
    },
  ]

  /**
   * Le verdict attendu, écrit sans rejouer le moteur : les contrôles préalables
   * masquent tout le reste, sinon on lit `ORDRE_GRAVITE` de haut en bas et on
   * garde les règles présentes.
   */
  function attendu(leviers: readonly Levier[]): readonly string[] {
    if (leviers.some((levier) => levier.regle === 'PRE')) return ['INVALID_DATES']
    return ORDRE_GRAVITE.flatMap((regle) =>
      leviers
        .filter((levier) => levier.regle === regle && levier.code !== null)
        .map((levier) => levier.code as string),
    )
  }

  const SEULS = LEVIERS.map((levier) => [levier])
  const PAIRES = LEVIERS.flatMap((a, i) => LEVIERS.slice(i + 1).map((b) => [a, b]))
  const CAS = [...SEULS, ...PAIRES]

  it('couvre les 8 leviers seuls et leurs 28 paires', () => {
    expect(CAS).toHaveLength(36)
  })

  it.each(CAS.map((leviers) => [leviers.map((l) => l.nom).join(' + '), leviers] as const))(
    '%s',
    (_titre, leviers) => {
      const etat = leviers.reduce<Etat>((courant, levier) => levier.appliquer(courant), BASE)
      const resultat = verifierDisponibilite(etat.demande, etat.contexte)
      const codesAttendus = attendu(leviers)

      expect(codes(resultat)).toEqual(codesAttendus)
      expect(resultat.compatible).toBe(codesAttendus.length === 0)
    },
  )

  it('R6 n’est pas dans la table : `verifierDisponibilite` ne l’appelle pas', () => {
    // D8 vit dans `verifierChevauchementEvenements` (`AVAIL-018→020`), que
    // `EVENT` appellera au lot 4. Deux événements qui se chevauchent dans le
    // contexte d'un séjour ne regardent pas ce moteur-ci : il n'a pas à en
    // rendre compte, et surtout pas à refuser un séjour pour cette raison.
    const resultat = verifierDisponibilite(
      demande({ personnes: 2 }),
      contexte({
        capacite: 25,
        evenements: [evenementLe('2026-09-10', 14, 22), evenementLe('2026-09-10', 18, 23)],
      }),
    )

    expect(resultat).toEqual({ compatible: true, conflits: [] })
    expect(LEVIERS.some((levier) => levier.regle === 'R6')).toBe(false)
  })
})
