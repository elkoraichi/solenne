import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import { identiteCourante, seDeconnecter } from '@/server/actions/auth'
import { emettreInvitation, listerInvitations } from '@/server/actions/invitations'
import { monProfil, voirProfil } from '@/server/actions/profil'
import {
  consulterJournalAudit,
  desactiverUtilisateur,
  listerUtilisateurs,
  modifierRelation,
} from '@/server/actions/utilisateurs'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { requireRole, requireUser } from '@/server/auth/garde'
import { empreinteJeton } from '@/server/auth/jetons'
import {
  fermerLesSessions,
  NOM_COOKIE_SESSION,
  ouvrirSession,
} from '@/server/auth/session'
import type { PrismaClient } from '@/generated/prisma/client'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerUtilisateur,
  emailDeTest,
} from '../fabriques'

const client: PrismaClient = clientDeTest()

let solenneId = ''
let jetonSolenne = ''
let amiId = ''
let jetonAmi = ''

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  reinitialiserAntiSaturation()

  const solenne = await creerAdministratrice(client)
  solenneId = solenne.id
  jetonSolenne = await dansUneRequete(() => ouvrirSession(solenne.id))

  const ami = await creerUtilisateur(client, { prenom: 'Marc' })
  amiId = ami.id
  jetonAmi = await dansUneRequete(() => ouvrirSession(ami.id))
})

afterAll(async () => {
  await viderDonnees(client)
  await client.$disconnect()
})

function en<T>(jeton: string | null, traitement: () => Promise<T>) {
  return dansUneRequete(traitement, {
    cookies: jeton ? { [NOM_COOKIE_SESSION]: jeton } : {},
  })
}

interface ActionSousTest {
  readonly nom: string
  readonly appel: () => Promise<unknown>
}

/** Toutes les actions réservées à Solenne, pour les parcourir d'un bloc. */
const ACTIONS_ADMIN: readonly ActionSousTest[] = [
  { nom: 'listerUtilisateurs', appel: () => listerUtilisateurs() },
  { nom: 'listerInvitations', appel: () => listerInvitations() },
  { nom: 'consulterJournalAudit', appel: () => consulterJournalAudit() },
  {
    nom: 'emettreInvitation',
    appel: () => emettreInvitation({ email: emailDeTest('cible') }),
  },
] as const

describe('PERM-001 / 002 / 004 — le socle', () => {
  it('PERM-001 — un visiteur n’obtient aucune donnée', async () => {
    const resultat = await en(null, () => monProfil())
    expect(resultat).toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(JSON.stringify(resultat)).not.toContain('@exemple.test')
  })

  it('PERM-002 — un ami accède aux actions d’ami', async () => {
    const resultat = await en(jetonAmi, () => monProfil())
    expect(resultat.ok).toBe(true)
  })

  it('PERM-004 — Solenne accède aux actions d’administration, avec trace', async () => {
    const resultat = await en(jetonSolenne, () =>
      emettreInvitation({ email: emailDeTest('cible') }),
    )
    expect(resultat.ok).toBe(true)
    expect(
      await client.auditLog.count({ where: { action: 'invite.emission' } }),
    ).toBe(1)
  })
})

describe('PERM-003 / S02 — un ami sur une fonction de Solenne', () => {
  it('est refusé partout, sans aucune écriture', async () => {
    for (const action of ACTIONS_ADMIN) {
      const resultat = await en(jetonAmi, action.appel)
      expect(resultat, action.nom).toMatchObject({ code: 'FORBIDDEN' })
    }

    expect(await client.invitation.count()).toBe(0)
  })

  it('laisse une trace d’audit du refus', async () => {
    await en(jetonAmi, () => listerUtilisateurs())

    const refus = await client.auditLog.findFirstOrThrow({
      where: { action: 'refus.users.lister' },
    })
    expect(refus.actorId).toBe(amiId)
    expect(JSON.stringify(refus.diff)).toContain('FRIEND')
  })
})

describe('PERM-005 / 006 / 007 — la session ne fait pas foi à elle seule', () => {
  it('PERM-005 — une session expirée est refusée et ramassée', async () => {
    await client.session.updateMany({
      where: { userId: amiId },
      data: { expires: new Date(Date.now() - 1_000) },
    })

    expect(await en(jetonAmi, () => monProfil())).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    expect(await client.session.count({ where: { userId: amiId } })).toBe(0)
  })

  it('PERM-006 — un compte désactivé est refusé, session encore ouverte ou non', async () => {
    await en(jetonSolenne, () => desactiverUtilisateur({ id: amiId }))

    expect(await en(jetonAmi, () => monProfil())).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    expect(await client.session.count({ where: { userId: amiId } })).toBe(0)
  })

  it('PERM-006 — même si la session survit à la désactivation, l’accès tombe', async () => {
    // Cas limite : le compte est désactivé sans passer par l'action, donc sans
    // purge des sessions. La garde doit tenir quand même.
    await client.user.update({
      where: { id: amiId },
      data: { status: 'DISABLED' },
    })

    expect(await en(jetonAmi, () => monProfil())).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })

  it('PERM-007 — le rôle est relu à chaque appel', async () => {
    const promue = await creerUtilisateur(client, { prenom: 'Promue' })
    const jetonPromue = await dansUneRequete(() => ouvrirSession(promue.id))

    // Ami : refusé.
    expect(await en(jetonPromue, () => listerUtilisateurs())).toMatchObject({
      code: 'FORBIDDEN',
    })

    // Promue en cours de session, sans reconnexion : acceptée.
    await client.user.update({ where: { id: promue.id }, data: { role: 'ADMIN' } })
    expect((await en(jetonPromue, () => listerUtilisateurs())).ok).toBe(true)

    // Rétrogradée : refusée à nouveau, immédiatement.
    await client.user.update({ where: { id: promue.id }, data: { role: 'FRIEND' } })
    expect(await en(jetonPromue, () => listerUtilisateurs())).toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('PERM-008 / S03 — un refus ne révèle rien', () => {
  it('PERM-008 — ressource inexistante et ressource interdite se ressemblent', async () => {
    const autre = await creerUtilisateur(client, { statut: 'DISABLED' })

    const inexistante = await en(jetonAmi, () =>
      voirProfil({ id: 'identifiant-totalement-invente' }),
    )
    const interdite = await en(jetonAmi, () => voirProfil({ id: autre.id }))

    expect(inexistante).toEqual(interdite)
    expect(inexistante).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('PERM-S03 — un ami ne lit pas les données d’un autre', async () => {
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await client.user.update({
      where: { id: lea.id },
      data: { phone: '06 11 22 33 44', notes: 'Note privée' },
    })

    const resultat = await en(jetonAmi, () => voirProfil({ id: lea.id }))
    const charge = JSON.stringify(resultat)

    expect(charge).not.toContain('06 11 22 33 44')
    expect(charge).not.toContain('Note privée')
    expect(charge).not.toContain(lea.email)
  })

  it('PERM-S04 — un ami n’écrit pas sur les données d’un autre', async () => {
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })

    expect(
      await en(jetonAmi, () => modifierRelation({ id: lea.id, relation: 'FAMILY' })),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: lea.id } })).relationType,
    ).toBeNull()
  })
})

describe('PERM-009 / 014 — comportement des gardes', () => {
  it('PERM-009 — refus par défaut : sans session, la garde lève', async () => {
    await expect(en(null, () => requireUser('test'))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    await expect(en(null, () => requireRole('ADMIN', 'test'))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })

  it('PERM-014 — deux gardes imbriquées ne produisent ni double refus ni boucle', async () => {
    const resultat = await en(jetonSolenne, async () => {
      const premiere = await requireRole('ADMIN', 'externe')
      const seconde = await requireUser('interne')
      const troisieme = await requireRole('ADMIN', 'encore')
      return [premiere.id, seconde.id, troisieme.id]
    })

    expect(resultat).toEqual([solenneId, solenneId, solenneId])

    // Aucun refus n'a été écrit : tout s'est bien passé.
    expect(
      await client.auditLog.count({ where: { action: { startsWith: 'refus.' } } }),
    ).toBe(0)
  })

  it('la garde de rôle renvoie bien l’identité, pas un simple booléen', async () => {
    const utilisateur = await en(jetonSolenne, () => requireRole('ADMIN', 'test'))
    expect(utilisateur.role).toBe('ADMIN')
    expect(utilisateur.sessionId).toBeTruthy()
  })
})

describe('PERM-010 / 011 — journal d’audit', () => {
  it('PERM-010 — une action d’administration écrit acteur, entité, avant/après, IP et date', async () => {
    await en(jetonSolenne, () =>
      modifierRelation({ id: amiId, relation: 'FAMILY' }),
    )

    const entree = await client.auditLog.findFirstOrThrow({
      where: { action: 'users.modificationRelation' },
    })
    expect(entree.actorId).toBe(solenneId)
    expect(entree.entityType).toBe('User')
    expect(entree.entityId).toBe(amiId)
    expect(entree.ip).toBe('203.0.113.7')
    expect(entree.createdAt).toBeInstanceOf(Date)

    const diff = entree.diff as { avant?: unknown; apres?: unknown }
    expect(diff.avant).toEqual({ relation: null })
    expect(diff.apres).toEqual({ relation: 'FAMILY' })
  })

  it('PERM-011 — le journal ne se modifie ni ne s’efface', async () => {
    await en(jetonSolenne, () =>
      modifierRelation({ id: amiId, relation: 'FAMILY' }),
    )

    await expect(
      client.$executeRawUnsafe(`UPDATE "audit_logs" SET action = 'effacé'`),
    ).rejects.toThrow(/écriture seule/)
    await expect(
      client.$executeRawUnsafe(`DELETE FROM "audit_logs"`),
    ).rejects.toThrow(/écriture seule/)

    expect(await client.auditLog.count()).toBeGreaterThan(0)
  })

  it('PERM-013 — le journal n’est lisible que par Solenne', async () => {
    expect(await en(jetonAmi, () => consulterJournalAudit())).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect((await en(jetonSolenne, () => consulterJournalAudit())).ok).toBe(true)
  })
})

describe('PERM-S05 / S06 / S07 — contournement de l’interface', () => {
  it('PERM-S05 / S06 — un appel forgé, hors interface, subit la même garde', async () => {
    // Aucun formulaire, aucun bouton : l'action est appelée directement.
    for (const action of ACTIONS_ADMIN) {
      expect(await en(jetonAmi, action.appel), action.nom).toMatchObject({
        code: 'FORBIDDEN',
      })
      expect(await en(null, action.appel), action.nom).toMatchObject({
        code: 'UNAUTHENTICATED',
      })
    }
  })

  it('PERM-S07 — un rôle injecté dans la charge utile est ignoré', async () => {
    const resultat = await en(jetonAmi, () =>
      listerUtilisateurs({
        role: 'ADMIN',
        currentUserRole: 'ADMIN',
        estAdministratrice: true,
      } as unknown as Record<string, unknown>),
    )
    expect(resultat).toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('PERM-S09 — pas de fuite dans la réponse', () => {
  it('la réponse d’une action d’ami ne contient aucun champ réservé', async () => {
    await client.user.update({
      where: { id: amiId },
      data: { notes: 'Note que Solenne seule voit' },
    })

    const resultat = await en(jetonAmi, () => monProfil())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const champs = Object.keys(resultat.data)
    expect(champs).not.toContain('notes')
    expect(champs).not.toContain('passwordHash')
    expect(champs).not.toContain('status')
    expect(JSON.stringify(resultat)).not.toContain('Note que Solenne seule voit')
  })

  it('l’identité renvoyée ne porte que ce qui sert à l’affichage', async () => {
    const resultat = await en(jetonAmi, () => identiteCourante())
    expect(resultat.ok).toBe(true)
    if (!resultat.ok || !resultat.data) return

    expect(Object.keys(resultat.data).sort()).toEqual([
      'avatarUrl',
      'email',
      'estAdministratrice',
      'id',
      'nom',
      'prenom',
    ])
  })
})

describe('PERM-S10 / S11 — sessions révoquées ou falsifiées', () => {
  it('PERM-S10 — une session révoquée ailleurs ne vaut plus rien', async () => {
    const secondAppareil = await dansUneRequete(() => ouvrirSession(amiId))

    await dansUneRequete(() => fermerLesSessions(amiId, { sauf: undefined }))

    for (const jeton of [jetonAmi, secondAppareil]) {
      expect(await en(jeton, () => monProfil())).toMatchObject({
        code: 'UNAUTHENTICATED',
      })
    }
  })

  it('PERM-S10 — se déconnecter d’un appareil ne révoque que celui-là', async () => {
    const secondAppareil = await dansUneRequete(() => ouvrirSession(amiId))
    await en(jetonAmi, () => seDeconnecter())

    expect(await en(jetonAmi, () => monProfil())).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    expect((await en(secondAppareil, () => monProfil())).ok).toBe(true)
  })

  it('PERM-S11 — un cookie falsifié ne crée aucune session', async () => {
    const falsifications = [
      `${jetonAmi.slice(0, -4)}AAAA`,
      empreinteJeton(jetonAmi), // l'empreinte elle-même ne sert à rien
      'x'.repeat(43),
      '../../etc/passwd',
      '',
    ]

    for (const faux of falsifications) {
      expect(await en(faux, () => monProfil()), faux.slice(0, 12)).toMatchObject({
        code: 'UNAUTHENTICATED',
      })
    }
    expect(await client.session.count()).toBe(2)
  })
})

describe('PERM-S12 — rafale d’appels refusés', () => {
  it('refuse les cent appels et n’écrit pas cent lignes d’audit', async () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i += 1) {
      const resultat = await en(jetonAmi, () => listerUtilisateurs())
      codes.add(resultat.ok ? 'OK' : resultat.code)
    }

    expect(codes).toEqual(new Set(['FORBIDDEN']))

    // Le journal reste lisible : une entrée par minute glissante, pas cent.
    const traces = await client.auditLog.count({
      where: { action: 'refus.users.lister' },
    })
    expect(traces).toBe(1)
  }, 120_000)

  it('n’a rien écrit en base malgré la rafale', async () => {
    for (let i = 0; i < 20; i += 1) {
      await en(jetonAmi, () => emettreInvitation({ email: emailDeTest('cible') }))
    }
    expect(await client.invitation.count()).toBe(0)
  }, 60_000)
})

describe('PERM-S01 — accès non authentifié à toutes les actions', () => {
  it('aucune action ne répond à un visiteur, sauf les publiques', async () => {
    const actionsPrivees = [
      { nom: 'monProfil', appel: () => monProfil() },
      { nom: 'voirProfil', appel: () => voirProfil({ id: amiId }) },
      { nom: 'seDeconnecter', appel: () => seDeconnecter() },
      ...ACTIONS_ADMIN,
    ]

    for (const action of actionsPrivees) {
      const resultat = await en(null, action.appel)
      expect(resultat, action.nom).toMatchObject({ code: 'UNAUTHENTICATED' })
    }
  })

  it('`identiteCourante` répond « personne » plutôt que de refuser', async () => {
    // C'est le seul point d'entrée que l'interface interroge avant connexion :
    // il doit répondre, mais ne rien dire.
    expect(await en(null, () => identiteCourante())).toEqual({
      ok: true,
      data: null,
    })
  })
})
