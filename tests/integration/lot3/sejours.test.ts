import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import type { PrismaClient } from '@/generated/prisma/client'
import { accepterDemandeSejour } from '@/server/actions/decisions-sejour'
import { verifierDisponibiliteSejour } from '@/server/actions/demandes-sejour'
import {
  annulerSejour,
  annulerSejourParSolenne,
  creerSejourPersonnel,
  mesSejours,
  suggestionsLiberation,
} from '@/server/actions/sejours'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { cloturerSejoursTerminees } from '@/server/taches/cloture-sejours'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerDemande,
  creerMaison,
  creerSejour,
  creerUtilisateur,
  leJour,
} from '../fabriques'

/**
 * `STAY` — dernier module du lot 3. Les 10 cas de la fiche (`001`→`010`),
 * plus deux cas de sécurité (`S02`, `S04`) sur le modèle de `STAYDEC-B`.
 *
 * `STAY-001` (présence à l'agenda) et une part de `STAY-R7` (privatisation,
 * cohabitation) sont déjà démontrées par `PRIV` et `AVAIL` : ce fichier ne
 * revérifie que ce que `STAY` ajoute — la création directe, l'annulation des
 * deux côtés, la clôture automatique et la suggestion de libération.
 */

const client: PrismaClient = clientDeTest()

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  reinitialiserAntiSaturation()
})

afterEach(() => {})

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

async function decor(capacite = 10) {
  const solenne = await creerAdministratrice(client)
  await creerMaison(client, capacite)
  const jetonSolenne = await sessionPour(solenne.id)
  const marc = await creerUtilisateur(client, { prenom: 'Marc' })
  const jetonMarc = await sessionPour(marc.id)
  return { solenne, jetonSolenne, marc, jetonMarc }
}

describe('STAY-001 — un séjour confirmé apparaît dans « mes séjours »', () => {
  it('aux bonnes dates, avec son statut', async () => {
    const { marc, jetonMarc } = await decor()
    await creerSejour(client, (await client.house.findFirstOrThrow()).id, marc.id, {
      du: '2027-09-18',
      au: '2027-09-20',
    })

    const resultat = await en(jetonMarc, () => mesSejours())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data).toHaveLength(1)
    expect(resultat.data[0]).toMatchObject({
      arrivee: leJour('2027-09-18'),
      depart: leJour('2027-09-20'),
      statut: 'CONFIRMED',
    })
  })
})

describe('STAY-002 — séjour personnel de Solenne', () => {
  it('se crée sans demande, `isOwnerStay = true`', async () => {
    const { solenne, jetonSolenne } = await decor()

    const resultat = await en(jetonSolenne, () =>
      creerSejourPersonnel({ arrivee: '2027-10-05', depart: '2027-10-07', adultes: 2, enfants: 0 }),
    )
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const sejour = await client.stay.findUniqueOrThrow({ where: { id: resultat.data.sejourId } })
    expect(sejour.requestId).toBeNull()
    expect(sejour.isOwnerStay).toBe(true)
    expect(sejour.userId).toBe(solenne.id)
    expect(sejour.status).toBe('CONFIRMED')
  })
})

describe('STAY-003 — annulation par le demandeur', () => {
  it('passe le séjour à `CANCELLED` et notifie Solenne', async () => {
    const { solenne, marc, jetonMarc } = await decor()
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, { du: '2027-09-18', au: '2027-09-20' })

    const resultat = await en(jetonMarc, () => annulerSejour({ id: sejour.id }))
    expect(resultat.ok).toBe(true)

    const enBase = await client.stay.findUniqueOrThrow({ where: { id: sejour.id } })
    expect(enBase.status).toBe('CANCELLED')

    const notification = await client.notification.findFirst({ where: { userId: solenne.id } })
    expect(notification).not.toBeNull()
  })
})

describe('STAY-004 — la capacité se libère', () => {
  it('un séjour de 8 annulé rend une demande de 8 compatible', async () => {
    const { marc, jetonMarc } = await decor(10)
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, {
      du: '2027-09-18',
      au: '2027-09-20',
      adultes: 8,
      enfants: 0,
    })

    const avant = await en(jetonMarc, () =>
      verifierDisponibiliteSejour({ arrivee: '2027-09-18', depart: '2027-09-20', adultes: 8, enfants: 0 }),
    )
    expect(avant.ok).toBe(true)
    if (avant.ok) expect(avant.data.compatible).toBe(false)

    await en(jetonMarc, () => annulerSejour({ id: sejour.id }))

    const apres = await en(jetonMarc, () =>
      verifierDisponibiliteSejour({ arrivee: '2027-09-18', depart: '2027-09-20', adultes: 8, enfants: 0 }),
    )
    expect(apres.ok).toBe(true)
    if (apres.ok) expect(apres.data.compatible).toBe(true)
  })
})

describe('STAY-005 — annulation par Solenne', () => {
  it('exige un motif, le transmet, notifie l’ami et journalise', async () => {
    const { marc, jetonSolenne } = await decor()
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, { du: '2027-09-18', au: '2027-09-20' })

    const resultat = await en(jetonSolenne, () =>
      annulerSejourParSolenne({ id: sejour.id, motif: 'Travaux imprévus dans la maison' }),
    )
    expect(resultat.ok).toBe(true)

    const enBase = await client.stay.findUniqueOrThrow({ where: { id: sejour.id } })
    expect(enBase.status).toBe('CANCELLED')
    expect(enBase.cancelReason).toBe('Travaux imprévus dans la maison')

    const notification = await client.notification.findFirst({ where: { userId: marc.id } })
    expect(notification?.body).toBe('Travaux imprévus dans la maison')

    const trace = await client.auditLog.findFirst({ where: { action: 'sejour.annulerParSolenne' } })
    expect(trace).not.toBeNull()
  })
})

describe('STAY-006 — motif obligatoire', () => {
  it('refuse un motif vide', async () => {
    const { marc, jetonSolenne } = await decor()
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, { du: '2027-09-18', au: '2027-09-20' })

    const resultat = await en(jetonSolenne, () =>
      annulerSejourParSolenne({ id: sejour.id, motif: '' }),
    )
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')

    const enBase = await client.stay.findUniqueOrThrow({ where: { id: sejour.id } })
    expect(enBase.status).toBe('CONFIRMED')
  })
})

describe('STAY-007 — séjour passé non annulable', () => {
  it('refuse, avec un message explicatif', async () => {
    const { marc, jetonMarc } = await decor()
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, {
      du: '2020-01-01',
      au: '2020-01-03',
      statut: 'COMPLETED',
    })

    const resultat = await en(jetonMarc, () => annulerSejour({ id: sejour.id }))
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('STAY_NOT_CANCELLABLE')
    expect(resultat.message.length).toBeGreaterThan(0)
  })
})

describe('STAY-008 — clôture automatique', () => {
  it('un séjour dont le départ est hier passe `COMPLETED`', async () => {
    const { marc } = await decor()
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, { du: '2020-01-01', au: '2020-01-03' })
    const autreAVenir = await creerSejour(client, maison.id, marc.id, {
      du: '2027-09-18',
      au: '2027-09-20',
    })

    const traites = await cloturerSejoursTerminees(leJour('2020-01-04'))
    expect(traites).toBe(1)

    expect((await client.stay.findUniqueOrThrow({ where: { id: sejour.id } })).status).toBe(
      'COMPLETED',
    )
    expect((await client.stay.findUniqueOrThrow({ where: { id: autreAVenir.id } })).status).toBe(
      'CONFIRMED',
    )
  })
})

describe('STAY-009 — historique conservé', () => {
  it('un séjour annulé reste visible, avec son statut et son motif', async () => {
    const { marc, jetonSolenne, jetonMarc } = await decor()
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, { du: '2027-09-18', au: '2027-09-20' })

    await en(jetonSolenne, () => annulerSejourParSolenne({ id: sejour.id, motif: 'Fuite d’eau' }))

    const resultat = await en(jetonMarc, () => mesSejours())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data).toHaveLength(1)
    expect(resultat.data[0]).toMatchObject({ statut: 'CANCELLED', cancelReason: 'Fuite d’eau' })
  })
})

describe('STAY-010 — suggestion après libération', () => {
  it('une demande refusée redevient compatible une fois le séjour concurrent annulé', async () => {
    const { marc, jetonMarc, jetonSolenne } = await decor(10)
    const maison = await client.house.findFirstOrThrow()

    const occupant = await creerSejour(client, maison.id, marc.id, {
      du: '2027-11-01',
      au: '2027-11-05',
      adultes: 10,
    })

    const jean = await creerUtilisateur(client, { prenom: 'Jean' })
    const demande = await creerDemande(client, jean.id, {
      du: '2027-11-02',
      au: '2027-11-04',
      adultes: 4,
      statut: 'REJECTED',
    })

    const avant = await en(jetonSolenne, () => suggestionsLiberation())
    expect(avant.ok).toBe(true)
    if (avant.ok) expect(avant.data.map((s) => s.requestId)).not.toContain(demande.id)

    await en(jetonMarc, () => annulerSejour({ id: occupant.id }))

    const apres = await en(jetonSolenne, () => suggestionsLiberation())
    expect(apres.ok).toBe(true)
    if (!apres.ok) return
    expect(apres.data.map((s) => s.requestId)).toContain(demande.id)
    expect(apres.data.find((s) => s.requestId === demande.id)?.requesterPrenom).toBe('Jean')
  })
})

describe('Concurrence — création directe contre acceptation, même capacité', () => {
  it('n’en laisse aboutir qu’une, sur la dernière place', async () => {
    const { jetonSolenne } = await decor(10)
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const demande = await creerDemande(client, lea.id, { du: '2027-09-18', au: '2027-09-20', adultes: 6 })

    const [creation, acceptation] = await Promise.all([
      en(jetonSolenne, () =>
        creerSejourPersonnel({
          arrivee: '2027-09-18',
          depart: '2027-09-20',
          adultes: 6,
          enfants: 0,
        }),
      ),
      en(jetonSolenne, () => accepterDemandeSejour({ id: demande.id })),
    ])

    const reussites = [creation, acceptation].filter((r) => r.ok)
    expect(reussites).toHaveLength(1)

    expect(await client.stay.count({ where: { status: 'CONFIRMED' } })).toBe(1)
  }, 20_000)
})

describe('STAY-S02 — un ami ne peut ni créer un séjour personnel ni annuler avec motif', () => {
  it('refuse et journalise', async () => {
    const { marc, jetonMarc } = await decor()

    const creation = await en(jetonMarc, () =>
      creerSejourPersonnel({ arrivee: '2027-10-05', depart: '2027-10-07', adultes: 2, enfants: 0 }),
    )
    expect(creation.ok).toBe(false)
    if (!creation.ok) expect(creation.code).toBe('FORBIDDEN')

    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, { du: '2027-09-18', au: '2027-09-20' })
    const annulation = await en(jetonMarc, () =>
      annulerSejourParSolenne({ id: sejour.id, motif: 'Non' }),
    )
    expect(annulation.ok).toBe(false)
    if (!annulation.ok) expect(annulation.code).toBe('FORBIDDEN')

    const trace = await client.auditLog.findFirst({
      where: { action: 'refus.sejour.creerPersonnel', actorId: marc.id },
    })
    expect(trace).not.toBeNull()
  })
})

describe('STAY-S04 — un ami ne peut pas annuler le séjour d’un autre', () => {
  it('refus neutre, aucune écriture', async () => {
    const { marc } = await decor()
    const maison = await client.house.findFirstOrThrow()
    const sejour = await creerSejour(client, maison.id, marc.id, { du: '2027-09-18', au: '2027-09-20' })

    const intrus = await creerUtilisateur(client, { prenom: 'Intrus' })
    const jetonIntrus = await sessionPour(intrus.id)

    const resultat = await en(jetonIntrus, () => annulerSejour({ id: sejour.id }))
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('NOT_FOUND')

    expect((await client.stay.findUniqueOrThrow({ where: { id: sejour.id } })).status).toBe(
      'CONFIRMED',
    )
  })
})
