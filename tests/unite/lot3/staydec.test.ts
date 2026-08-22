import { describe, expect, it } from 'vitest'

import { conflit, resumePourSolenne } from '@/domain/availability/conflits'
import type { SejourExistant } from '@/domain/availability/disponibilite'
import { jour } from '@/domain/core/dates'
import type { Presence } from '@/domain/occupancy/registre'
import type { ReglagesReservation } from '@/domain/policy/reglages'
import {
  estForcable,
  evaluerAcceptation,
  verifierDecidable,
  type ContexteDecision,
  type DemandeADecider,
} from '@/domain/stays/decision'

/**
 * `STAYDEC` — arrêt `STAYDEC-A`, la part de domaine pur des sept cas.
 *
 * Les sept cas de l'arrêt sont tous marqués *Integration* ou *Concurrency* dans
 * la fiche, et le sont bien : leur vraie preuve est dans
 * `tests/integration/lot3/decisions-sejour.test.ts`. Mais trois d'entre eux
 * reposent sur une décision de domaine qu'aucune assertion de base de données
 * ne montre en clair — ce qui se force et ce qui ne se force pas (`005` /
 * `014`), et le fait que le verdict soit recalculé depuis le contexte reçu
 * (`006`). C'est ce que ce fichier isole, sans Postgres.
 *
 * Le premier point du contrat — « `evaluerAcceptation` ne reçoit aucun verdict
 * pré-calculé » — ne se teste pas : il n'existe aucun appel à écrire qui le
 * violerait. C'est un choix de signature, et sa preuve est que le type
 * `ContexteDecision` n'offre nulle part où ranger un verdict.
 */

const AUCUN_REGLAGE: ReglagesReservation = {
  dureeMaxNuits: null,
  delaiMinHeures: null,
  horizonMaxJours: null,
  joursArriveeInterdits: [],
  maxPersonnesParDemande: null,
  cohabitationAutorisee: true,
}

const MAINTENANT = jour('2026-09-01')

function demande(modifications: Partial<DemandeADecider> = {}): DemandeADecider {
  return {
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    adultes: 4,
    enfants: 0,
    exclusif: false,
    statut: 'PENDING',
    demandeurEstSolenne: false,
    ...modifications,
  }
}

function contexte(modifications: Partial<ContexteDecision> = {}): ContexteDecision {
  return {
    capacite: 10,
    presences: [],
    sejours: [],
    blocages: [],
    reglages: AUCUN_REGLAGE,
    periodeOccupee: false,
    ...modifications,
  }
}

function sejour(modifications: Partial<SejourExistant> = {}): SejourExistant {
  return {
    reference: 'sejour-existant',
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    exclusif: false,
    ...modifications,
  }
}

function presence(personnes: number): Presence {
  return {
    contributeur: 'SEJOUR_CONFIRME',
    reference: 'sejour-existant',
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    personnes,
  }
}

describe('SDEC-R6 — une demande ne se décide qu’une fois', () => {
  it('laisse passer une demande en attente', () => {
    expect(verifierDecidable('PENDING')).toBeNull()
  })

  it('distingue « déjà traitée » de « annulée par le demandeur »', () => {
    expect(verifierDecidable('ACCEPTED')?.code).toBe('REQUEST_ALREADY_DECIDED')
    expect(verifierDecidable('REJECTED')?.code).toBe('REQUEST_ALREADY_DECIDED')
    expect(verifierDecidable('CANCELLED')?.code).toBe('REQUEST_CANCELLED')
  })

  it('rend un message français, jamais un code nu', () => {
    expect(verifierDecidable('CANCELLED')?.message).toBe(
      'Cette demande a été annulée par la personne qui l’avait faite. Il n’y a plus rien à décider.',
    )
  })
})

describe('SDEC-R4 — ce qui se force et ce qui ne se force pas', () => {
  it('laisse forcer une gêne : blocage, capacité, règle de politique', () => {
    expect(estForcable([conflit('R1', 'BLOCKED_PERIOD')])).toBe(true)
    expect(estForcable([conflit('R4', 'CAPACITY_EXCEEDED')])).toBe(true)
    expect(estForcable([conflit('R8', 'MAX_DURATION')])).toBe(true)
  })

  it('refuse de forcer une promesse faite à quelqu’un d’autre (R2, R3)', () => {
    expect(estForcable([conflit('R2', 'EXCLUSIVE_CONFLICT')])).toBe(false)
    expect(estForcable([conflit('R3', 'EXCLUSIVE_REQUEST_CONFLICT')])).toBe(false)
  })

  it('un seul conflit non forçable suffit à tout bloquer', () => {
    expect(
      estForcable([conflit('R4', 'CAPACITY_EXCEEDED'), conflit('R2', 'EXCLUSIVE_CONFLICT')]),
    ).toBe(false)
  })
})

describe('STAYDEC-001 — acceptation nominale, côté domaine', () => {
  it('ne rend aucun refus quand la maison est libre', () => {
    const verdict = evaluerAcceptation(demande(), contexte(), { maintenant: MAINTENANT })

    expect(verdict.refus).toBeNull()
    expect(verdict.disponibilite.compatible).toBe(true)
    expect(verdict.confirmationSuffirait).toBe(false)
  })
})

describe('STAYDEC-005 — demande devenue incompatible', () => {
  const avecBlocage = contexte({
    blocages: [{ du: jour('2026-09-11'), au: jour('2026-09-15') }],
  })

  it('refuse sans confirmation, en disant pourquoi et que confirmer suffirait', () => {
    const verdict = evaluerAcceptation(demande(), avecBlocage, { maintenant: MAINTENANT })

    // Le code est celui du conflit, pas un code générique : Solenne doit savoir
    // ce qui s'oppose, et `Echec` n'a de place que pour un code.
    expect(verdict.refus?.code).toBe('BLOCKED_PERIOD')
    expect(verdict.refus?.message).toBe(
      'Ces dates ne sont pas disponibles. Confirmez explicitement pour accepter quand même.',
    )
    expect(verdict.confirmationSuffirait).toBe(true)
    // L'écran de Solenne a besoin du détail, pas seulement du refus.
    expect(verdict.disponibilite.conflits.map((c) => c.code)).toEqual(['BLOCKED_PERIOD'])
  })

  it('accepte avec confirmation explicite, sans prétendre que c’est compatible', () => {
    const verdict = evaluerAcceptation(demande(), avecBlocage, {
      maintenant: MAINTENANT,
      confirme: true,
    })

    expect(verdict.refus).toBeNull()
    // Le séjour se fera, mais le verdict reste incompatible : c'est lui que
    // l'audit garde (`forcee: true`).
    expect(verdict.disponibilite.compatible).toBe(false)
  })
})

describe('STAYDEC-006 — le moteur est rejoué avec les valeurs actuelles', () => {
  const quatreAdultes = demande()
  const sixPersonnesDeja = { presences: [presence(6)], sejours: [sejour()] }

  it('accepte tant que la capacité actuelle suffit', () => {
    const verdict = evaluerAcceptation(
      quatreAdultes,
      contexte({ capacite: 10, ...sixPersonnesDeja }),
      { maintenant: MAINTENANT },
    )

    expect(verdict.refus).toBeNull()
  })

  it('bascule dès que la capacité reçue baisse — même demande, autre contexte', () => {
    const verdict = evaluerAcceptation(
      quatreAdultes,
      contexte({ capacite: 8, ...sixPersonnesDeja }),
      { maintenant: MAINTENANT },
    )

    expect(verdict.refus?.code).toBe('CAPACITY_EXCEEDED')
    expect(verdict.confirmationSuffirait).toBe(true)
    expect(verdict.disponibilite.conflits.map((c) => c.code)).toEqual(['CAPACITY_EXCEEDED'])
    // Le chiffre que lit Solenne est celui d'aujourd'hui, pas celui du jour de
    // la demande : 6 déjà là + 4 demandés, pour 8 places.
    expect(resumePourSolenne(verdict.disponibilite.conflits[0]!)).toBe(
      'La maison serait à 10 personnes pour 8 places.',
    )
    expect(verdict.refus?.message).toBe(
      'La maison serait à 10 personnes pour 8 places. Confirmez explicitement pour accepter quand même.',
    )
  })
})

describe('STAYDEC-014 — l’exclusivité ne se force pas', () => {
  const maisonPrivatisee = contexte({
    sejours: [sejour({ exclusif: true })],
    presences: [presence(2)],
  })

  it('refuse une demande ordinaire sur une période privatisée', () => {
    const verdict = evaluerAcceptation(demande(), maisonPrivatisee, {
      maintenant: MAINTENANT,
    })

    expect(verdict.refus?.code).toBe('EXCLUSIVE_CONFLICT')
    expect(verdict.confirmationSuffirait).toBe(false)
  })

  it('refuse encore avec confirme — la confirmation n’ouvre pas cette porte', () => {
    const verdict = evaluerAcceptation(demande(), maisonPrivatisee, {
      maintenant: MAINTENANT,
      confirme: true,
    })

    expect(verdict.refus?.code).toBe('EXCLUSIVE_CONFLICT')
    expect(verdict.confirmationSuffirait).toBe(false)
  })

  it('refuse aussi la privatisation demandée sur une période occupée (R3)', () => {
    const verdict = evaluerAcceptation(
      demande({ exclusif: true }),
      contexte({ sejours: [sejour()], presences: [presence(3)], periodeOccupee: true }),
      { maintenant: MAINTENANT, confirme: true },
    )

    expect(verdict.refus?.code).toBe('EXCLUSIVE_REQUEST_CONFLICT')
    expect(verdict.confirmationSuffirait).toBe(false)
  })
})

describe('POL-R1 — la question porte sur le demandeur, jamais sur le décideur', () => {
  const reglageEtroit: ReglagesReservation = { ...AUCUN_REGLAGE, maxPersonnesParDemande: 1 }

  it('applique les réglages à une demande d’ami', () => {
    const verdict = evaluerAcceptation(demande(), contexte({ reglages: reglageEtroit }), {
      maintenant: MAINTENANT,
    })

    expect(verdict.refus?.code).toBe('MAX_PARTY_SIZE')
    expect(verdict.confirmationSuffirait).toBe(true)
    expect(verdict.disponibilite.conflits.map((c) => c.regle)).toEqual(['R8'])
  })

  it('les lève pour une demande de Solenne, sans confirmation', () => {
    const verdict = evaluerAcceptation(
      demande({ demandeurEstSolenne: true }),
      contexte({ reglages: reglageEtroit }),
      { maintenant: MAINTENANT },
    )

    expect(verdict.refus).toBeNull()
    expect(verdict.disponibilite.compatible).toBe(true)
  })
})

describe('Les deux refus qu’aucune confirmation ne lève', () => {
  it('des dates déjà passées ne s’acceptent pas « quand même »', () => {
    const verdict = evaluerAcceptation(demande(), contexte(), {
      maintenant: jour('2026-09-11'),
      confirme: true,
    })

    expect(verdict.refus?.code).toBe('PAST_DATES')
    expect(verdict.confirmationSuffirait).toBe(false)
  })

  it('une demande annulée est indécidable, même si la maison est libre', () => {
    const verdict = evaluerAcceptation(demande({ statut: 'CANCELLED' }), contexte(), {
      maintenant: MAINTENANT,
      confirme: true,
    })

    expect(verdict.refus?.code).toBe('REQUEST_CANCELLED')
    // Le verdict de disponibilité est rendu quand même : l'écran l'affiche.
    expect(verdict.disponibilite.compatible).toBe(true)
  })
})
