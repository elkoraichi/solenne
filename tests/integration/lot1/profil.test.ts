import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import sharp from 'sharp'

import {
  confirmerChangementEmail,
  demanderChangementEmail,
  mettreAJourProfil,
  monProfil,
  televerserPhoto,
  voirProfil,
} from '@/server/actions/profil'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import {
  configurerEmetteur,
  type Courrier,
} from '@/server/notifications/courrier'
import { formatReconnu, TAILLE_MAX_OCTETS } from '@/domain/core/images'
import type { PrismaClient } from '@/generated/prisma/client'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerUtilisateur,
  emailDeTest,
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

afterEach(() => rendreEmetteur?.())

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

/**
 * Une vraie image, produite plutôt que recopiée : un PNG écrit à la main dans
 * le test finit toujours par être subtilement invalide.
 */
const PNG_VALIDE = await sharp({
  create: {
    width: 800,
    height: 600,
    channels: 3,
    background: { r: 200, g: 180, b: 150 },
  },
})
  .png()
  .toBuffer()

function fichier(nom: string, contenu: Buffer, type: string): File {
  return new File([new Uint8Array(contenu)], nom, { type })
}

describe('PROFILE-001 / 002 / 003 — modification', () => {
  it('enregistre les informations et journalise le changement', async () => {
    const utilisateur = await creerUtilisateur(client, { prenom: 'Camille' })
    const jeton = await sessionPour(utilisateur.id)

    const resultat = await en(jeton, () =>
      mettreAJourProfil({
        prenom: 'Camille',
        nom: 'Roux-Berthier',
        telephone: '06 12 34 56 78',
        nombreEnfants: 2,
      }),
    )
    expect(resultat.ok).toBe(true)

    const relu = await client.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
    })
    expect(relu.lastName).toBe('Roux-Berthier')
    expect(relu.phone).toBe('06 12 34 56 78')
    expect(relu.childrenCount).toBe(2)

    expect(
      await client.auditLog.count({ where: { action: 'profil.modification' } }),
    ).toBe(1)
  })

  it('PROFILE-002 — refuse un prénom vide, en nommant le champ', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    const resultat = await en(jeton, () => mettreAJourProfil({ prenom: '  ' }))
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(resultat.champs?.prenom).toBe('Le prénom est obligatoire.')
  })

  it('PROFILE-003 — refuse un téléphone qui n’en est pas un', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    const resultat = await en(jeton, () =>
      mettreAJourProfil({ prenom: 'Camille', telephone: 'abcdef' }),
    )
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.champs?.telephone).toContain('06 12 34 56 78')
  })

  it('accepte un nom à rallonge jusqu’à la limite, refuse au-delà', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    expect(
      (await en(jeton, () =>
        mettreAJourProfil({ prenom: 'Camille', nom: 'é'.repeat(120) }),
      )).ok,
    ).toBe(true)
    expect(
      await en(jeton, () =>
        mettreAJourProfil({ prenom: 'Camille', nom: 'é'.repeat(121) }),
      ),
    ).toMatchObject({ code: 'VALIDATION' })
  })

  it('vide proprement un champ facultatif', async () => {
    const utilisateur = await creerUtilisateur(client, { nom: 'Roux' })
    const jeton = await sessionPour(utilisateur.id)

    await en(jeton, () => mettreAJourProfil({ prenom: 'Camille', nom: '' }))
    const relu = await client.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
    })
    expect(relu.lastName).toBeNull()
  })

  it('exige une session', async () => {
    expect(await mettreAJourProfil({ prenom: 'Camille' })).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })
})

describe('PROFILE-S04 / S07 — ce qui n’est pas modifiable', () => {
  it('PROFILE-S04 — un identifiant injecté ne touche pas le profil d’autrui', async () => {
    const a = await creerUtilisateur(client, { prenom: 'Alice' })
    const b = await creerUtilisateur(client, { prenom: 'Bruno' })
    const jetonA = await sessionPour(a.id)

    await en(jetonA, () =>
      mettreAJourProfil({ id: b.id, userId: b.id, prenom: 'Piraté' }),
    )

    expect(
      (await client.user.findUniqueOrThrow({ where: { id: b.id } })).firstName,
    ).toBe('Bruno')
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: a.id } })).firstName,
    ).toBe('Piraté')
  })

  it('PROFILE-S07 — rôle, relation et statut injectés sont ignorés', async () => {
    const utilisateur = await creerUtilisateur(client, { prenom: 'Camille' })
    const jeton = await sessionPour(utilisateur.id)

    await en(jeton, () =>
      mettreAJourProfil({
        prenom: 'Camille',
        role: 'ADMIN',
        relationType: 'FAMILY',
        status: 'DISABLED',
        email: 'usurpation@exemple.test',
        passwordHash: 'nimporte quoi',
      }),
    )

    const relu = await client.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
    })
    expect(relu.role).toBe('FRIEND')
    expect(relu.relationType).toBeNull()
    expect(relu.status).toBe('ACTIVE')
    expect(relu.email).toBe(utilisateur.email)
  })
})

describe('PROFILE-004 / 005 — changement d’email', () => {
  it('PROFILE-004 — l’adresse ne change qu’après confirmation', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)
    const nouvelEmail = emailDeTest('nouvelle')

    const demande = await en(jeton, () =>
      demanderChangementEmail({ nouvelEmail }),
    )
    expect(demande.ok).toBe(true)

    // Rien n'a bougé pour l'instant.
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: utilisateur.id } }))
        .email,
    ).toBe(utilisateur.email)

    const profil = await en(jeton, () => monProfil())
    expect(profil.ok && profil.data.changementEmailEnAttente).toBe(nouvelEmail)

    const lienJeton = boiteAuxLettres.at(-1)?.lien?.split('/').pop() ?? ''
    expect((await confirmerChangementEmail({ jeton: lienJeton })).ok).toBe(true)

    expect(
      (await client.user.findUniqueOrThrow({ where: { id: utilisateur.id } }))
        .email,
    ).toBe(nouvelEmail)
  })

  it('envoie la confirmation à la nouvelle adresse, pas à l’ancienne', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)
    const nouvelEmail = emailDeTest('nouvelle')

    await en(jeton, () => demanderChangementEmail({ nouvelEmail }))
    expect(boiteAuxLettres.at(-1)?.destinataire).toBe(nouvelEmail)
  })

  it('PROFILE-005 — refuse une adresse déjà prise', async () => {
    const occupe = await creerUtilisateur(client)
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    const resultat = await en(jeton, () =>
      demanderChangementEmail({ nouvelEmail: occupe.email }),
    )
    expect(resultat).toMatchObject({ code: 'DUPLICATE_EMAIL' })
    expect(boiteAuxLettres).toHaveLength(0)
  })

  it('un jeton de confirmation ne sert qu’une fois', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)
    await en(jeton, () =>
      demanderChangementEmail({ nouvelEmail: emailDeTest('nouvelle') }),
    )
    const lienJeton = boiteAuxLettres.at(-1)?.lien?.split('/').pop() ?? ''

    expect((await confirmerChangementEmail({ jeton: lienJeton })).ok).toBe(true)
    expect(await confirmerChangementEmail({ jeton: lienJeton })).toMatchObject({
      code: 'INVALID_TOKEN',
    })
  })

  it('refuse un jeton expiré, avec une issue', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)
    await en(jeton, () =>
      demanderChangementEmail({ nouvelEmail: emailDeTest('nouvelle') }),
    )
    await client.emailChangeRequest.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })

    const lienJeton = boiteAuxLettres.at(-1)?.lien?.split('/').pop() ?? ''
    expect(await confirmerChangementEmail({ jeton: lienJeton })).toMatchObject({
      code: 'RESET_LINK_EXPIRED',
    })
  })

  it('ne fait rien quand l’adresse demandée est déjà la sienne', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    const resultat = await en(jeton, () =>
      demanderChangementEmail({ nouvelEmail: utilisateur.email.toUpperCase() }),
    )
    expect(resultat.ok).toBe(true)
    expect(boiteAuxLettres).toHaveLength(0)
    expect(await client.emailChangeRequest.count()).toBe(0)
  })
})

describe('PROFILE-006 / 007 / 008 — photo de profil', () => {
  it('PROFILE-008 — accepte une image valide, la redimensionne et la range', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    const resultat = await en(jeton, () =>
      televerserPhoto(fichier('photo.png', PNG_VALIDE, 'image/png')),
    )
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.avatarUrl).toMatch(/^\/media\/[\w-]+\.webp$/)

    const relu = await client.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
    })
    expect(relu.avatarUrl).toBe(resultat.data.avatarUrl)
  }, 30_000)

  it('PROFILE-006 — refuse une image de plus de 5 Mo', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    const enorme = Buffer.concat([
      PNG_VALIDE,
      Buffer.alloc(TAILLE_MAX_OCTETS + 1024),
    ])
    const resultat = await en(jeton, () =>
      televerserPhoto(fichier('enorme.png', enorme, 'image/png')),
    )

    expect(resultat).toMatchObject({ code: 'FILE_TOO_LARGE' })
    expect(resultat.ok ? '' : resultat.message).toBe('Cette image dépasse 5 Mo.')
    expect(
      (await client.user.findUniqueOrThrow({ where: { id: utilisateur.id } }))
        .avatarUrl,
    ).toBeNull()
  }, 30_000)

  it('PROFILE-007 — refuse un exécutable renommé en .jpg', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    // En-tête ELF, extension et type déclarés mensongers.
    const executable = Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]),
      Buffer.alloc(2048, 0x90),
    ])

    const resultat = await en(jeton, () =>
      televerserPhoto(fichier('photo.jpg', executable, 'image/jpeg')),
    )
    expect(resultat).toMatchObject({ code: 'FILE_NOT_IMAGE' })
  })

  it('refuse un fichier vide ou absent', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    expect(
      await en(jeton, () =>
        televerserPhoto(fichier('vide.png', Buffer.alloc(0), 'image/png')),
      ),
    ).toMatchObject({ code: 'FILE_NOT_IMAGE' })
    expect(await en(jeton, () => televerserPhoto('pas un fichier'))).toMatchObject(
      { code: 'FILE_NOT_IMAGE' },
    )
  })

  it('reconnaît les formats sur leur contenu, jamais sur leur nom', () => {
    expect(formatReconnu(new Uint8Array(PNG_VALIDE))).toBe('png')
    expect(
      formatReconnu(new Uint8Array(Buffer.from('GIF89a________', 'ascii'))),
    ).toBe('gif')
    expect(
      formatReconnu(new Uint8Array(Buffer.from('RIFF____WEBP____', 'ascii'))),
    ).toBe('webp')
    expect(formatReconnu(new Uint8Array(Buffer.alloc(20)))).toBeNull()
    expect(formatReconnu(new Uint8Array(4))).toBeNull()
  })

  it('exige une session', async () => {
    expect(
      await televerserPhoto(fichier('photo.png', PNG_VALIDE, 'image/png')),
    ).toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('PROFILE-009 / 010 — consultation', () => {
  it('PROFILE-009 — Solenne voit un profil complet', async () => {
    const solenne = await creerAdministratrice(client)
    const ami = await creerUtilisateur(client, { prenom: 'Marc' })
    await client.user.update({
      where: { id: ami.id },
      data: { phone: '06 00 00 00 00', notes: 'Allergique aux noix' },
    })
    const jeton = await sessionPour(solenne.id)

    const resultat = await en(jeton, () => voirProfil({ id: ami.id }))
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(resultat.data).toMatchObject({
      prenom: 'Marc',
      email: ami.email,
      telephone: '06 00 00 00 00',
      notes: 'Allergique aux noix',
    })
  })

  it('PROFILE-010 — un ami ne reçoit que le prénom et la photo', async () => {
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })
    await client.user.update({
      where: { id: marc.id },
      data: { phone: '06 00 00 00 00', notes: 'Note privée' },
    })
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const jeton = await sessionPour(lea.id)

    const resultat = await en(jeton, () => voirProfil({ id: marc.id }))
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    // Les champs privés ne sont pas masqués : ils ne sont pas lus (règle n°4).
    expect(Object.keys(resultat.data).sort()).toEqual([
      'avatarUrl',
      'id',
      'prenom',
    ])
    const charge = JSON.stringify(resultat.data)
    expect(charge).not.toContain('06 00 00 00 00')
    expect(charge).not.toContain('Note privée')
    expect(charge).not.toContain(marc.email)
  })

  it('chacun voit son propre profil en entier', async () => {
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })
    const jeton = await sessionPour(marc.id)

    const resultat = await en(jeton, () => voirProfil({ id: marc.id }))
    expect(resultat.ok && 'email' in resultat.data).toBe(true)
  })

  it('PERM-008 — un identifiant inventé donne le même refus qu’un profil interdit', async () => {
    const lea = await creerUtilisateur(client)
    const desactive = await creerUtilisateur(client, { statut: 'DISABLED' })
    const jeton = await sessionPour(lea.id)

    const inexistant = await en(jeton, () =>
      voirProfil({ id: 'identifiant-invente' }),
    )
    const interdit = await en(jeton, () => voirProfil({ id: desactive.id }))

    expect(inexistant).toEqual(interdit)
    expect(inexistant).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('exige une session', async () => {
    expect(await voirProfil({ id: 'peu importe' })).toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })
})

describe('Mon profil', () => {
  it('ne renvoie jamais l’empreinte du mot de passe', async () => {
    const utilisateur = await creerUtilisateur(client)
    const jeton = await sessionPour(utilisateur.id)

    const resultat = await en(jeton, () => monProfil())
    expect(JSON.stringify(resultat)).not.toContain('argon2')
    expect(JSON.stringify(resultat)).not.toContain('passwordHash')
  })
})
