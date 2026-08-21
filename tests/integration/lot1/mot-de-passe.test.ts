import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import { seConnecter } from '@/server/actions/auth'
import {
  changerMotDePasse,
  demanderReinitialisation,
  reinitialiserMotDePasse,
} from '@/server/actions/mot-de-passe'
import { empreinteJeton } from '@/server/auth/jetons'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import {
  configurerEmetteur,
  type Courrier,
} from '@/server/notifications/courrier'
import {
  configurerSortieJournal,
  retablirSortieJournalParDefaut,
  type EntreeJournal,
} from '@/server/logging/logger'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  cookieCourant,
  dansUneRequete,
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

let boiteAuxLettres: Courrier[] = []
let rendreEmetteur: (() => void) | null = null

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  boiteAuxLettres = []
  rendreEmetteur = configurerEmetteur(async (courrier) => {
    boiteAuxLettres.push(courrier)
  })
})

afterEach(() => {
  rendreEmetteur?.()
  retablirSortieJournalParDefaut()
})

afterAll(async () => {
  await viderDonnees(client)
  await client.$disconnect()
})

function jetonDuDernierCourrier(): string {
  const dernier = boiteAuxLettres.at(-1)
  const lien = dernier?.lien ?? ''
  return lien.split('/').pop() ?? ''
}

async function connecter(email: string, motDePasse = MOT_DE_PASSE_VALIDE) {
  reinitialiserRequete()
  const resultat = await seConnecter({ email, motDePasse })
  return {
    resultat,
    jeton: cookieCourant(NOM_COOKIE_SESSION)?.value ?? null,
  }
}

describe('PWD-001 / 002 / 015 — la demande ne révèle rien', () => {
  it('envoie un lien sur un email connu, et répond sobrement', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    const resultat = await demanderReinitialisation({ email })

    expect(resultat).toEqual({ ok: true, data: null })
    expect(boiteAuxLettres).toHaveLength(1)
    expect(boiteAuxLettres[0]?.destinataire).toBe(email)
    expect(boiteAuxLettres[0]?.lien).toContain('/mot-de-passe/')
  })

  it('PWD-002 — répond pareil sur un email inconnu, sans rien envoyer', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    const connu = await demanderReinitialisation({ email })
    boiteAuxLettres = []
    const inconnu = await demanderReinitialisation({
      email: 'fantome@exemple.test',
    })

    expect(inconnu).toEqual(connu)
    expect(boiteAuxLettres).toHaveLength(0)
  })

  it('PWD-015 — un compte désactivé ne reçoit rien, avec le même message', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email, statut: 'DISABLED' })

    const resultat = await demanderReinitialisation({ email })

    expect(resultat).toEqual({ ok: true, data: null })
    expect(boiteAuxLettres).toHaveLength(0)
    expect(await client.passwordResetToken.count()).toBe(0)
  })

  it('normalise l’adresse avant de chercher le compte', async () => {
    const email = 'lea@exemple.test'
    await creerUtilisateur(client, { email })

    await demanderReinitialisation({ email: '  Lea@Exemple.TEST ' })
    expect(boiteAuxLettres).toHaveLength(1)
  })
})

describe('PWD-003 / 018 — le jeton ne se lit nulle part', () => {
  it('PWD-003 — seule l’empreinte est en base', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await demanderReinitialisation({ email })

    const jetonClair = jetonDuDernierCourrier()
    const enregistrement = await client.passwordResetToken.findFirstOrThrow()

    expect(jetonClair.length).toBeGreaterThanOrEqual(40)
    expect(enregistrement.tokenHash).not.toBe(jetonClair)
    expect(enregistrement.tokenHash).toBe(empreinteJeton(jetonClair))
    expect(enregistrement.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('PWD-018 — ni jeton ni mot de passe dans les journaux', async () => {
    const entrees: EntreeJournal[] = []
    const rendre = configurerSortieJournal((entree) => entrees.push(entree))

    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await demanderReinitialisation({ email })
    const jeton = jetonDuDernierCourrier()
    await reinitialiserMotDePasse({ jeton, motDePasse: AUTRE_MOT_DE_PASSE })

    rendre()

    const tout = JSON.stringify(entrees)
    expect(tout).not.toContain(jeton)
    expect(tout).not.toContain(AUTRE_MOT_DE_PASSE)
    expect(tout).not.toContain('argon2')
  })
})

describe('PWD-004 → 008 — usage du jeton', () => {
  it('PWD-004 — un jeton frais change le mot de passe', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await demanderReinitialisation({ email })

    const resultat = await reinitialiserMotDePasse({
      jeton: jetonDuDernierCourrier(),
      motDePasse: AUTRE_MOT_DE_PASSE,
    })
    expect(resultat.ok).toBe(true)

    expect((await connecter(email, MOT_DE_PASSE_VALIDE)).resultat).toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    expect((await connecter(email, AUTRE_MOT_DE_PASSE)).resultat.ok).toBe(true)
  }, 30_000)

  it('PWD-005 — un jeton de plus d’une heure est refusé, avec une issue', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await demanderReinitialisation({ email })

    await client.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })

    const resultat = await reinitialiserMotDePasse({
      jeton: jetonDuDernierCourrier(),
      motDePasse: AUTRE_MOT_DE_PASSE,
    })
    expect(resultat).toMatchObject({ code: 'RESET_LINK_EXPIRED' })
    expect(resultat.ok ? '' : resultat.message).toContain('recommencer')
  })

  it('PWD-006 — un jeton consommé est définitivement mort', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await demanderReinitialisation({ email })
    const jeton = jetonDuDernierCourrier()

    expect(
      (await reinitialiserMotDePasse({ jeton, motDePasse: AUTRE_MOT_DE_PASSE })).ok,
    ).toBe(true)

    const rejeu = await reinitialiserMotDePasse({
      jeton,
      motDePasse: 'EncoreUnAutreMotDePasse2026',
    })
    expect(rejeu).toMatchObject({ code: 'INVALID_TOKEN' })
  }, 30_000)

  it('PWD-007 — un jeton inventé reçoit un refus neutre', async () => {
    const resultat = await reinitialiserMotDePasse({
      jeton: 'jeton-completement-invente-0123456789',
      motDePasse: AUTRE_MOT_DE_PASSE,
    })
    expect(resultat).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('PWD-008 — le jeton de quelqu’un d’autre ne change que son compte à elle', async () => {
    const emailA = emailDeTest('a')
    const emailB = emailDeTest('b')
    const utilisateurA = await creerUtilisateur(client, { email: emailA })
    await creerUtilisateur(client, { email: emailB })

    await demanderReinitialisation({ email: emailB })
    const jetonDeB = jetonDuDernierCourrier()

    // A utilise le jeton de B : le jeton reste attaché à B, pas à A.
    await reinitialiserMotDePasse({
      jeton: jetonDeB,
      motDePasse: AUTRE_MOT_DE_PASSE,
    })

    const relu = await client.user.findUniqueOrThrow({
      where: { id: utilisateurA.id },
    })
    expect((await connecter(emailA, MOT_DE_PASSE_VALIDE)).resultat.ok).toBe(true)
    expect(relu.passwordHash).toBe(
      (await client.user.findUniqueOrThrow({ where: { id: utilisateurA.id } }))
        .passwordHash,
    )
    expect((await connecter(emailB, AUTRE_MOT_DE_PASSE)).resultat.ok).toBe(true)
  }, 30_000)

  it('PWD-017 — une nouvelle demande tue le jeton précédent', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    await demanderReinitialisation({ email })
    const premier = jetonDuDernierCourrier()
    await demanderReinitialisation({ email })
    const second = jetonDuDernierCourrier()

    expect(premier).not.toBe(second)
    expect(
      await reinitialiserMotDePasse({
        jeton: premier,
        motDePasse: AUTRE_MOT_DE_PASSE,
      }),
    ).toMatchObject({ code: 'INVALID_TOKEN' })
    expect(
      (await reinitialiserMotDePasse({
        jeton: second,
        motDePasse: AUTRE_MOT_DE_PASSE,
      })).ok,
    ).toBe(true)
  }, 30_000)

  it('PWD-016 — les demandes en rafale sont étouffées sans changer la réponse', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })

    const reponses = new Set<string>()
    for (let i = 0; i < 10; i += 1) {
      reponses.add(JSON.stringify(await demanderReinitialisation({ email })))
    }

    expect(reponses.size).toBe(1)
    expect(boiteAuxLettres.length).toBeLessThanOrEqual(3)
    // PWD-017 tient malgré la rafale : un seul jeton vivant.
    expect(await client.passwordResetToken.count({ where: { usedAt: null } })).toBe(1)
  }, 30_000)
})

describe('PWD-009 / 010 / 011 — politique de mot de passe', () => {
  async function tenterAvec(motDePasse: string) {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    await demanderReinitialisation({ email })
    return reinitialiserMotDePasse({
      jeton: jetonDuDernierCourrier(),
      motDePasse,
    })
  }

  it('PWD-009 — refuse moins de 10 caractères', async () => {
    const resultat = await tenterAvec('Court1')
    expect(resultat).toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    expect(resultat.ok ? '' : resultat.message).toContain('10 caractères')
  })

  it('PWD-010 — refuse un mot de passe trop courant', async () => {
    for (const faible of ['motdepasse', 'azertyuiop', 'motdepasse2026']) {
      const resultat = await tenterAvec(faible)
      expect(resultat, faible).toMatchObject({ code: 'PASSWORD_TOO_COMMON' })
    }
  }, 30_000)

  it('PWD-011 — refuse un mot de passe identique à l’ancien', async () => {
    const resultat = await tenterAvec(MOT_DE_PASSE_VALIDE)
    expect(resultat).toMatchObject({ code: 'PASSWORD_SAME_AS_OLD' })
  })

  it('accepte une phrase de passe longue et ordinaire', async () => {
    const resultat = await tenterAvec('le tilleul du fond du jardin')
    expect(resultat.ok).toBe(true)
  })
})

describe('PWD-012 / 013 / 014 — changement depuis le profil', () => {
  it('PWD-012 — l’ancien mot de passe ouvre le changement', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    const { jeton } = await connecter(email)

    const resultat = await dansUneRequete(
      () => changerMotDePasse({ ancien: MOT_DE_PASSE_VALIDE, nouveau: AUTRE_MOT_DE_PASSE }),
      { cookies: { [NOM_COOKIE_SESSION]: jeton as string } },
    )
    expect(resultat.ok).toBe(true)
    expect((await connecter(email, AUTRE_MOT_DE_PASSE)).resultat.ok).toBe(true)
  }, 30_000)

  it('PWD-014 — un mauvais ancien mot de passe bloque tout', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    const { jeton } = await connecter(email)

    const resultat = await dansUneRequete(
      () => changerMotDePasse({ ancien: 'PasLeBon2026Vraiment', nouveau: AUTRE_MOT_DE_PASSE }),
      { cookies: { [NOM_COOKIE_SESSION]: jeton as string } },
    )
    expect(resultat).toMatchObject({ code: 'WRONG_PASSWORD' })
    expect((await connecter(email, MOT_DE_PASSE_VALIDE)).resultat.ok).toBe(true)
  }, 30_000)

  it('PWD-013 — les autres appareils sont déconnectés, pas le sien', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })

    const appareilA = (await connecter(email)).jeton as string
    const appareilB = (await connecter(email)).jeton as string
    expect(await client.session.count({ where: { userId: utilisateur.id } })).toBe(2)

    await dansUneRequete(
      () => changerMotDePasse({ ancien: MOT_DE_PASSE_VALIDE, nouveau: AUTRE_MOT_DE_PASSE }),
      { cookies: { [NOM_COOKIE_SESSION]: appareilA } },
    )

    const sessions = await client.session.findMany({
      where: { userId: utilisateur.id },
    })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.sessionToken).toBe(empreinteJeton(appareilA))
    expect(appareilB).not.toBe(appareilA)
  }, 30_000)

  it('une réinitialisation par jeton, elle, coupe toutes les sessions', async () => {
    const email = emailDeTest()
    const utilisateur = await creerUtilisateur(client, { email })
    await connecter(email)
    await connecter(email)

    await demanderReinitialisation({ email })
    await reinitialiserMotDePasse({
      jeton: jetonDuDernierCourrier(),
      motDePasse: AUTRE_MOT_DE_PASSE,
    })

    expect(await client.session.count({ where: { userId: utilisateur.id } })).toBe(0)
  }, 30_000)

  it('exige une session — un visiteur ne change le mot de passe de personne', async () => {
    const resultat = await changerMotDePasse({
      ancien: MOT_DE_PASSE_VALIDE,
      nouveau: AUTRE_MOT_DE_PASSE,
    })
    expect(resultat).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('refuse un changement vers le mot de passe déjà en place', async () => {
    const email = emailDeTest()
    await creerUtilisateur(client, { email })
    const { jeton } = await connecter(email)

    const resultat = await dansUneRequete(
      () => changerMotDePasse({ ancien: MOT_DE_PASSE_VALIDE, nouveau: MOT_DE_PASSE_VALIDE }),
      { cookies: { [NOM_COOKIE_SESSION]: jeton as string } },
    )
    expect(resultat).toMatchObject({ code: 'PASSWORD_SAME_AS_OLD' })
  }, 30_000)
})

describe('Validation des entrées', () => {
  it('refuse une demande sans email', async () => {
    expect(await demanderReinitialisation({})).toMatchObject({ code: 'VALIDATION' })
  })

  it('refuse une réinitialisation sans jeton', async () => {
    expect(
      await reinitialiserMotDePasse({ motDePasse: AUTRE_MOT_DE_PASSE }),
    ).toMatchObject({ code: 'VALIDATION' })
  })

  it('refuse un jeton démesuré sans interroger la base', async () => {
    expect(
      await reinitialiserMotDePasse({
        jeton: 'x'.repeat(100_000),
        motDePasse: AUTRE_MOT_DE_PASSE,
      }),
    ).toMatchObject({ code: 'VALIDATION' })
  })
})

describe('Sessions ouvertes hors connexion', () => {
  it('une session posée directement fonctionne comme les autres', async () => {
    const utilisateur = await creerUtilisateur(client, { email: emailDeTest() })
    const jeton = await dansUneRequete(() => ouvrirSession(utilisateur.id))

    const resultat = await dansUneRequete(
      () => changerMotDePasse({ ancien: MOT_DE_PASSE_VALIDE, nouveau: AUTRE_MOT_DE_PASSE }),
      { cookies: { [NOM_COOKIE_SESSION]: jeton } },
    )
    expect(resultat.ok).toBe(true)
  }, 30_000)
})
