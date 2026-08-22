import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

/**
 * `STAYDEC-011` — pour prouver qu'aucun état partiel ne survit, il faut casser
 * la transaction **après** la création du séjour. La dernière écriture de
 * `accepterDansLaTransaction` est l'audit : le faire échouer à la demande, sans
 * toucher au code de production, est la simulation la plus fidèle. Le drapeau
 * est porté par `vi.hoisted` parce que `vi.mock` remonte au-dessus des imports.
 */
const panneAudit = vi.hoisted(() => ({ active: false }))

vi.mock('@/server/audit', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/server/audit')>()
  return {
    ...reel,
    journaliserAudit: async (...arguments_: Parameters<typeof reel.journaliserAudit>) => {
      if (panneAudit.active) throw new Error('panne simulée après la création du séjour')
      return reel.journaliserAudit(...arguments_)
    },
  }
})

import { occupationSur } from '@/domain/occupancy/occupation'
import type { PrismaClient } from '@/generated/prisma/client'
import { creerBlocage } from '@/server/actions/blocages'
import { accepterDemandeSejour } from '@/server/actions/decisions-sejour'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { toutesLesPresences } from '@/server/occupation'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerDemande,
  creerMaison,
  creerUtilisateur,
  leJour,
} from '../fabriques'

/**
 * `STAYDEC` — arrêt `STAYDEC-A` : les sept cas de la revalidation dans la
 * transaction (`001`, `005`, `006`, `011`, `014`, `C01`, `C05`).
 *
 * Ce que ces tests cherchent n'est pas « l'acceptation fonctionne » — c'est
 * qu'aucun chemin ne produise un état que la maison ne peut pas tenir : deux
 * séjours sur la dernière place, un séjour sous une période bloquée, un séjour
 * orphelin d'une demande restée en attente. Les quatre premiers cas vérifient
 * la décision seule ; `C01` et `C05` la mettent en concurrence.
 *
 * La part de domaine pur (ce qui se force, ce qui ne se force pas, le rejeu du
 * moteur) est isolée dans `tests/unite/lot3/staydec.test.ts`. Les onze cas
 * restants du module (refus, contre-proposition, file d'attente, écran,
 * sécurité `S02`/`S06`) appartiennent à `STAYDEC-B`.
 */

const client: PrismaClient = clientDeTest()

const DU = '2027-09-18'
const AU = '2027-09-20'

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  reinitialiserAntiSaturation()
})

afterEach(() => {
  panneAudit.active = false
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

/** Solenne connectée, une maison, et Marc qui attend une réponse. */
async function decor(capacite = 10) {
  const solenne = await creerAdministratrice(client)
  const maison = await creerMaison(client, capacite)
  const jeton = await sessionPour(solenne.id)
  const marc = await creerUtilisateur(client, { prenom: 'Marc' })
  return { solenne, maison, jeton, marc }
}

/** L'occupation réelle sur la période, telle que l'agenda la verra. */
async function occupationSurLaPeriode(du = DU, au = AU) {
  const presences = await toutesLesPresences(client)
  return occupationSur(presences, { debut: leJour(du), fin: leJour(au) }).total
}

describe('STAYDEC-001 — acceptation nominale', () => {
  it('change le statut, crée le séjour, notifie et journalise', async () => {
    const { solenne, maison, jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    const resultat = await en(jeton, () =>
      accepterDemandeSejour({ id: demande.id, message: 'À très bientôt !' }),
    )

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.compatible).toBe(true)

    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('ACCEPTED')
    expect(enBase.decidedById).toBe(solenne.id)
    expect(enBase.decidedAt).not.toBeNull()
    expect(enBase.decisionNote).toBe('À très bientôt !')

    const sejour = await client.stay.findUniqueOrThrow({ where: { id: resultat.data.sejourId } })
    expect(sejour.requestId).toBe(demande.id)
    expect(sejour.houseId).toBe(maison.id)
    expect(sejour.userId).toBe(marc.id)
    expect(sejour.status).toBe('CONFIRMED')
    expect(sejour.adults).toBe(4)
    expect(sejour.isOwnerStay).toBe(false)
    expect(sejour.startDate).toEqual(leJour(DU))
    expect(sejour.endDate).toEqual(leJour(AU))

    // « Agenda à jour » : les 4 personnes comptent désormais dans l'occupation.
    expect(await occupationSurLaPeriode()).toBe(4)

    const notification = await client.notification.findFirstOrThrow({
      where: { userId: marc.id, type: 'sejour.accepte' },
    })
    expect(notification.entityId).toBe(demande.id)
    expect(notification.body).toBe('À très bientôt !')

    const trace = await client.auditLog.findFirstOrThrow({
      where: { action: 'demandeSejour.accepter', entityId: demande.id },
    })
    expect(trace.actorId).toBe(solenne.id)
    // Acceptation non forcée : rien à justifier dans le journal.
    expect(JSON.stringify(trace.diff)).not.toContain('forcee')
  })
})

describe('STAYDEC-005 — demande devenue incompatible', () => {
  it('refuse sans confirmation, accepte avec, et garde la trace du forçage', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    // Le blocage est posé *après* la demande : à sa création, elle passait.
    const blocage = await en(jeton, () =>
      creerBlocage({ du: DU, au: AU, libelle: 'Travaux', type: 'MAINTENANCE' }),
    )
    expect(blocage.ok).toBe(true)

    const refus = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))
    expect(refus.ok).toBe(false)
    if (refus.ok) return
    // Le refus dit ce qui s'oppose, et que Solenne peut passer outre.
    expect(refus.code).toBe('BLOCKED_PERIOD')
    expect(refus.message).toContain('Ces dates ne sont pas disponibles.')
    expect(refus.message).toContain('Confirmez explicitement')

    // Rien n'a bougé : ni séjour, ni statut.
    expect(await client.stay.count()).toBe(0)
    const apresRefus = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(apresRefus.status).toBe('PENDING')

    const force = await en(jeton, () =>
      accepterDemandeSejour({ id: demande.id, confirme: true }),
    )
    expect(force.ok).toBe(true)
    if (!force.ok) return
    // Le séjour existe, mais le verdict rendu reste « incompatible ».
    expect(force.data.compatible).toBe(false)
    expect(await client.stay.count()).toBe(1)

    const trace = await client.auditLog.findFirstOrThrow({
      where: { action: 'demandeSejour.accepter', entityId: demande.id },
    })
    const diff = JSON.stringify(trace.diff)
    expect(diff).toContain('forcee')
    expect(diff).toContain('BLOCKED_PERIOD')
  })
})

describe('STAYDEC-006 — revalidation au moment de la décision', () => {
  const TROIS_SEMAINES = { du: '2027-10-01', au: '2027-10-22' }

  /** Six personnes déjà attendues sur la période, via un séjour confirmé. */
  async function sixPersonnesDeja(maisonId: string) {
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await client.stay.create({
      data: {
        houseId: maisonId,
        userId: lea.id,
        startDate: leJour(TROIS_SEMAINES.du),
        endDate: leJour(TROIS_SEMAINES.au),
        adults: 6,
        children: 0,
        status: 'CONFIRMED',
      },
    })
  }

  it('rejoue le moteur avec la capacité actuelle, pas celle du jour de la demande', async () => {
    const { maison, jeton, marc } = await decor(12)
    await sixPersonnesDeja(maison.id)
    const demande = await creerDemande(client, marc.id, { ...TROIS_SEMAINES, adultes: 4 })

    // Capacité 12 le jour de la demande : 6 + 4 passaient largement.
    // Solenne la ramène à 8 avant de décider.
    await client.house.update({ where: { id: maison.id }, data: { capacityMax: 8 } })

    const refus = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))
    expect(refus.ok).toBe(false)
    if (refus.ok) return
    expect(refus.code).toBe('CAPACITY_EXCEEDED')
    // Le chiffre est celui d'aujourd'hui : 6 déjà là + 4 demandés, 8 places.
    expect(refus.message).toContain('10 personnes pour 8 places')
    expect(await client.stay.count()).toBe(1)

    // Et dans l'autre sens : la capacité remonte, la même demande repasse
    // sans confirmation. Le verdict suit l'état du jour, jamais un souvenir.
    await client.house.update({ where: { id: maison.id }, data: { capacityMax: 12 } })

    const acceptation = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))
    expect(acceptation.ok).toBe(true)
    if (!acceptation.ok) return
    expect(acceptation.data.compatible).toBe(true)
    expect(await occupationSurLaPeriode(TROIS_SEMAINES.du, TROIS_SEMAINES.au)).toBe(10)
  })
})

describe('STAYDEC-011 — transaction atomique', () => {
  it('ne laisse aucun état partiel quand une écriture échoue après le séjour', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    panneAudit.active = true
    const resultat = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    // Règle non négociable n°5 : rien de la panne n'atteint l'écran.
    expect(resultat.message).not.toContain('panne simulée')
    expect(resultat.message).not.toContain('Error')

    // Les quatre effets sont solidaires : aucun n'a survécu.
    expect(await client.stay.count()).toBe(0)
    expect(await client.notification.count()).toBe(0)
    expect(
      await client.auditLog.count({ where: { action: 'demandeSejour.accepter' } }),
    ).toBe(0)
    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('PENDING')
    expect(enBase.decidedAt).toBeNull()

    // La panne levée, la même acceptation aboutit : rien n'est resté verrouillé.
    panneAudit.active = false
    const reprise = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))
    expect(reprise.ok).toBe(true)
    expect(await client.stay.count()).toBe(1)
  })
})

describe('STAYDEC-014 — séjour exclusif accepté', () => {
  it('privatise la maison : toute demande ultérieure sur ces dates est refusée', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, {
      du: DU,
      au: AU,
      adultes: 2,
      exclusif: true,
    })

    const acceptation = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))
    expect(acceptation.ok).toBe(true)
    if (!acceptation.ok) return

    const sejour = await client.stay.findUniqueOrThrow({
      where: { id: acceptation.data.sejourId },
    })
    expect(sejour.exclusive).toBe(true)

    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const suivante = await creerDemande(client, lea.id, { du: DU, au: AU, adultes: 2 })

    const refus = await en(jeton, () => accepterDemandeSejour({ id: suivante.id }))
    expect(refus.ok).toBe(false)
    if (refus.ok) return
    expect(refus.code).toBe('EXCLUSIVE_CONFLICT')

    // L'exclusivité n'est pas une gêne : la confirmation ne l'ouvre pas.
    const forcage = await en(jeton, () =>
      accepterDemandeSejour({ id: suivante.id, confirme: true }),
    )
    expect(forcage.ok).toBe(false)
    if (forcage.ok) return
    expect(forcage.code).toBe('EXCLUSIVE_CONFLICT')

    expect(await client.stay.count()).toBe(1)
    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: suivante.id } })
    expect(enBase.status).toBe('PENDING')
  })
})

describe('STAYDEC-C01 — deux acceptations simultanées', () => {
  it('n’en laisse aboutir qu’une, et refuse l’autre pour la capacité', async () => {
    const { maison, jeton } = await decor(10)
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const premiere = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 6 })
    const seconde = await creerDemande(client, lea.id, { du: DU, au: AU, adultes: 6 })

    const [a, b] = await Promise.all([
      en(jeton, () => accepterDemandeSejour({ id: premiere.id })),
      en(jeton, () => accepterDemandeSejour({ id: seconde.id })),
    ])

    const reussites = [a, b].filter((r) => r.ok)
    const echecs = [a, b].filter((r) => !r.ok)
    expect(reussites).toHaveLength(1)
    expect(echecs).toHaveLength(1)

    // Le perdant reçoit un refus **métier**, pas une trace de base de données.
    const perdu = echecs[0]!
    if (perdu.ok) return
    expect(perdu.code).toBe('CAPACITY_EXCEEDED')
    expect(perdu.message).not.toContain('40001')
    expect(perdu.message).not.toContain('serialize')

    expect(await client.stay.count({ where: { status: 'CONFIRMED' } })).toBe(1)
    expect(await occupationSurLaPeriode()).toBeLessThanOrEqual(maison.capacityMax)

    const enAttente = await client.stayRequest.count({ where: { status: 'PENDING' } })
    expect(enAttente).toBe(1)
  }, 20_000)
})

describe('Grille C1→C6, point C6 — double clic sur « Accepter »', () => {
  it('ne crée qu’un séjour, et refuse le second clic en français', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    // Deux fois la même acceptation, lancées ensemble : le réseau lent et le
    // double clic produisent exactement cela.
    const [a, b] = await Promise.all([
      en(jeton, () => accepterDemandeSejour({ id: demande.id })),
      en(jeton, () => accepterDemandeSejour({ id: demande.id })),
    ])

    expect([a, b].filter((r) => r.ok)).toHaveLength(1)

    const refuse = [a, b].find((r) => !r.ok)!
    if (refuse.ok) return
    // SDEC-R6 : une demande ne se décide qu'une fois. Le second clic reçoit ce
    // refus-là, pas une violation d'index unique remontée en incident.
    expect(refuse.code).toBe('REQUEST_ALREADY_DECIDED')
    expect(refuse.message).not.toContain('stays_request_id_key')
    expect(refuse.message).not.toContain('Unique')

    // Un seul séjour, une seule notification, une seule trace d'audit.
    expect(await client.stay.count()).toBe(1)
    expect(await client.notification.count()).toBe(1)
    expect(
      await client.auditLog.count({ where: { action: 'demandeSejour.accepter' } }),
    ).toBe(1)
  }, 20_000)
})

describe('STAYDEC-C05 — acceptation et blocage au même instant', () => {
  it('laisse passer l’un des deux, jamais les deux', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    const [acceptation, blocage] = await Promise.all([
      en(jeton, () => accepterDemandeSejour({ id: demande.id })),
      en(jeton, () => creerBlocage({ du: DU, au: AU, libelle: 'Travaux', type: 'MAINTENANCE' })),
    ])

    // L'invariant : jamais un séjour confirmé sous une période bloquée.
    expect([acceptation.ok, blocage.ok].filter(Boolean)).toHaveLength(1)

    const sejours = await client.stay.count({ where: { status: 'CONFIRMED' } })
    const periodes = await client.blockedPeriod.count()
    expect(sejours * periodes).toBe(0)

    // Quel que soit l'ordre, le perdant repart avec un refus lisible.
    if (!acceptation.ok) {
      expect(['BLOCKED_PERIOD', 'CONFLICT']).toContain(acceptation.code)
      expect(acceptation.message).not.toContain('40001')
      const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
      expect(enBase.status).toBe('PENDING')
    }
    if (!blocage.ok) {
      expect(['BLOCKED_OVER_STAY', 'CONFLICT']).toContain(blocage.code)
      expect(blocage.message).not.toContain('40001')
    }
  }, 20_000)
})
