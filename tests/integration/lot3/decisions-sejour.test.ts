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
import {
  accepterDemandeSejour,
  contreProposerDemandeSejour,
  demandesEnAttente,
  rejeterDemandeSejour,
  verifierDecisionSejour,
} from '@/server/actions/decisions-sejour'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { toutesLesPresences } from '@/server/occupation'
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
 * moteur) est isolée dans `tests/unite/lot3/staydec.test.ts`.
 *
 * `STAYDEC-B` ajoute les onze cas restants, plus bas dans ce même fichier :
 * la file d'attente, le verdict en lecture seule pour l'écran, le refus,
 * la contre-proposition, et la sécurité `S02`/`S06`.
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

describe('STAYDEC-002 — verdict affiché : compatible', () => {
  it('rend le total et la capacité, sans exiger de confirmation', async () => {
    const { maison, jeton, marc } = await decor(12)
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await creerSejour(client, maison.id, lea.id, { du: DU, au: AU, adultes: 4 })
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    const verdict = await en(jeton, () => verifierDecisionSejour({ id: demande.id }))
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.data.compatible).toBe(true)
    expect(verdict.data.confirmationSuffirait).toBe(false)
    expect(verdict.data.refus).toBeNull()
    expect(verdict.data.occupationAvantDemande).toBe(4)
    expect(verdict.data.occupationAvecDemande).toBe(8)
    expect(verdict.data.capacite).toBe(12)
  })
})

describe('STAYDEC-003 — verdict d’incompatibilité', () => {
  it('détaille le dépassement de capacité, sans toucher à la demande (lecture seule)', async () => {
    const { maison, jeton, marc } = await decor(12)
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await creerSejour(client, maison.id, lea.id, { du: DU, au: AU, adultes: 10 })
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    const verdict = await en(jeton, () => verifierDecisionSejour({ id: demande.id }))
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.data.compatible).toBe(false)
    expect(verdict.data.confirmationSuffirait).toBe(true)
    expect(verdict.data.occupationAvantDemande).toBe(10)
    expect(verdict.data.occupationAvecDemande).toBe(14)
    expect(verdict.data.capacite).toBe(12)
    const capacite = verdict.data.conflits.find((c) => c.code === 'CAPACITY_EXCEEDED')
    expect(capacite?.message).toContain('14 personnes pour 12 places')

    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('PENDING')
  })
})

describe('STAYDEC-004 — refus motivé', () => {
  it('passe la demande à REJECTED, garde le motif, notifie et journalise', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    const resultat = await en(jeton, () =>
      rejeterDemandeSejour({ id: demande.id, motif: 'La maison est prise par ailleurs.' }),
    )
    expect(resultat.ok).toBe(true)

    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('REJECTED')
    expect(enBase.decisionNote).toBe('La maison est prise par ailleurs.')
    expect(enBase.decidedAt).not.toBeNull()

    const notification = await client.notification.findFirstOrThrow({
      where: { userId: marc.id, type: 'sejour.refuse' },
    })
    expect(notification.body).toBe('La maison est prise par ailleurs.')

    const trace = await client.auditLog.findFirstOrThrow({
      where: { action: 'demandeSejour.rejeter', entityId: demande.id },
    })
    expect(trace.actorId).toBeTruthy()
  })
})

describe('STAYDEC-007 — refus sans motif', () => {
  it('refuse la validation, sans toucher à la demande', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    const resultat = await en(jeton, () => rejeterDemandeSejour({ id: demande.id, motif: '   ' }))
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(resultat.champs?.motif).toBe('Le motif est obligatoire.')

    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('PENDING')
  })
})

describe('STAYDEC-008 — contre-proposition', () => {
  it('déplace les dates, laisse la demande en attente côté demandeur, et notifie', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 2 })

    const resultat = await en(jeton, () =>
      contreProposerDemandeSejour({
        id: demande.id,
        arrivee: '2027-09-19',
        depart: '2027-09-21',
        message: 'Une nuit plus tard, ça vous irait ?',
      }),
    )
    expect(resultat.ok).toBe(true)

    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('PENDING')
    expect(enBase.arrivalDate).toEqual(leJour('2027-09-19'))
    expect(enBase.departureDate).toEqual(leJour('2027-09-21'))
    // SDEC-R8 : non confirmée — ni décideur, ni date de décision, ni motif.
    expect(enBase.decidedById).toBeNull()
    expect(enBase.decidedAt).toBeNull()
    expect(enBase.decisionNote).toBeNull()

    const notification = await client.notification.findFirstOrThrow({
      where: { userId: marc.id, type: 'sejour.contre-proposition' },
    })
    expect(notification.body).toBe('Une nuit plus tard, ça vous irait ?')
  })
})

describe('STAYDEC-009 — demande déjà traitée', () => {
  it('refuse une seconde acceptation', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, {
      du: DU,
      au: AU,
      adultes: 2,
      statut: 'ACCEPTED',
    })

    const resultat = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('REQUEST_ALREADY_DECIDED')
    expect(resultat.message).toContain('déjà été traitée')
  })
})

describe('STAYDEC-010 — demande annulée par le demandeur', () => {
  it('refuse l’acceptation, avec un message explicite', async () => {
    const { jeton, marc } = await decor()
    const demande = await creerDemande(client, marc.id, {
      du: DU,
      au: AU,
      adultes: 2,
      statut: 'CANCELLED',
    })

    const resultat = await en(jeton, () => accepterDemandeSejour({ id: demande.id }))
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('REQUEST_CANCELLED')
    expect(resultat.message).toContain('annulée')
  })
})

describe('STAYDEC-012 — notification au demandeur', () => {
  it('ne porte que ce que Solenne a écrit, jamais l’effectif ni les tiers', async () => {
    const { maison, jeton, marc } = await decor()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await creerSejour(client, maison.id, lea.id, { du: DU, au: AU, adultes: 4 })
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 4 })

    const resultat = await en(jeton, () =>
      accepterDemandeSejour({ id: demande.id, message: 'Bienvenue !' }),
    )
    expect(resultat.ok).toBe(true)

    const notification = await client.notification.findFirstOrThrow({
      where: { userId: marc.id, type: 'sejour.accepte' },
    })
    expect(notification.body).toBe('Bienvenue !')
    expect(notification.body).not.toContain('Léa')
    const payload = notification.payload as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['arrivee', 'depart'])
  })
})

describe('STAYDEC-013 — file d’attente ordonnée', () => {
  it('place les plus urgentes en tête, les plus anciennes en cas d’égalité', async () => {
    const solenne = await creerAdministratrice(client)
    const jeton = await sessionPour(solenne.id)

    async function demandeEnAttente(prenom: string, arrivee: string) {
      const utilisateur = await creerUtilisateur(client, { prenom })
      return creerDemande(client, utilisateur.id, { du: arrivee, au: '2027-12-31', adultes: 2 })
    }

    // Créées dans le désordre, pour que le tri (et non l'insertion) fasse foi.
    const a = await demandeEnAttente('A', '2027-11-10')
    const b = await demandeEnAttente('B', '2027-11-05')
    const c = await demandeEnAttente('C', '2027-11-05')
    const d = await demandeEnAttente('D', '2027-12-01')
    const e = await demandeEnAttente('E', '2027-11-01')

    const resultat = await en(jeton, () => demandesEnAttente())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.map((demande) => demande.id)).toEqual([e.id, b.id, c.id, a.id, d.id])
  })
})

describe('STAYDEC-S02 — un ami ne peut décider de rien', () => {
  it('refuse toute action de décision, et journalise chaque refus', async () => {
    const { marc } = await decor()
    const ami = await creerUtilisateur(client, { prenom: 'Ami' })
    const jetonAmi = await sessionPour(ami.id)
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 2 })

    const acceptation = await en(jetonAmi, () => accepterDemandeSejour({ id: demande.id }))
    const refus = await en(jetonAmi, () =>
      rejeterDemandeSejour({ id: demande.id, motif: 'Non' }),
    )
    const contre = await en(jetonAmi, () =>
      contreProposerDemandeSejour({ id: demande.id, arrivee: '2027-09-19', depart: '2027-09-21' }),
    )
    const file = await en(jetonAmi, () => demandesEnAttente())
    const verdict = await en(jetonAmi, () => verifierDecisionSejour({ id: demande.id }))

    for (const resultat of [acceptation, refus, contre, file, verdict]) {
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe('FORBIDDEN')
    }

    // Interdit absolu (§5 de la fiche) : rien n'a bougé.
    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('PENDING')
    expect(await client.stay.count()).toBe(0)

    const trace = await client.auditLog.findFirst({
      where: { action: 'refus.demandeSejour.accepter', actorId: ami.id },
    })
    expect(trace).not.toBeNull()
  })
})

describe('STAYDEC-S06 — appel direct de l’acceptation, requête forgée', () => {
  it('la garde se déclenche même avec une confirmation forcée dans la requête', async () => {
    const { marc } = await decor()
    const intrus = await creerUtilisateur(client, { prenom: 'Intrus' })
    const jetonIntrus = await sessionPour(intrus.id)
    const demande = await creerDemande(client, marc.id, { du: DU, au: AU, adultes: 2 })

    const resultat = await en(jetonIntrus, () =>
      accepterDemandeSejour({ id: demande.id, confirme: true, message: 'Je m’installe.' }),
    )
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('FORBIDDEN')

    expect(await client.stay.count()).toBe(0)
    expect(await client.notification.count()).toBe(0)
    const enBase = await client.stayRequest.findUniqueOrThrow({ where: { id: demande.id } })
    expect(enBase.status).toBe('PENDING')

    const trace = await client.auditLog.findFirst({
      where: { action: 'refus.demandeSejour.accepter', actorId: intrus.id },
    })
    expect(trace).not.toBeNull()
  })
})
