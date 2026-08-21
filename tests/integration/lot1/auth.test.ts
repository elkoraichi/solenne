import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import { identiteCourante, seConnecter, seDeconnecter } from '@/server/actions/auth'
import { empreinteJeton } from '@/server/auth/jetons'
import { NOM_COOKIE_SESSION } from '@/server/auth/session'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  cookieCourant,
  dansUneRequete,
  poserCookie,
  reinitialiserRequete,
} from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  AUTRE_MOT_DE_PASSE,
  creerUtilisateur,
  emailDeTest,
  MOT_DE_PASSE_VALIDE,
} from '../fabriques'

const client: PrismaClient = clientDeTest()

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
})

afterAll(async () => {
  await viderDonnees(client)
  await client.$disconnect()
})

/** Connecte quelqu'un et renvoie le jeton de session posé dans le cookie. */
async function seConnecterAvec(email: string, motDePasse: string) {
  const resultat = await seConnecter({ email, motDePasse })
  return {
    resultat,
    jeton: cookieCourant(NOM_COOKIE_SESSION)?.value ?? null,
  }
}

describe('AUTH-001 — connexion valide', () => {
  it('ouvre une session, pose le cookie et met à jour la dernière connexion', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })
    expect(utilisateur.lastLoginAt).toBeNull()

    const { resultat, jeton } = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    expect(resultat).toEqual({ ok: true, data: null })
    expect(jeton).toBeTruthy()

    const sessions = await client.session.findMany({
      where: { userId: utilisateur.id },
    })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.sessionToken).toBe(empreinteJeton(jeton as string))

    const relu = await client.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
    })
    expect(relu.lastLoginAt).not.toBeNull()
  })

  it('écrit une entrée d’audit', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    const traces = await client.auditLog.findMany({
      where: { action: 'auth.connexion' },
    })
    expect(traces).toHaveLength(1)
    expect(traces[0]?.ip).toBe('203.0.113.7')
  })
})

describe('AUTH-002 / 003 / 005 — refus indiscernables', () => {
  it('refuse un mot de passe erroné', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    const resultat = await seConnecter({ email, motDePasse: AUTRE_MOT_DE_PASSE })
    expect(resultat).toEqual({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Email ou mot de passe incorrect.',
    })
  })

  it('AUTH-003 — répond exactement pareil sur un email inconnu', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    const connu = await seConnecter({ email, motDePasse: AUTRE_MOT_DE_PASSE })
    reinitialiserRequete()
    const inconnu = await seConnecter({
      email: 'personne@exemple.test',
      motDePasse: AUTRE_MOT_DE_PASSE,
    })

    expect(inconnu).toEqual(connu)
  })

  it('AUTH-005 — un compte désactivé reçoit le même refus, sans session', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, {
      email,
      statut: 'DISABLED',
    })

    const resultat = await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE })

    expect(resultat).toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(cookieCourant(NOM_COOKIE_SESSION)).toBeUndefined()
    expect(await client.session.count({ where: { userId: utilisateur.id } })).toBe(0)
  })

  it('AUTH-S07 — un statut injecté dans la charge utile est ignoré', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email, statut: 'DISABLED' })

    const resultat = await seConnecter({
      email,
      motDePasse: MOT_DE_PASSE_VALIDE,
      status: 'ACTIVE',
      role: 'ADMIN',
    })

    expect(resultat).toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(cookieCourant(NOM_COOKIE_SESSION)).toBeUndefined()
  })

  it('AUTH-S12 — vingt emails, connus et inconnus, donnent des réponses identiques', async () => {
    const connus = [emailDeTest(), emailDeTest(), emailDeTest()]
    for (const email of connus) await creerUtilisateur(client, { email })

    const reponses = new Set<string>()
    for (let i = 0; i < 20; i += 1) {
      const email = i % 2 === 0 ? connus[i % connus.length]! : `inconnu-${i}@exemple.test`
      reinitialiserRequete()
      const resultat = await seConnecter({
        email,
        motDePasse: 'CeMotDePasseEstFaux2026',
      })
      reponses.add(JSON.stringify(resultat))
    }

    expect(reponses.size).toBe(1)
  }, 60_000)
})

describe('AUTH-004 — délai de réponse constant', () => {
  it('ne trahit pas l’existence d’un compte par le temps de réponse', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    const mesurer = async (adresse: string) => {
      const debuts: number[] = []
      for (let i = 0; i < 5; i += 1) {
        reinitialiserRequete()
        const t0 = performance.now()
        await seConnecter({ email: adresse, motDePasse: 'MauvaisMotDePasse2026' })
        debuts.push(performance.now() - t0)
      }
      debuts.sort((a, b) => a - b)
      return debuts[Math.floor(debuts.length / 2)] as number
    }

    const avecCompte = await mesurer(email)
    const sansCompte = await mesurer('fantome@exemple.test')

    expect(Math.abs(avecCompte - sansCompte)).toBeLessThan(50)
  }, 60_000)
})

describe('AUTH-006 — normalisation de l’email', () => {
  it('ignore les espaces et la casse', async () => {
    const email = 'marc@exemple.test'
    await creerUtilisateur(client, { email })

    const { resultat } = await seConnecterAvec(
      '  Marc@Exemple.TEST  ',
      MOT_DE_PASSE_VALIDE,
    )
    expect(resultat.ok).toBe(true)
  })
})

describe('AUTH-007 / 015 — le mot de passe ne sort jamais', () => {
  it('stocke une empreinte Argon2id, jamais le mot de passe', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })

    expect(utilisateur.passwordHash).toMatch(/^\$argon2id\$/)
    expect(utilisateur.passwordHash).not.toContain(MOT_DE_PASSE_VALIDE)
  })

  it('AUTH-015 — aucune empreinte dans la réponse de connexion ni d’identité', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    const { resultat, jeton } = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)
    expect(JSON.stringify(resultat)).not.toContain('argon2')

    const identite = await dansUneRequete(
      () => identiteCourante(),
      { cookies: { [NOM_COOKIE_SESSION]: jeton as string } },
    )
    const charge = JSON.stringify(identite)
    expect(charge).not.toContain('argon2')
    expect(charge).not.toContain('passwordHash')
    expect(charge).not.toContain('status')
  })
})

describe('AUTH-008 — attributs du cookie de session', () => {
  it('pose un cookie httpOnly, sameSite lax, borné dans le temps', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    const pose = cookieCourant(NOM_COOKIE_SESSION)
    expect(pose?.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
    const expiration = pose?.options?.expires as Date
    expect(expiration.getTime()).toBeGreaterThan(Date.now())
    expect(expiration.getTime()).toBeLessThanOrEqual(
      Date.now() + 31 * 24 * 60 * 60 * 1000,
    )
  })

  it('n’exige `secure` qu’en production', async () => {
    // En test, `secure: true` empêcherait tout cookie sur http://localhost.
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)
    expect(cookieCourant(NOM_COOKIE_SESSION)?.options?.secure).toBe(false)
  })
})

describe('AUTH-009 / 010 — déconnexion', () => {
  it('détruit la session côté serveur et rend l’ancien cookie inutilisable', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })
    const { jeton } = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    const deconnexion = await dansUneRequete(() => seDeconnecter(), {
      cookies: { [NOM_COOKIE_SESSION]: jeton as string },
    })
    expect(deconnexion.ok).toBe(true)
    expect(await client.session.count({ where: { userId: utilisateur.id } })).toBe(0)

    const apres = await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: jeton as string },
    })
    expect(apres).toEqual({ ok: true, data: null })
  })

  it('AUTH-010 — se déconnecter d’un appareil laisse l’autre connecté', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })

    const appareilA = (await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)).jeton
    reinitialiserRequete()
    const appareilB = (await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)).jeton

    expect(appareilA).not.toBe(appareilB)
    expect(await client.session.count({ where: { userId: utilisateur.id } })).toBe(2)

    await dansUneRequete(() => seDeconnecter(), {
      cookies: { [NOM_COOKIE_SESSION]: appareilA as string },
    })

    const surA = await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: appareilA as string },
    })
    const surB = await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: appareilB as string },
    })

    expect(surA.ok && surA.data).toBeNull()
    expect(surB.ok && surB.data).toMatchObject({ email })
  })

  it('refuse la déconnexion sans session', async () => {
    const resultat = await seDeconnecter()
    expect(resultat).toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('AUTH-016 / S11 — sessions invalides', () => {
  it('AUTH-016 — une session expirée n’ouvre plus rien', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })
    const { jeton } = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    await client.session.updateMany({
      where: { userId: utilisateur.id },
      data: { expires: new Date(Date.now() - 1_000) },
    })

    const identite = await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: jeton as string },
    })
    expect(identite).toEqual({ ok: true, data: null })
    // La session morte est ramassée au passage.
    expect(await client.session.count({ where: { userId: utilisateur.id } })).toBe(0)
  })

  it('AUTH-S11 — un jeton falsifié ne correspond à aucune empreinte', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    const { jeton } = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    const falsifie = `${(jeton as string).slice(0, -3)}xyz`
    const identite = await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: falsifie },
    })
    expect(identite).toEqual({ ok: true, data: null })
  })

  it('AUTH-S10 — le cookie d’un compte supprimé ne vaut rien', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })
    const { jeton } = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    await client.user.delete({ where: { id: utilisateur.id } })

    const identite = await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: jeton as string },
    })
    expect(identite).toEqual({ ok: true, data: null })
  })

  it('AUTH-017 — une session très entamée est prolongée à l’usage', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })
    const { jeton } = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)

    const bientotFinie = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    await client.session.updateMany({
      where: { userId: utilisateur.id },
      data: { expires: bientotFinie },
    })

    await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: jeton as string },
    })

    const session = await client.session.findFirstOrThrow({
      where: { userId: utilisateur.id },
    })
    expect(session.expires.getTime()).toBeGreaterThan(bientotFinie.getTime())
  })
})

describe('AUTH-012 / 013 / 014 — limitation de débit', () => {
  it('bloque à la 6ᵉ tentative et explique le délai', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    for (let i = 0; i < 5; i += 1) {
      const echec = await seConnecter({ email, motDePasse: 'FauxMotDePasse2026' })
      expect(echec, `tentative ${i + 1}`).toMatchObject({
        code: 'INVALID_CREDENTIALS',
      })
    }

    const sixieme = await seConnecter({ email, motDePasse: 'FauxMotDePasse2026' })
    expect(sixieme).toMatchObject({ code: 'RATE_LIMITED' })

    // Même le bon mot de passe ne passe plus tant que le blocage tient.
    const avecLeBon = await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE })
    expect(avecLeBon).toMatchObject({ code: 'RATE_LIMITED' })
  }, 60_000)

  it('AUTH-013 — le blocage se lève une fois la fenêtre passée', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    for (let i = 0; i < 6; i += 1) {
      await seConnecter({ email, motDePasse: 'FauxMotDePasse2026' })
    }
    expect(await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE })).toMatchObject(
      { code: 'RATE_LIMITED' },
    )

    // On vieillit les tentatives de 16 minutes plutôt que d'attendre.
    await client.rateLimitHit.updateMany({
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    })

    const apres = await seConnecterAvec(email, MOT_DE_PASSE_VALIDE)
    expect(apres.resultat.ok).toBe(true)
  }, 60_000)

  it('AUTH-014 — bloquer un compte ne bloque pas l’autre depuis la même adresse', async () => {
    const emailA = emailDeTest('a')
    const emailB = emailDeTest('b')
    await creerUtilisateur(client, { email: emailA })
    await creerUtilisateur(client, { email: emailB })

    for (let i = 0; i < 6; i += 1) {
      await seConnecter({ email: emailA, motDePasse: 'FauxMotDePasse2026' })
    }

    expect(
      await seConnecter({ email: emailA, motDePasse: MOT_DE_PASSE_VALIDE }),
    ).toMatchObject({ code: 'RATE_LIMITED' })

    const surB = await seConnecterAvec(emailB, MOT_DE_PASSE_VALIDE)
    expect(surB.resultat.ok).toBe(true)
  }, 60_000)
})

describe('AUTH-018 — validation de l’entrée', () => {
  it('refuse un formulaire vide en nommant les champs', async () => {
    const resultat = await seConnecter({})
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(Object.keys(resultat.champs ?? {}).sort()).toEqual([
      'email',
      'motDePasse',
    ])
  })

  it('refuse une adresse mal formée', async () => {
    const resultat = await seConnecter({
      email: 'pas-une-adresse',
      motDePasse: MOT_DE_PASSE_VALIDE,
    })
    expect(resultat).toMatchObject({ code: 'VALIDATION' })
  })

  it('AUTH-S06 — un appel direct subit exactement les mêmes contrôles', async () => {
    const resultat = await seConnecter('chaîne arbitraire')
    expect(resultat).toMatchObject({ code: 'VALIDATION' })
  })

  it('refuse une entrée démesurée sans planter', async () => {
    const resultat = await seConnecter({
      email: `${'x'.repeat(300)}@exemple.test`,
      motDePasse: 'y'.repeat(100_000),
    })
    expect(resultat).toMatchObject({ code: 'VALIDATION' })
  })
})

describe('AUTH-011 — aucune inscription libre', () => {
  it('ne connecte personne dont le compte n’existe pas', async () => {
    const resultat = await seConnecter({
      email: 'nouveau@exemple.test',
      motDePasse: MOT_DE_PASSE_VALIDE,
    })
    expect(resultat).toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(await client.user.count()).toBe(0)
  })

  it('refuse un compte sans mot de passe défini', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email, motDePasse: null })

    const resultat = await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE })
    expect(resultat).toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })
})

describe('Cookie absent ou vide', () => {
  it('ne considère personne comme connecté', async () => {
    expect(await identiteCourante()).toEqual({ ok: true, data: null })

    poserCookie(NOM_COOKIE_SESSION, '')
    expect(await identiteCourante()).toEqual({ ok: true, data: null })
  })
})
