import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import type { PrismaClient } from '@/generated/prisma/client'
import {
  mettreAJourReglagesReservation,
  reglagesReservation,
} from '@/server/actions/reglages-reservation'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerDemande,
  creerMaison,
  creerSejour,
  creerUtilisateur,
} from '../fabriques'

/**
 * `POLICY` — arrêt `POLICY-B` : persistance et console (`POLICY-009`, `011`
 * à `014`, `S02`). Le domaine pur (`verifierReglages`, `verifierCoherence`)
 * est déjà couvert par `tests/unite/lot3/policy.test.ts` (`POLICY-A`) ; ces
 * tests-ci vérifient que la Server Action en tire les bonnes conséquences.
 *
 * `POLICY-012` (Solenne hors règles) n'a pas d'équivalent ici : c'est
 * `STAYREQ`, pas encore écrit, qui appellera `verifierReglages` avec
 * `estSolenne`. La règle elle-même est déjà prouvée en domaine pur.
 */

const client: PrismaClient = clientDeTest()

const DU = '2027-09-10'
const AU = '2027-09-13'

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  reinitialiserAntiSaturation()
})

afterAll(async () => {
  await viderDonnees(client)
  await client.$disconnect()
})

async function sessionPour(utilisateurId: string) {
  return dansUneRequete(() => ouvrirSession(utilisateurId))
}

function en<T>(jeton: string, traitement: () => Promise<T>) {
  return dansUneRequete(traitement, {
    cookies: { [NOM_COOKIE_SESSION]: jeton },
  })
}

async function decorSolenne(capacite = 10) {
  const solenne = await creerAdministratrice(client)
  const laMaison = await creerMaison(client, capacite)
  const jeton = await sessionPour(solenne.id)
  return { solenne, laMaison, jeton }
}

const REGLAGES_VALIDES = {
  dureeMaxNuits: 7,
  delaiMinHeures: 48,
  horizonMaxJours: 180,
  joursArriveeInterdits: [] as number[],
  maxPersonnesParDemande: 6,
  cohabitationAutorisee: true,
}

describe('lecture — accessible à tout le cercle', () => {
  it('rend les réglages par défaut quand rien n’a encore été enregistré', async () => {
    await creerMaison(client, 10)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const resultat = await en(jeton, () => reglagesReservation())

    expect(resultat).toEqual({
      ok: true,
      data: {
        dureeMaxNuits: null,
        delaiMinHeures: null,
        horizonMaxJours: null,
        joursArriveeInterdits: [],
        maxPersonnesParDemande: null,
        cohabitationAutorisee: true,
      },
    })
  })

  it('refuse une lecture sans session', async () => {
    await creerMaison(client, 10)
    const resultat = await dansUneRequete(() => reglagesReservation())

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('UNAUTHENTICATED')
  })
})

describe('enregistrement — Solenne seule', () => {
  it('enregistre les réglages et les journalise', async () => {
    const { solenne, jeton } = await decorSolenne(10)

    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation(REGLAGES_VALIDES),
    )

    expect(resultat.ok).toBe(true)

    const relu = await en(jeton, () => reglagesReservation())
    expect(relu).toEqual({ ok: true, data: REGLAGES_VALIDES })

    const trace = await client.auditLog.findFirst({
      where: { action: 'reglages.mettreAJour' },
    })
    expect(trace?.actorId).toBe(solenne.id)
  })

  it('trie et déduplique les jours d’arrivée interdits', async () => {
    const { jeton } = await decorSolenne(10)

    await en(jeton, () =>
      mettreAJourReglagesReservation({
        ...REGLAGES_VALIDES,
        joursArriveeInterdits: [5, 1, 5, 3],
      }),
    )

    const relu = await en(jeton, () => reglagesReservation())
    expect(relu.ok && relu.data.joursArriveeInterdits).toEqual([1, 3, 5])
  })
})

describe('S7 — paramètres manipulés', () => {
  it('refuse une durée négative et n’écrit rien', async () => {
    const { jeton } = await decorSolenne(10)

    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation({ ...REGLAGES_VALIDES, dureeMaxNuits: -1 }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(await client.bookingSettings.findFirst()).toBeNull()
  })

  it('refuse un jour de la semaine hors 1-7', async () => {
    const { jeton } = await decorSolenne(10)

    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation({
        ...REGLAGES_VALIDES,
        joursArriveeInterdits: [0, 8],
      }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
  })

  it('refuse un champ manquant plutôt que de le remplacer par un défaut', async () => {
    const { jeton } = await decorSolenne(10)
    const { cohabitationAutorisee: _omis, ...incomplet } = REGLAGES_VALIDES

    const resultat = await en(jeton, () => mettreAJourReglagesReservation(incomplet))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
  })
})

describe('POLICY-009 — réglages contradictoires (POL-R9)', () => {
  it('refuse un délai minimum qui dépasse l’horizon maximum, rien n’est écrit', async () => {
    const { jeton } = await decorSolenne(10)

    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation({
        ...REGLAGES_VALIDES,
        delaiMinHeures: 200 * 24,
        horizonMaxJours: 180,
      }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('POLICY_UNREACHABLE')

    expect(await client.bookingSettings.findFirst()).toBeNull()
  })
})

describe('POLICY-011 — maximum par demande au-delà de la capacité (POL-R5)', () => {
  it('refuse un maximum de 15 pour une capacité de 10', async () => {
    const { jeton } = await decorSolenne(10)

    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation({
        ...REGLAGES_VALIDES,
        maxPersonnesParDemande: 15,
      }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('MAX_PARTY_ABOVE_CAPACITY')
    expect(resultat.message).toContain('10')
  })
})

describe('POLICY-013 — un changement de règle n’invalide pas les séjours confirmés (POL-R3)', () => {
  it('laisse intact un séjour confirmé de 10 nuits quand le maximum passe à 7', async () => {
    const { jeton, laMaison } = await decorSolenne(10)
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })
    const sejour = await creerSejour(client, laMaison.id, marc.id, {
      du: DU,
      au: '2027-09-20', // 10 nuits
    })

    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation({ ...REGLAGES_VALIDES, dureeMaxNuits: 7 }),
    )

    expect(resultat.ok).toBe(true)

    const relu = await client.stay.findUniqueOrThrow({ where: { id: sejour.id } })
    expect(relu.status).toBe('CONFIRMED')
    expect(relu.startDate).toEqual(sejour.startDate)
    expect(relu.endDate).toEqual(sejour.endDate)
  })
})

describe('POLICY-014 — demandes en attente devenues incompatibles (POL-R4)', () => {
  it('signale les demandes dont la durée dépasse le nouveau maximum, pas les autres', async () => {
    const { jeton } = await decorSolenne(10)
    const jean = await creerUtilisateur(client, { prenom: 'Jean' })
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })

    // 10 nuits : dépassera un maximum de 7.
    const longue = await creerDemande(client, jean.id, { du: DU, au: '2027-09-20' })
    // 3 nuits : tient sous un maximum de 7.
    await creerDemande(client, lea.id, { du: DU, au: '2027-09-13' })
    // Déjà refusée : hors périmètre du signalement.
    await creerDemande(client, marc.id, {
      du: DU,
      au: '2027-09-25',
      statut: 'REJECTED',
    })

    // Horizon désactivé : `DU` est loin devant, seule la durée doit jouer ici.
    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation({
        ...REGLAGES_VALIDES,
        dureeMaxNuits: 7,
        horizonMaxJours: null,
      }),
    )

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(
      resultat.data.demandesDevenuesIncompatibles.map((d) => d.id),
    ).toEqual([longue.id])
    expect(resultat.data.demandesDevenuesIncompatibles[0]?.qui).toBe('Jean')
  })

  it('ne signale rien quand on assouplit un réglage', async () => {
    const { jeton } = await decorSolenne(10)
    const jean = await creerUtilisateur(client, { prenom: 'Jean' })
    await creerDemande(client, jean.id, { du: DU, au: AU })

    await en(jeton, () =>
      mettreAJourReglagesReservation({
        ...REGLAGES_VALIDES,
        dureeMaxNuits: 7,
        horizonMaxJours: null,
      }),
    )
    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation({
        ...REGLAGES_VALIDES,
        dureeMaxNuits: 14,
        horizonMaxJours: null,
      }),
    )

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.demandesDevenuesIncompatibles).toEqual([])
  })
})

describe('POLICY-S02 — un ami tentant de modifier les réglages', () => {
  it('refuse et journalise le refus, sans rien écrire', async () => {
    await creerMaison(client, 10)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const resultat = await en(jeton, () =>
      mettreAJourReglagesReservation(REGLAGES_VALIDES),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('FORBIDDEN')

    expect(await client.bookingSettings.findFirst()).toBeNull()

    const refus = await client.auditLog.findFirst({
      where: { action: 'refus.reglages.mettreAJour' },
    })
    expect(refus?.actorId).toBe(ami.id)
  })
})
