import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import { identiteCourante, seConnecter } from '@/server/actions/auth'
import {
  changerRole,
  consulterJournalAudit,
  desactiverUtilisateur,
  listerUtilisateurs,
  modifierRelation,
  reactiverUtilisateur,
  sejoursAVenirDe,
  supprimerUtilisateur,
} from '@/server/actions/utilisateurs'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import type { PrismaClient } from '@/generated/prisma/client'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerMaison,
  creerUtilisateur,
  emailDeTest,
  MOT_DE_PASSE_VALIDE,
} from '../fabriques'

const client: PrismaClient = clientDeTest()

let solenneId = ''
let jetonSolenne = ''

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  const solenne = await creerAdministratrice(client)
  solenneId = solenne.id
  jetonSolenne = await dansUneRequete(() => ouvrirSession(solenne.id))
})

afterAll(async () => {
  await viderDonnees(client)
  await client.$disconnect()
})

function enSolenne<T>(traitement: () => Promise<T>) {
  return dansUneRequete(traitement, {
    cookies: { [NOM_COOKIE_SESSION]: jetonSolenne },
  })
}

function en<T>(jeton: string, traitement: () => Promise<T>) {
  return dansUneRequete(traitement, {
    cookies: { [NOM_COOKIE_SESSION]: jeton },
  })
}

async function creerSejour(utilisateurId: string, dansNJours: number) {
  const maison = await creerMaison(client)
  const debut = new Date()
  debut.setUTCHours(0, 0, 0, 0)
  debut.setUTCDate(debut.getUTCDate() + dansNJours)
  const fin = new Date(debut)
  fin.setUTCDate(fin.getUTCDate() + 3)

  return client.stay.create({
    data: {
      houseId: maison.id,
      userId: utilisateurId,
      startDate: debut,
      endDate: fin,
      adults: 2,
      status: 'CONFIRMED',
    },
  })
}

describe('USERS-001 / 002 — liste et filtres', () => {
  it('USERS-001 — liste tout le monde, avec statuts et relations', async () => {
    await creerUtilisateur(client, { prenom: 'Marc' })
    await creerUtilisateur(client, { prenom: 'Léa', statut: 'DISABLED' })

    const resultat = await enSolenne(() => listerUtilisateurs())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(resultat.data).toHaveLength(3)
    // Solenne d'abord : ADMIN vient avant FRIEND.
    expect(resultat.data[0]?.role).toBe('ADMIN')
    expect(resultat.data.map((u) => u.statut)).toContain('DISABLED')
    expect(JSON.stringify(resultat.data)).not.toContain('passwordHash')
  })

  it('USERS-002 — filtre par relation et par statut', async () => {
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })
    const jean = await creerUtilisateur(client, { prenom: 'Jean' })
    await enSolenne(() => modifierRelation({ id: marc.id, relation: 'FAMILY' }))
    await enSolenne(() =>
      modifierRelation({ id: jean.id, relation: 'ACQUAINTANCE' }),
    )

    const famille = await enSolenne(() =>
      listerUtilisateurs({ relation: 'FAMILY' }),
    )
    expect(famille.ok && famille.data.map((u) => u.prenom)).toEqual(['Marc'])

    const actifs = await enSolenne(() => listerUtilisateurs({ statut: 'ACTIVE' }))
    expect(actifs.ok && actifs.data).toHaveLength(3)
  })

  it('cherche par prénom, nom ou email, sans se soucier de la casse', async () => {
    await creerUtilisateur(client, {
      prenom: 'Camille',
      nom: 'Roux',
      email: 'camille.roux@exemple.test',
    })

    for (const recherche of ['cami', 'ROUX', 'camille.roux@']) {
      const resultat = await enSolenne(() => listerUtilisateurs({ recherche }))
      expect(resultat.ok && resultat.data.map((u) => u.prenom), recherche).toEqual([
        'Camille',
      ])
    }
  })
})

describe('USERS-003 — type de relation', () => {
  it('enregistre le changement et le journalise avec l’avant et l’après', async () => {
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })

    expect(
      (await enSolenne(() => modifierRelation({ id: marc.id, relation: 'FAMILY' })))
        .ok,
    ).toBe(true)

    expect(
      (await client.user.findUniqueOrThrow({ where: { id: marc.id } }))
        .relationType,
    ).toBe('FAMILY')

    const trace = await client.auditLog.findFirstOrThrow({
      where: { action: 'users.modificationRelation' },
    })
    expect(JSON.stringify(trace.diff)).toContain('FAMILY')
    expect(trace.actorId).toBe(solenneId)
  })

  it('refuse une relation inconnue', async () => {
    const marc = await creerUtilisateur(client)
    expect(
      await enSolenne(() => modifierRelation({ id: marc.id, relation: 'VOISIN' })),
    ).toMatchObject({ code: 'VALIDATION' })
  })
})

describe('USERS-004 / 005 — désactivation et réactivation', () => {
  it('USERS-004 — les sessions tombent immédiatement', async () => {
    const marc = await creerUtilisateur(client, { email: emailDeTest('marc') })
    const jetonMarc = await dansUneRequete(() => ouvrirSession(marc.id))

    expect((await en(jetonMarc, () => identiteCourante())).ok).toBe(true)

    expect((await enSolenne(() => desactiverUtilisateur({ id: marc.id }))).ok).toBe(
      true,
    )

    // Dès la requête suivante, plus rien.
    const apres = await en(jetonMarc, () => identiteCourante())
    expect(apres).toEqual({ ok: true, data: null })
    expect(await client.session.count({ where: { userId: marc.id } })).toBe(0)
  })

  it('un compte désactivé ne peut plus se connecter', async () => {
    const email = emailDeTest('marc')
    const marc = await creerUtilisateur(client, { email })
    await enSolenne(() => desactiverUtilisateur({ id: marc.id }))

    reinitialiserRequete()
    expect(
      await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE }),
    ).toMatchObject({ code: 'INVALID_CREDENTIALS' })
  }, 30_000)

  it('USERS-005 — la réactivation rend l’accès', async () => {
    const email = emailDeTest('marc')
    const marc = await creerUtilisateur(client, { email })
    await enSolenne(() => desactiverUtilisateur({ id: marc.id }))

    expect((await enSolenne(() => reactiverUtilisateur({ id: marc.id }))).ok).toBe(
      true,
    )

    reinitialiserRequete()
    expect((await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE })).ok).toBe(
      true,
    )
  }, 30_000)

  it('USERS-006 — un séjour à venir impose une confirmation', async () => {
    const marc = await creerUtilisateur(client)
    await creerSejour(marc.id, 10)

    const sansConfirmation = await enSolenne(() =>
      desactiverUtilisateur({ id: marc.id }),
    )
    expect(sansConfirmation).toMatchObject({ code: 'UPCOMING_STAYS' })
    expect(sansConfirmation.ok ? '' : sansConfirmation.message).toContain(
      '1 séjour',
    )
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: marc.id } })).status,
    ).toBe('ACTIVE')

    const sejours = await enSolenne(() => sejoursAVenirDe({ id: marc.id }))
    expect(sejours.ok && sejours.data).toHaveLength(1)

    const avecConfirmation = await enSolenne(() =>
      desactiverUtilisateur({ id: marc.id, confirme: true }),
    )
    expect(avecConfirmation.ok).toBe(true)
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: marc.id } })).status,
    ).toBe('DISABLED')
  })

  it('ne réclame rien pour un séjour déjà passé', async () => {
    const marc = await creerUtilisateur(client)
    await creerSejour(marc.id, -30)

    expect((await enSolenne(() => desactiverUtilisateur({ id: marc.id }))).ok).toBe(
      true,
    )
  })

  it('USERS-007 — les séjours d’un compte désactivé restent visibles pour Solenne', async () => {
    const marc = await creerUtilisateur(client)
    await creerSejour(marc.id, 10)
    await enSolenne(() => desactiverUtilisateur({ id: marc.id, confirme: true }))

    const sejours = await enSolenne(() => sejoursAVenirDe({ id: marc.id }))
    expect(sejours.ok && sejours.data).toHaveLength(1)

    const liste = await enSolenne(() => listerUtilisateurs())
    const ligne = liste.ok
      ? liste.data.find((utilisateur) => utilisateur.id === marc.id)
      : undefined
    expect(ligne?.statut).toBe('DISABLED')
  })
})

describe('USERS-008 / 009 — Solenne ne peut pas se verrouiller dehors', () => {
  it('USERS-008 — elle ne peut pas se désactiver', async () => {
    const resultat = await enSolenne(() =>
      desactiverUtilisateur({ id: solenneId }),
    )
    expect(resultat).toMatchObject({ code: 'SELF_DEACTIVATION' })
    expect(resultat.ok ? '' : resultat.message).toBe(
      'Vous ne pouvez pas désactiver votre propre compte.',
    )
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: solenneId } })).status,
    ).toBe('ACTIVE')
  })

  it('USERS-008 — ni forcer la main avec « confirme »', async () => {
    expect(
      await enSolenne(() => desactiverUtilisateur({ id: solenneId, confirme: true })),
    ).toMatchObject({ code: 'SELF_DEACTIVATION' })
  })

  it('USERS-009 — elle ne peut pas se rétrograder', async () => {
    const resultat = await enSolenne(() =>
      changerRole({ id: solenneId, role: 'FRIEND' }),
    )
    expect(resultat).toMatchObject({ code: 'LAST_ADMIN' })
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: solenneId } })).role,
    ).toBe('ADMIN')
  })

  it('USERS-009 — même avec une seconde administratrice, elle ne se rétrograde pas elle-même', async () => {
    const autre = await creerAdministratrice(client)
    expect(
      await enSolenne(() => changerRole({ id: solenneId, role: 'FRIEND' })),
    ).toMatchObject({ code: 'LAST_ADMIN' })

    // En revanche elle peut rétrograder l'autre.
    expect(
      (await enSolenne(() => changerRole({ id: autre.id, role: 'FRIEND' }))).ok,
    ).toBe(true)
  })

  it('elle ne peut pas se supprimer', async () => {
    expect(await enSolenne(() => supprimerUtilisateur({ id: solenneId }))).toMatchObject(
      { code: 'SELF_DELETION' },
    )
  })

  it('promeut quelqu’un sans difficulté', async () => {
    const marc = await creerUtilisateur(client)
    expect((await enSolenne(() => changerRole({ id: marc.id, role: 'ADMIN' }))).ok).toBe(
      true,
    )
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: marc.id } })).role,
    ).toBe('ADMIN')
  })
})

describe('USERS-010 / 011 — suppression RGPD', () => {
  it('USERS-010 — sans historique, le compte disparaît vraiment', async () => {
    const marc = await creerUtilisateur(client, { email: emailDeTest('marc') })
    await dansUneRequete(() => ouvrirSession(marc.id))

    const resultat = await enSolenne(() => supprimerUtilisateur({ id: marc.id }))
    expect(resultat.ok && resultat.data.mode).toBe('SUPPRIME')

    expect(await client.user.findUnique({ where: { id: marc.id } })).toBeNull()
    expect(await client.session.count({ where: { userId: marc.id } })).toBe(0)
  })

  it('USERS-011 — avec historique, les données personnelles s’effacent et les séjours restent', async () => {
    const marc = await creerUtilisateur(client, {
      prenom: 'Marc',
      nom: 'Delaunay',
      email: emailDeTest('marc'),
    })
    await client.user.update({
      where: { id: marc.id },
      data: { phone: '06 00 00 00 00', notes: 'Vient souvent' },
    })
    const sejour = await creerSejour(marc.id, -60)
    await creerSejour(marc.id, -30)
    await creerSejour(marc.id, -10)

    const resultat = await enSolenne(() => supprimerUtilisateur({ id: marc.id }))
    expect(resultat.ok && resultat.data.mode).toBe('ANONYMISE')

    const relu = await client.user.findUniqueOrThrow({ where: { id: marc.id } })
    expect(relu.firstName).toBe('Ancien invité')
    expect(relu.lastName).toBeNull()
    expect(relu.phone).toBeNull()
    expect(relu.notes).toBeNull()
    expect(relu.passwordHash).toBeNull()
    expect(relu.email).not.toContain('exemple.test')
    expect(relu.email).toMatch(/@anonyme\.invalid$/)
    expect(relu.status).toBe('DISABLED')
    expect(relu.anonymizedAt).not.toBeNull()

    // L'historique tient debout.
    expect(await client.stay.count({ where: { userId: marc.id } })).toBe(3)
    expect(
      await client.stay.findUniqueOrThrow({ where: { id: sejour.id } }),
    ).toBeTruthy()
  })

  it('un compte anonymisé ne se reconnecte ni ne se réactive', async () => {
    const email = emailDeTest('marc')
    const marc = await creerUtilisateur(client, { email })
    await creerSejour(marc.id, -30)
    await enSolenne(() => supprimerUtilisateur({ id: marc.id }))

    reinitialiserRequete()
    expect(
      await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE }),
    ).toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(await enSolenne(() => reactiverUtilisateur({ id: marc.id }))).toMatchObject(
      { code: 'NOT_FOUND' },
    )
  }, 30_000)

  it('la suppression coupe les sessions ouvertes', async () => {
    const marc = await creerUtilisateur(client)
    const jetonMarc = await dansUneRequete(() => ouvrirSession(marc.id))
    await creerSejour(marc.id, -30)

    await enSolenne(() => supprimerUtilisateur({ id: marc.id }))

    expect(await en(jetonMarc, () => identiteCourante())).toEqual({
      ok: true,
      data: null,
    })
  })

  it('refuse de supprimer la dernière administratrice', async () => {
    const autre = await creerAdministratrice(client)
    // Solenne rétrograde l'autre puis on tente de supprimer Solenne via l'autre.
    await enSolenne(() => changerRole({ id: autre.id, role: 'FRIEND' }))

    expect(await enSolenne(() => supprimerUtilisateur({ id: solenneId }))).toMatchObject(
      { code: 'SELF_DELETION' },
    )
  })

  it('refuse un identifiant inconnu, sans rien dire de plus', async () => {
    expect(
      await enSolenne(() => supprimerUtilisateur({ id: 'identifiant-invente' })),
    ).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('USERS-012 — journalisation', () => {
  it('une entrée par action, avec l’avant et l’après', async () => {
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })

    await enSolenne(() => modifierRelation({ id: marc.id, relation: 'FAMILY' }))
    await enSolenne(() => desactiverUtilisateur({ id: marc.id }))
    await enSolenne(() => reactiverUtilisateur({ id: marc.id }))
    await enSolenne(() => changerRole({ id: marc.id, role: 'ADMIN' }))

    const journal = await enSolenne(() => consulterJournalAudit({ action: 'users.' }))
    expect(journal.ok).toBe(true)
    if (!journal.ok) return

    const actions = journal.data.map((entree) => entree.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'users.modificationRelation',
        'users.desactivation',
        'users.reactivation',
        'users.changementRole',
      ]),
    )

    const desactivation = journal.data.find(
      (entree) => entree.action === 'users.desactivation',
    )
    expect(JSON.stringify(desactivation?.differentiel)).toContain('DISABLED')
    expect(desactivation?.acteurId).toBe(solenneId)
    expect(desactivation?.ip).toBe('203.0.113.7')
  })
})

describe('USERS-S02 / S07 — permissions', () => {
  it('USERS-S02 — un ami n’accède pas à la liste, et le refus est tracé', async () => {
    const marc = await creerUtilisateur(client)
    const jetonMarc = await dansUneRequete(() => ouvrirSession(marc.id))

    expect(await en(jetonMarc, () => listerUtilisateurs())).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(
      await client.auditLog.count({ where: { action: 'refus.users.lister' } }),
    ).toBe(1)
  })

  it('USERS-S07 — un ami ne peut pas s’auto-promouvoir', async () => {
    const marc = await creerUtilisateur(client)
    const jetonMarc = await dansUneRequete(() => ouvrirSession(marc.id))

    expect(
      await en(jetonMarc, () => changerRole({ id: marc.id, role: 'ADMIN' })),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: marc.id } })).role,
    ).toBe('FRIEND')
  })

  it('un ami ne désactive, ne réactive ni ne supprime personne', async () => {
    const marc = await creerUtilisateur(client)
    const lea = await creerUtilisateur(client)
    const jetonMarc = await dansUneRequete(() => ouvrirSession(marc.id))

    const appels: Array<() => Promise<unknown>> = [
      () => desactiverUtilisateur({ id: lea.id }),
      () => reactiverUtilisateur({ id: lea.id }),
      () => supprimerUtilisateur({ id: lea.id }),
      () => modifierRelation({ id: lea.id, relation: 'FAMILY' }),
      () => sejoursAVenirDe({ id: lea.id }),
    ]

    for (const appel of appels) {
      expect(await en(jetonMarc, appel)).toMatchObject({ code: 'FORBIDDEN' })
    }

    expect(
      (await client.user.findUniqueOrThrow({ where: { id: lea.id } })).status,
    ).toBe('ACTIVE')
  })

  it('PERM-013 — un ami ne lit pas le journal d’audit', async () => {
    const marc = await creerUtilisateur(client)
    const jetonMarc = await dansUneRequete(() => ouvrirSession(marc.id))

    expect(await en(jetonMarc, () => consulterJournalAudit())).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('un visiteur n’accède à rien', async () => {
    // Requête sans le moindre cookie : c'est exactement ce que voit le serveur
    // quand quelqu'un appelle l'action depuis l'extérieur (PERM-S06).
    expect(await dansUneRequete(() => listerUtilisateurs())).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    expect(await dansUneRequete(() => consulterJournalAudit())).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })
})
