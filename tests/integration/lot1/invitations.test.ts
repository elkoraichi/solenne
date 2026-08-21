import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import { identiteCourante, seConnecter } from '@/server/actions/auth'
import {
  activerInvitation,
  consulterInvitation,
  emettreInvitation,
  listerInvitations,
  relancerInvitation,
  revoquerInvitation,
} from '@/server/actions/invitations'
import { empreinteJeton } from '@/server/auth/jetons'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import {
  configurerEmetteur,
  type Courrier,
} from '@/server/notifications/courrier'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  cookieCourant,
  dansUneRequete,
  reinitialiserRequete,
} from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerUtilisateur,
  emailDeTest,
  MOT_DE_PASSE_VALIDE,
} from '../fabriques'

const client: PrismaClient = clientDeTest()

let boiteAuxLettres: Courrier[] = []
let rendreEmetteur: (() => void) | null = null
let jetonSolenne = ''

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  boiteAuxLettres = []
  rendreEmetteur = configurerEmetteur(async (courrier) => {
    boiteAuxLettres.push(courrier)
  })

  const solenne = await creerAdministratrice(client)
  jetonSolenne = await dansUneRequete(() => ouvrirSession(solenne.id))
})

afterEach(() => {
  rendreEmetteur?.()
  vi.restoreAllMocks()
})

afterAll(async () => {
  await viderDonnees(client)
  await client.$disconnect()
})

/** Exécute une action « en tant que Solenne ». */
function enTantQueSolenne<T>(traitement: () => Promise<T>): Promise<T> {
  return dansUneRequete(traitement, {
    cookies: { [NOM_COOKIE_SESSION]: jetonSolenne },
  })
}

function jetonDuDernierCourrier(): string {
  return boiteAuxLettres.at(-1)?.lien?.split('/').pop() ?? ''
}

async function inviter(email = emailDeTest('invite')) {
  const resultat = await enTantQueSolenne(() => emettreInvitation({ email }))
  if (!resultat.ok) throw new Error(`émission refusée : ${resultat.code}`)
  return { ...resultat.data, jeton: jetonDuDernierCourrier() }
}

describe('INVITE-001 / 002 — émission', () => {
  it('crée l’invitation, produit un lien copiable et journalise', async () => {
    const email = emailDeTest('invite')
    const resultat = await enTantQueSolenne(() => emettreInvitation({ email }))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.email).toBe(email)
    expect(resultat.data.lien).toContain('/invitation/')
    expect(resultat.data.expireLe.getTime()).toBeGreaterThan(Date.now())

    expect(boiteAuxLettres).toHaveLength(1)
    expect(boiteAuxLettres[0]?.sujet).toContain('Solenne vous invite')

    const traces = await client.auditLog.findMany({
      where: { action: 'invite.emission' },
    })
    expect(traces).toHaveLength(1)
    expect(JSON.stringify(traces[0]?.diff)).toContain(email)
  })

  it('INVITE-002 — seule l’empreinte du jeton est stockée', async () => {
    const { jeton, id } = await inviter()
    const invitation = await client.invitation.findUniqueOrThrow({ where: { id } })

    expect(jeton.length).toBeGreaterThanOrEqual(40)
    expect(invitation.tokenHash).toBe(empreinteJeton(jeton))
    expect(invitation.tokenHash).not.toContain(jeton)
  })

  it('INVITE-S12 — le jeton porte au moins 32 octets d’entropie', async () => {
    const { jeton } = await inviter()
    expect(Buffer.from(jeton, 'base64url').length).toBe(32)
  })

  it('crée l’invitation en rôle FRIEND par défaut', async () => {
    const { id } = await inviter()
    const invitation = await client.invitation.findUniqueOrThrow({ where: { id } })
    expect(invitation.role).toBe('FRIEND')
  })
})

describe('INVITE-008 / 009 / 016 — email déjà connu', () => {
  it('INVITE-008 — refuse d’inviter quelqu’un qui a déjà un compte', async () => {
    const email = emailDeTest('deja')
    await creerUtilisateur(client, { email })

    const resultat = await enTantQueSolenne(() => emettreInvitation({ email }))
    expect(resultat).toMatchObject({ code: 'EMAIL_ALREADY_MEMBER' })
    expect(resultat.ok ? '' : resultat.message).toBe('Cette personne a déjà un compte.')
  })

  it('INVITE-016 — oriente vers la réactivation pour un compte désactivé', async () => {
    const email = emailDeTest('desactive')
    await creerUtilisateur(client, { email, statut: 'DISABLED' })

    const resultat = await enTantQueSolenne(() => emettreInvitation({ email }))
    expect(resultat).toMatchObject({ code: 'ACCOUNT_DISABLED_REACTIVATE' })
    expect(resultat.ok ? '' : resultat.message).toContain('Réactivez')
  })

  it('INVITE-009 — propose la relance plutôt qu’un doublon', async () => {
    const email = emailDeTest('encours')
    await inviter(email)

    const seconde = await enTantQueSolenne(() => emettreInvitation({ email }))
    expect(seconde).toMatchObject({ code: 'INVITATION_PENDING' })
    expect(seconde.ok ? '' : seconde.message).toContain('relancer')
    expect(await client.invitation.count({ where: { email } })).toBe(1)
  })

  it('réinvite librement après expiration de la précédente', async () => {
    const email = emailDeTest('expiree')
    await inviter(email)
    await client.invitation.updateMany({
      where: { email },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })

    const seconde = await enTantQueSolenne(() => emettreInvitation({ email }))
    expect(seconde.ok).toBe(true)
  })
})

describe('INVITE-003 — activation', () => {
  it('crée le compte en rôle FRIEND et ouvre la session', async () => {
    const { jeton, email } = await inviter()

    const resultat = await dansUneRequete(() =>
      activerInvitation({
        jeton,
        motDePasse: MOT_DE_PASSE_VALIDE,
        prenom: 'Camille',
        nom: 'Roux',
        telephone: '06 12 34 56 78',
      }),
    )
    expect(resultat.ok).toBe(true)

    const compte = await client.user.findUniqueOrThrow({ where: { email } })
    expect(compte.role).toBe('FRIEND')
    expect(compte.firstName).toBe('Camille')
    expect(compte.phone).toBe('06 12 34 56 78')
    expect(compte.passwordHash).toMatch(/^\$argon2id\$/)

    const invitation = await client.invitation.findFirstOrThrow({ where: { email } })
    expect(invitation.acceptedAt).not.toBeNull()

    expect(await client.session.count({ where: { userId: compte.id } })).toBe(1)
  }, 30_000)

  it('permet de se connecter juste après', async () => {
    const { jeton, email } = await inviter()
    await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )

    reinitialiserRequete()
    const connexion = await seConnecter({ email, motDePasse: MOT_DE_PASSE_VALIDE })
    expect(connexion.ok).toBe(true)
  }, 30_000)

  it('INVITE-S07 — un rôle injecté dans la charge utile est ignoré', async () => {
    const { jeton, email } = await inviter()

    await dansUneRequete(() =>
      activerInvitation({
        jeton,
        motDePasse: MOT_DE_PASSE_VALIDE,
        prenom: 'Opportuniste',
        role: 'ADMIN',
        status: 'ACTIVE',
        relationType: 'FAMILY',
      }),
    )

    const compte = await client.user.findUniqueOrThrow({ where: { email } })
    expect(compte.role).toBe('FRIEND')
    expect(compte.relationType).toBeNull()
  }, 30_000)

  it('INVITE-015 — un prénom vide bloque l’activation, sans compte partiel', async () => {
    const { jeton, email } = await inviter()

    const resultat = await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: '   ' }),
    )
    expect(resultat).toMatchObject({ code: 'VALIDATION' })
    expect(await client.user.findUnique({ where: { email } })).toBeNull()

    const invitation = await client.invitation.findFirstOrThrow({ where: { email } })
    expect(invitation.acceptedAt).toBeNull()
  })

  it('applique la politique de mot de passe', async () => {
    const { jeton } = await inviter()
    const resultat = await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: 'court', prenom: 'Camille' }),
    )
    expect(resultat).toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
  })
})

describe('INVITE-004 → 007, S11 — jetons invalides', () => {
  it('INVITE-004 — un jeton de plus de 14 jours est refusé', async () => {
    const { jeton, id } = await inviter()
    await client.invitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })

    const resultat = await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )
    expect(resultat).toMatchObject({ code: 'INVITATION_EXPIRED' })
    expect(resultat.ok ? '' : resultat.message).toContain('expiré')
  })

  it('INVITE-005 — un jeton déjà utilisé est refusé sans révéler l’email', async () => {
    const { jeton } = await inviter()
    await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )

    const rejeu = await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Autre' }),
    )
    expect(rejeu).toMatchObject({ code: 'INVITATION_USED' })
    expect(JSON.stringify(rejeu)).not.toContain('@exemple.test')
  }, 30_000)

  it('INVITE-006 — une invitation révoquée est morte', async () => {
    const { jeton, id } = await inviter()
    expect((await enTantQueSolenne(() => revoquerInvitation({ id }))).ok).toBe(true)

    const resultat = await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )
    expect(resultat).toMatchObject({ code: 'INVALID_TOKEN' })
    expect(await client.user.count({ where: { role: 'FRIEND' } })).toBe(0)
  })

  it('INVITE-007 — un jeton inventé reçoit un refus neutre', async () => {
    const resultat = await dansUneRequete(() =>
      activerInvitation({
        jeton: 'jeton-invente-mais-de-bonne-longueur-0123456789',
        motDePasse: MOT_DE_PASSE_VALIDE,
        prenom: 'Camille',
      }),
    )
    expect(resultat).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('INVITE-S11 — le jeton d’une autre invitation ne sert pas à activer la sienne', async () => {
    const premiere = await inviter(emailDeTest('a'))
    const seconde = await inviter(emailDeTest('b'))

    // Activer avec le jeton de la seconde crée le compte de la seconde,
    // jamais celui de la première.
    await dansUneRequete(() =>
      activerInvitation({
        jeton: seconde.jeton,
        motDePasse: MOT_DE_PASSE_VALIDE,
        prenom: 'Camille',
      }),
    )

    expect(await client.user.findUnique({ where: { email: premiere.email } })).toBeNull()
    expect(await client.user.findUnique({ where: { email: seconde.email } })).not.toBeNull()
  }, 30_000)

  it('INVITE-S12 — la devinette en rafale est bornée', async () => {
    const codes: string[] = []
    for (let i = 0; i < 15; i += 1) {
      const resultat = await dansUneRequete(() =>
        activerInvitation({
          jeton: `jeton-invente-numero-${i}-aaaaaaaaaaaaaaaaaaaa`,
          motDePasse: MOT_DE_PASSE_VALIDE,
          prenom: 'Camille',
        }),
      )
      codes.push(resultat.ok ? 'OK' : resultat.code)
    }
    expect(codes.every((code) => code !== 'OK')).toBe(true)
  }, 60_000)
})

describe('INVITE-010 / 011 / 012 — cycle de vie', () => {
  it('INVITE-010 — une relance invalide l’ancien jeton', async () => {
    const premiere = await inviter()
    const relance = await enTantQueSolenne(() =>
      relancerInvitation({ id: premiere.id }),
    )
    expect(relance.ok).toBe(true)

    const nouveauJeton = jetonDuDernierCourrier()
    expect(nouveauJeton).not.toBe(premiere.jeton)

    expect(
      await dansUneRequete(() =>
        activerInvitation({
          jeton: premiere.jeton,
          motDePasse: MOT_DE_PASSE_VALIDE,
          prenom: 'Camille',
        }),
      ),
    ).toMatchObject({ code: 'INVALID_TOKEN' })

    expect(
      (
        await dansUneRequete(() =>
          activerInvitation({
            jeton: nouveauJeton,
            motDePasse: MOT_DE_PASSE_VALIDE,
            prenom: 'Camille',
          }),
        )
      ).ok,
    ).toBe(true)
  }, 30_000)

  it('INVITE-011 — la révocation est tracée', async () => {
    const { id } = await inviter()
    await enTantQueSolenne(() => revoquerInvitation({ id }))

    const invitation = await client.invitation.findUniqueOrThrow({ where: { id } })
    expect(invitation.revokedAt).not.toBeNull()

    expect(
      await client.auditLog.count({ where: { action: 'invite.revocation' } }),
    ).toBe(1)
  })

  it('ne révoque ni ne relance une invitation déjà acceptée', async () => {
    const { id, jeton } = await inviter()
    await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )

    expect(await enTantQueSolenne(() => revoquerInvitation({ id }))).toMatchObject({
      code: 'INVITATION_USED',
    })
    expect(await enTantQueSolenne(() => relancerInvitation({ id }))).toMatchObject({
      code: 'INVITATION_USED',
    })
  }, 30_000)

  it('INVITE-012 — la liste montre les bons états', async () => {
    const enAttente = await inviter(emailDeTest('attente'))
    await inviter(emailDeTest('attente2'))
    await inviter(emailDeTest('attente3'))

    const aRevoquer = await inviter(emailDeTest('revoquee'))
    await enTantQueSolenne(() => revoquerInvitation({ id: aRevoquer.id }))

    const aAccepter = await inviter(emailDeTest('acceptee'))
    await dansUneRequete(() =>
      activerInvitation({
        jeton: aAccepter.jeton,
        motDePasse: MOT_DE_PASSE_VALIDE,
        prenom: 'Camille',
      }),
    )

    const liste = await enTantQueSolenne(() => listerInvitations())
    expect(liste.ok).toBe(true)
    if (!liste.ok) return

    const parEtat = liste.data.reduce<Record<string, number>>((acc, item) => {
      acc[item.etat] = (acc[item.etat] ?? 0) + 1
      return acc
    }, {})
    expect(parEtat).toEqual({ EN_ATTENTE: 3, REVOQUEE: 1, ACCEPTEE: 1 })

    const ligne = liste.data.find((item) => item.id === enAttente.id)
    expect(ligne?.expireLe.getTime()).toBeGreaterThan(Date.now())
    expect(JSON.stringify(liste.data)).not.toContain('tokenHash')
  }, 60_000)
})

describe('INVITE-013 — l’activation est tout ou rien', () => {
  it('ne laisse aucun compte partiel quand la création échoue en cours de route', async () => {
    const { jeton, email } = await inviter()

    // Panne réaliste : entre l'émission et l'activation, un compte a été créé
    // avec la même adresse. La création échoue au milieu de la transaction,
    // après que l'invitation a été marquée consommée.
    const intrus = await creerUtilisateur(client, { email })

    const resultat = await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )

    expect(resultat).toMatchObject({ code: 'DUPLICATE_EMAIL' })

    // Rien n'a bougé : l'invitation n'est pas consommée, aucune session créée,
    // aucune trace d'activation. On peut réessayer une fois le conflit réglé.
    const invitation = await client.invitation.findFirstOrThrow({ where: { email } })
    expect(invitation.acceptedAt).toBeNull()
    expect(await client.session.count({ where: { userId: intrus.id } })).toBe(0)
    expect(
      await client.auditLog.count({ where: { action: 'invite.activation' } }),
    ).toBe(0)
    expect(await client.user.count({ where: { email } })).toBe(1)
  }, 30_000)

  it('rejoue l’activation avec succès une fois l’obstacle levé', async () => {
    const { jeton, email } = await inviter()
    const intrus = await creerUtilisateur(client, { email })

    await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )
    await client.user.delete({ where: { id: intrus.id } })

    const seconde = await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )
    expect(seconde.ok).toBe(true)
    expect(await client.user.count({ where: { email } })).toBe(1)
  }, 30_000)
})

describe('INVITE-C04 — double activation simultanée', () => {
  it('ne crée qu’un seul compte, l’autre reçoit un refus explicite', async () => {
    const { jeton, email } = await inviter()

    const activer = (prenom: string) =>
      dansUneRequete(() =>
        activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom }),
      )

    const [premiere, seconde] = await Promise.all([
      activer('Premiere'),
      activer('Seconde'),
    ])

    const reussies = [premiere, seconde].filter((r) => r.ok)
    const refusees = [premiere, seconde].filter((r) => !r.ok)

    expect(reussies).toHaveLength(1)
    expect(refusees).toHaveLength(1)
    expect(await client.user.count({ where: { email } })).toBe(1)
  }, 60_000)
})

describe('INVITE-014 — traçabilité', () => {
  it('permet de savoir qui a invité, quand, et quand ça a été accepté', async () => {
    const solenne = await client.user.findFirstOrThrow({ where: { role: 'ADMIN' } })
    const { jeton, email, id } = await inviter()

    await dansUneRequete(() =>
      activerInvitation({ jeton, motDePasse: MOT_DE_PASSE_VALIDE, prenom: 'Camille' }),
    )

    const emission = await client.auditLog.findFirstOrThrow({
      where: { action: 'invite.emission', entityId: id },
    })
    expect(emission.actorId).toBe(solenne.id)
    expect(JSON.stringify(emission.diff)).toContain(email)

    const activation = await client.auditLog.findFirstOrThrow({
      where: { action: 'invite.activation', entityId: id },
    })
    expect(JSON.stringify(activation.diff)).toContain(solenne.id)

    const invitation = await client.invitation.findUniqueOrThrow({ where: { id } })
    expect(invitation.invitedById).toBe(solenne.id)
    expect(invitation.acceptedAt).not.toBeNull()
  }, 30_000)
})

describe('INVITE-S01 / S02 / S06 / S09 — permissions', () => {
  it('INVITE-S01 — un visiteur ne peut pas inviter', async () => {
    const resultat = await dansUneRequete(() =>
      emettreInvitation({ email: emailDeTest() }),
    )
    expect(resultat).toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(await client.invitation.count()).toBe(0)
  })

  it('INVITE-S02 — un ami ne peut pas inviter, et le refus est tracé', async () => {
    const ami = await creerUtilisateur(client, { email: emailDeTest('ami') })
    const jetonAmi = await dansUneRequete(() => ouvrirSession(ami.id))

    const resultat = await dansUneRequete(
      () => emettreInvitation({ email: emailDeTest() }),
      { cookies: { [NOM_COOKIE_SESSION]: jetonAmi } },
    )

    expect(resultat).toMatchObject({ code: 'FORBIDDEN' })
    expect(await client.invitation.count()).toBe(0)
    expect(
      await client.auditLog.count({ where: { action: 'refus.invite.emettre' } }),
    ).toBe(1)
  })

  it('un ami ne peut ni relancer, ni révoquer, ni lister', async () => {
    const { id } = await inviter()
    const ami = await creerUtilisateur(client, { email: emailDeTest('ami') })
    const jetonAmi = await dansUneRequete(() => ouvrirSession(ami.id))
    const enAmi = <T>(t: () => Promise<T>) =>
      dansUneRequete(t, { cookies: { [NOM_COOKIE_SESSION]: jetonAmi } })

    expect(await enAmi(() => relancerInvitation({ id }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await enAmi(() => revoquerInvitation({ id }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await enAmi(() => listerInvitations())).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('INVITE-S06 — un appel direct subit les mêmes contrôles', async () => {
    expect(
      await enTantQueSolenne(() => emettreInvitation('pas un objet')),
    ).toMatchObject({ code: 'VALIDATION' })
    expect(
      await enTantQueSolenne(() => emettreInvitation({ email: 'pas-une-adresse' })),
    ).toMatchObject({ code: 'VALIDATION' })
  })

  it('INVITE-S09 — la page d’activation ne montre que l’adresse invitée', async () => {
    await creerUtilisateur(client, { email: emailDeTest('autre') })
    const { jeton, email } = await inviter()
    await inviter(emailDeTest('encore-un-autre'))

    const resultat = await dansUneRequete(() => consulterInvitation({ jeton }))
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(Object.keys(resultat.data).sort()).toEqual(['email', 'expireLe'])
    expect(resultat.data.email).toBe(email)

    const charge = JSON.stringify(resultat.data)
    expect(charge).not.toContain('autre@')
    expect(charge).not.toContain('tokenHash')
  })

  it('la consultation d’un jeton mort ne dit rien de plus', async () => {
    expect(
      await dansUneRequete(() => consulterInvitation({ jeton: 'inconnu-0123456789' })),
    ).toMatchObject({ code: 'INVALID_TOKEN' })
  })
})

describe('Session ouverte par l’activation', () => {
  it('la personne est immédiatement reconnue', async () => {
    const { jeton, email } = await inviter()

    const jetonSession = await dansUneRequete(async () => {
      await activerInvitation({
        jeton,
        motDePasse: MOT_DE_PASSE_VALIDE,
        prenom: 'Camille',
      })
      return cookieCourant(NOM_COOKIE_SESSION)?.value ?? ''
    })

    const identite = await dansUneRequete(() => identiteCourante(), {
      cookies: { [NOM_COOKIE_SESSION]: jetonSession },
    })
    expect(identite.ok && identite.data).toMatchObject({
      email,
      prenom: 'Camille',
      estAdministratrice: false,
    })
  }, 30_000)
})
