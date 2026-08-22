import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import type { PrismaClient } from '@/generated/prisma/client'
import {
  annulerDemandeSejour,
  creerDemandeSejour,
  mesDemandesSejour,
  modifierDemandeSejour,
} from '@/server/actions/demandes-sejour'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerMaison,
  creerRegle,
  creerUtilisateur,
} from '../fabriques'

/**
 * `STAYREQ` — Server Actions créer/consulter/modifier/annuler (`001→009`,
 * `011`, `012`, `014→017`, `C06`, `S04`). Le domaine pur (préalables SREQ-R7,
 * composition R8) est couvert par `tests/unite/lot3/stayreq.test.ts` ; ces
 * tests-ci vérifient que la Server Action en tire les bonnes conséquences :
 * persistance, permissions, concurrence. `010`, `013`, `018` (assistant en
 * direct, mention obligatoire, 320 px) sont joués à l'écran par
 * `tests/e2e/sejours.spec.ts` (`STAYREQ-B`).
 *
 * `POLICY-012` (Solenne hors règles) est ici aussi : ce module est le premier
 * créateur réel de demandes, celui que `POLICY` attendait pour le prouver.
 */

const client: PrismaClient = clientDeTest()

const DU = '2027-09-18'
const AU = '2027-09-20'

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

async function decorAmi(capacite = 10) {
  await creerAdministratrice(client)
  const laMaison = await creerMaison(client, capacite)
  const marc = await creerUtilisateur(client, { prenom: 'Marc' })
  const jeton = await sessionPour(marc.id)
  return { marc, laMaison, jeton }
}

const DEMANDE_NOMINALE = {
  arrivee: DU,
  depart: AU,
  adultes: 4,
  enfants: 0,
  accepteRegles: true,
}

describe('STAYREQ-001 — demande nominale', () => {
  it('crée la demande en PENDING et journalise pour Solenne', async () => {
    const { marc, jeton } = await decorAmi()

    const resultat = await en(jeton, () => creerDemandeSejour(DEMANDE_NOMINALE))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.compatible).toBe(true)

    const enBase = await client.stayRequest.findUniqueOrThrow({
      where: { id: resultat.data.id },
    })
    expect(enBase.status).toBe('PENDING')
    expect(enBase.requesterId).toBe(marc.id)

    const trace = await client.auditLog.findFirst({
      where: { action: 'demandeSejour.creer', entityId: resultat.data.id },
    })
    expect(trace?.actorId).toBe(marc.id)
  })

  it('refuse une création sans session', async () => {
    await creerMaison(client, 10)
    const resultat = await dansUneRequete(() => creerDemandeSejour(DEMANDE_NOMINALE))
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('UNAUTHENTICATED')
  })
})

describe('STAYREQ-002 — statut initial', () => {
  it('n’est jamais créée autrement qu’en PENDING', async () => {
    const { jeton } = await decorAmi()
    const resultat = await en(jeton, () => creerDemandeSejour(DEMANDE_NOMINALE))
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const relue = await client.stayRequest.findUniqueOrThrow({
      where: { id: resultat.data.id },
    })
    expect(relue.status).toBe('PENDING')
  })
})

describe('STAYREQ-008 — règles obligatoires non acceptées', () => {
  it('refuse l’envoi tant que la case n’est pas cochée', async () => {
    const { laMaison, jeton } = await decorAmi()
    await creerRegle(client, laMaison.id, { obligatoire: true })

    const resultat = await en(jeton, () =>
      creerDemandeSejour({ ...DEMANDE_NOMINALE, accepteRegles: false }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('RULES_NOT_ACCEPTED')
    expect(await client.stayRequest.count()).toBe(0)
  })

  it('n’exige rien quand aucune règle n’est obligatoire', async () => {
    const { laMaison, jeton } = await decorAmi()
    await creerRegle(client, laMaison.id, { obligatoire: false })

    const resultat = await en(jeton, () =>
      creerDemandeSejour({ ...DEMANDE_NOMINALE, accepteRegles: false }),
    )

    expect(resultat.ok).toBe(true)
  })
})

describe('STAYREQ-009 — acceptation horodatée', () => {
  it('enregistre rulesAcceptedAt quand les règles sont cochées', async () => {
    const { laMaison, jeton } = await decorAmi()
    await creerRegle(client, laMaison.id, { obligatoire: true })

    const resultat = await en(jeton, () => creerDemandeSejour(DEMANDE_NOMINALE))
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const relue = await client.stayRequest.findUniqueOrThrow({
      where: { id: resultat.data.id },
    })
    expect(relue.rulesAcceptedAt).not.toBeNull()
  })
})

describe('STAYREQ-011 — envoi malgré incompatibilité (SREQ-R4)', () => {
  it('refuse par défaut, puis accepte en PENDING avec force et journalise le conflit', async () => {
    const { jeton } = await decorAmi(2)
    const demandeTropGrande = { ...DEMANDE_NOMINALE, adultes: 5, enfants: 0 }

    const refuse = await en(jeton, () => creerDemandeSejour(demandeTropGrande))
    expect(refuse.ok).toBe(false)
    if (refuse.ok) return
    expect(refuse.code).toBe('CAPACITY_EXCEEDED')
    expect(await client.stayRequest.count()).toBe(0)

    const force = await en(jeton, () =>
      creerDemandeSejour({ ...demandeTropGrande, force: true }),
    )
    expect(force.ok).toBe(true)
    if (!force.ok) return
    expect(force.data.compatible).toBe(false)

    const enBase = await client.stayRequest.findUniqueOrThrow({
      where: { id: force.data.id },
    })
    expect(enBase.status).toBe('PENDING')

    const trace = await client.auditLog.findFirst({
      where: { action: 'demandeSejour.creer', entityId: force.data.id },
    })
    expect(JSON.stringify(trace?.diff)).toContain('CAPACITY_EXCEEDED')
  })
})

describe('STAYREQ-012 — demande exclusive (D2)', () => {
  it('enregistre et rend exclusive = true', async () => {
    const { jeton } = await decorAmi()
    const resultat = await en(jeton, () =>
      creerDemandeSejour({ ...DEMANDE_NOMINALE, exclusif: true }),
    )
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const relue = await client.stayRequest.findUniqueOrThrow({
      where: { id: resultat.data.id },
    })
    expect(relue.exclusive).toBe(true)
  })
})

describe('POLICY-012 — Solenne échappe aux réglages de réservation (POL-R1)', () => {
  it('accepte une demande de Solenne qui dépasserait le maximum par demande', async () => {
    const solenne = await creerAdministratrice(client)
    const laMaison = await creerMaison(client, 10)
    await client.bookingSettings.create({
      data: { houseId: laMaison.id, maxGuests: 1 },
    })
    const jeton = await sessionPour(solenne.id)

    const resultat = await en(jeton, () =>
      creerDemandeSejour({ ...DEMANDE_NOMINALE, adultes: 4, enfants: 0 }),
    )

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.compatible).toBe(true)
  })
})

describe('STAYREQ-014 — modification en attente', () => {
  it('passe de 4 à 5 personnes et journalise', async () => {
    const { marc, jeton } = await decorAmi()
    const creation = await en(jeton, () => creerDemandeSejour(DEMANDE_NOMINALE))
    if (!creation.ok) throw new Error('précondition : création refusée')

    const resultat = await en(jeton, () =>
      modifierDemandeSejour({
        id: creation.data.id,
        arrivee: DU,
        depart: AU,
        adultes: 5,
        enfants: 0,
      }),
    )
    expect(resultat.ok).toBe(true)

    const relue = await client.stayRequest.findUniqueOrThrow({
      where: { id: creation.data.id },
    })
    expect(relue.adults).toBe(5)
    expect(relue.requesterId).toBe(marc.id)

    const trace = await client.auditLog.findFirst({
      where: { action: 'demandeSejour.modifier', entityId: creation.data.id },
    })
    expect(trace).not.toBeNull()
  })
})

describe('STAYREQ-015 — annulation par le demandeur', () => {
  it('passe la demande à CANCELLED', async () => {
    const { jeton } = await decorAmi()
    const creation = await en(jeton, () => creerDemandeSejour(DEMANDE_NOMINALE))
    if (!creation.ok) throw new Error('précondition : création refusée')

    const resultat = await en(jeton, () => annulerDemandeSejour({ id: creation.data.id }))
    expect(resultat.ok).toBe(true)

    const relue = await client.stayRequest.findUniqueOrThrow({
      where: { id: creation.data.id },
    })
    expect(relue.status).toBe('CANCELLED')
  })
})

describe('STAYREQ-016 — modification après décision', () => {
  it('refuse de modifier une demande déjà acceptée', async () => {
    const { marc, jeton } = await decorAmi()
    const decidee = await client.stayRequest.create({
      data: {
        requesterId: marc.id,
        arrivalDate: new Date(`${DU}T00:00:00.000Z`),
        departureDate: new Date(`${AU}T00:00:00.000Z`),
        adults: 2,
        status: 'ACCEPTED',
      },
    })

    const resultat = await en(jeton, () =>
      modifierDemandeSejour({ id: decidee.id, arrivee: DU, depart: AU, adultes: 3, enfants: 0 }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('REQUEST_ALREADY_DECIDED')
  })

  it('refuse aussi l’annulation d’une demande déjà décidée', async () => {
    const { marc, jeton } = await decorAmi()
    const decidee = await client.stayRequest.create({
      data: {
        requesterId: marc.id,
        arrivalDate: new Date(`${DU}T00:00:00.000Z`),
        departureDate: new Date(`${AU}T00:00:00.000Z`),
        adults: 2,
        status: 'REJECTED',
      },
    })

    const resultat = await en(jeton, () => annulerDemandeSejour({ id: decidee.id }))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('REQUEST_ALREADY_DECIDED')
  })
})

describe('STAYREQ-017 — consultation de ses demandes', () => {
  it('rend toutes ses demandes, tous statuts confondus', async () => {
    const { marc, jeton } = await decorAmi()
    await client.stayRequest.createMany({
      data: [
        {
          requesterId: marc.id,
          arrivalDate: new Date('2027-01-10T00:00:00.000Z'),
          departureDate: new Date('2027-01-12T00:00:00.000Z'),
          adults: 2,
          status: 'PENDING',
        },
        {
          requesterId: marc.id,
          arrivalDate: new Date('2027-02-10T00:00:00.000Z'),
          departureDate: new Date('2027-02-12T00:00:00.000Z'),
          adults: 2,
          status: 'ACCEPTED',
        },
        {
          requesterId: marc.id,
          arrivalDate: new Date('2027-03-10T00:00:00.000Z'),
          departureDate: new Date('2027-03-12T00:00:00.000Z'),
          adults: 2,
          status: 'REJECTED',
        },
      ],
    })

    const resultat = await en(jeton, () => mesDemandesSejour())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data).toHaveLength(3)
    expect(resultat.data.map((d) => d.statut).sort()).toEqual([
      'ACCEPTED',
      'PENDING',
      'REJECTED',
    ])
  })

  it('ne rend jamais la demande d’un autre', async () => {
    const { jeton } = await decorAmi()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await client.stayRequest.create({
      data: {
        requesterId: lea.id,
        arrivalDate: new Date(`${DU}T00:00:00.000Z`),
        departureDate: new Date(`${AU}T00:00:00.000Z`),
        adults: 2,
        status: 'PENDING',
      },
    })

    const resultat = await en(jeton, () => mesDemandesSejour())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data).toEqual([])
  })
})

describe('STAYREQ-C06 — double soumission', () => {
  it('un double clic ne crée qu’une seule demande', async () => {
    const { jeton } = await decorAmi()

    const [premiere, seconde] = await Promise.all([
      en(jeton, () => creerDemandeSejour(DEMANDE_NOMINALE)),
      en(jeton, () => creerDemandeSejour(DEMANDE_NOMINALE)),
    ])

    expect(premiere.ok).toBe(true)
    expect(seconde.ok).toBe(true)

    const total = await client.stayRequest.count({
      where: {
        arrivalDate: new Date(`${DU}T00:00:00.000Z`),
        departureDate: new Date(`${AU}T00:00:00.000Z`),
        status: 'PENDING',
      },
    })
    expect(total).toBe(1)
  }, 20_000)
})

describe('STAYREQ-S04 — demande au nom d’un autre', () => {
  it('ignore un requesterId injecté, la demande appartient à l’appelant', async () => {
    const { marc, jeton } = await decorAmi()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })

    const resultat = await en(jeton, () =>
      creerDemandeSejour({ ...DEMANDE_NOMINALE, requesterId: lea.id }),
    )

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const enBase = await client.stayRequest.findUniqueOrThrow({
      where: { id: resultat.data.id },
    })
    expect(enBase.requesterId).toBe(marc.id)
  })
})

describe('S3/S4 — la demande d’un autre', () => {
  it('refuse de modifier la demande d’un autre, message neutre, aucune écriture', async () => {
    const { jeton } = await decorAmi()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const deLea = await client.stayRequest.create({
      data: {
        requesterId: lea.id,
        arrivalDate: new Date(`${DU}T00:00:00.000Z`),
        departureDate: new Date(`${AU}T00:00:00.000Z`),
        adults: 2,
      },
    })

    const resultat = await en(jeton, () =>
      modifierDemandeSejour({ id: deLea.id, arrivee: DU, depart: AU, adultes: 9, enfants: 0 }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('NOT_FOUND')

    const relue = await client.stayRequest.findUniqueOrThrow({ where: { id: deLea.id } })
    expect(relue.adults).toBe(2)
  })

  it('refuse d’annuler la demande d’un autre, aucune écriture', async () => {
    const { jeton } = await decorAmi()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const deLea = await client.stayRequest.create({
      data: {
        requesterId: lea.id,
        arrivalDate: new Date(`${DU}T00:00:00.000Z`),
        departureDate: new Date(`${AU}T00:00:00.000Z`),
        adults: 2,
      },
    })

    const resultat = await en(jeton, () => annulerDemandeSejour({ id: deLea.id }))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('NOT_FOUND')

    const relue = await client.stayRequest.findUniqueOrThrow({ where: { id: deLea.id } })
    expect(relue.status).toBe('PENDING')
  })
})
