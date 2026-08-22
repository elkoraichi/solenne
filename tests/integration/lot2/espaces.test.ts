import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import type { Resultat } from '@/domain/core/result'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  activerEspace,
  creerEspace,
  espacesDeLaMaison,
  modifierEspace,
  reordonnerEspaces,
  reordonnerPhotosEspace,
  retirerPhotoEspace,
  televerserPhotoEspace,
} from '@/server/actions/espaces'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import { creerAdministratrice, creerMaison, creerUtilisateur } from '../fabriques'

/** `SPACE` — chambres et bureaux (SPACE-001 → 011, R1 → R5). */

const client: PrismaClient = clientDeTest()

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

/** Une vraie image : un JPEG écrit à la main finit toujours par être invalide. */
async function imageJpeg(teinte: number): Promise<File> {
  const contenu = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: { r: teinte, g: 160, b: 140 },
    },
  })
    .jpeg()
    .toBuffer()
  return new File([new Uint8Array(contenu)], `espace-${teinte}.jpg`, {
    type: 'image/jpeg',
  })
}

async function decorSolenne(capacite = 10) {
  const solenne = await creerAdministratrice(client)
  await creerMaison(client, capacite)
  return { solenne, jeton: await sessionPour(solenne.id) }
}

async function ajouterChambre(
  jeton: string,
  nom: string,
  couchages = 2,
): Promise<string> {
  const resultat = await en(jeton, () =>
    creerEspace({ type: 'ROOM', nom, typeDeLit: '1 lit double', couchages }),
  )
  expect(resultat.ok).toBe(true)
  if (!resultat.ok) throw new Error('espace non créé')
  return resultat.data.id
}

describe('SPACE-001 — création d’une chambre', () => {
  it('crée la chambre, la montre aux amis et journalise', async () => {
    const { solenne, jeton } = await decorSolenne()

    const id = await ajouterChambre(jeton, 'Chambre bleue')

    const ami = await creerUtilisateur(client)
    const vueAmi = await en(await sessionPour(ami.id), () => espacesDeLaMaison())

    expect(vueAmi.ok).toBe(true)
    if (!vueAmi.ok) return
    expect(vueAmi.data).toHaveLength(1)
    expect(vueAmi.data[0]?.id).toBe(id)
    expect(vueAmi.data[0]?.type).toBe('ROOM')
    expect(vueAmi.data[0]?.typeDeLit).toBe('1 lit double')
    expect(vueAmi.data[0]?.couchages).toBe(2)

    const trace = await client.auditLog.findFirst({
      where: { action: 'espace.creation' },
    })
    expect(trace?.actorId).toBe(solenne.id)
  })

  it('refuse un espace sans nom', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      creerEspace({ type: 'ROOM', nom: '   ', couchages: 2 }),
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('VALIDATION')
    expect(await client.space.count()).toBe(0)
  })
})

describe('SPACE-002 — création d’un bureau', () => {
  it('crée le bureau sans couchage et conserve ses équipements', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      creerEspace({
        type: 'OFFICE',
        nom: 'Bureau 1',
        equipements: ['écran', 'Wi-Fi', 'imprimante'],
      }),
    )
    expect(resultat.ok).toBe(true)

    const vue = await en(jeton, () => espacesDeLaMaison())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data[0]?.type).toBe('OFFICE')
    expect(vue.data[0]?.couchages).toBe(0)
    expect(vue.data[0]?.equipements).toEqual(['écran', 'Wi-Fi', 'imprimante'])
  })

  it('SPACE-R2 — refuse un bureau avec couchage, même par appel forgé', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      creerEspace({ type: 'OFFICE', nom: 'Bureau détourné', couchages: 2 }),
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) {
      expect(resultat.code).toBe('VALIDATION')
      expect(resultat.champs?.couchages).toContain('bureau')
    }
    expect(await client.space.count()).toBe(0)
  })
})

describe('SPACE-005 / SPACE-006 / R3 — couchages et capacité', () => {
  it('SPACE-005 — accepte 8 couchages pour une capacité de 12, sans blocage', async () => {
    const { jeton } = await decorSolenne(12)

    for (const nom of ['Chambre A', 'Chambre B']) {
      await ajouterChambre(jeton, nom, 4)
    }

    const vue = await en(jeton, () => espacesDeLaMaison())
    expect(vue.ok && vue.data).toHaveLength(2)
    expect(
      vue.ok && vue.data.reduce((total, espace) => total + espace.couchages, 0),
    ).toBe(8)
  })

  it('SPACE-006 — accepte 14 couchages pour une capacité de 8, sans blocage', async () => {
    const { jeton } = await decorSolenne(8)

    await ajouterChambre(jeton, 'Grande chambre', 8)
    await ajouterChambre(jeton, 'Chambre d’appoint', 6)

    const vue = await en(jeton, () => espacesDeLaMaison())
    expect(
      vue.ok && vue.data.reduce((total, espace) => total + espace.couchages, 0),
    ).toBe(14)
    // La capacité de la maison n'a pas bougé d'un pouce.
    const maison = await client.house.findFirstOrThrow()
    expect(maison.capacityMax).toBe(8)
  })
})

describe('SPACE-007 — équipements', () => {
  it('restitue les six équipements dans l’ordre reçu', async () => {
    const { jeton } = await decorSolenne()
    const equipements = [
      'bureau',
      'écran',
      'Wi-Fi',
      'imprimante',
      'fauteuil',
      'lampe',
    ]

    const creation = await en(jeton, () =>
      creerEspace({ type: 'OFFICE', nom: 'Bureau de Solenne', equipements }),
    )
    expect(creation.ok).toBe(true)
    if (!creation.ok) return

    const vue = await en(jeton, () => espacesDeLaMaison())
    expect(vue.ok && vue.data[0]?.equipements).toEqual(equipements)

    // Une modification les remplace, toujours dans l'ordre reçu.
    const inverse = [...equipements].reverse()
    expect(
      (
        await en(jeton, () =>
          modifierEspace({
            id: creation.data.id,
            type: 'OFFICE',
            nom: 'Bureau de Solenne',
            equipements: inverse,
          }),
        )
      ).ok,
    ).toBe(true)

    const apres = await en(jeton, () => espacesDeLaMaison())
    expect(apres.ok && apres.data[0]?.equipements).toEqual(inverse)
  })
})

describe('SPACE-008 — photos d’un espace', () => {
  it('téléverse trois photos, les met en avant et les retire', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouterChambre(jeton, 'Chambre mansardée')

    const urls: string[] = []
    for (const teinte of [40, 90, 140]) {
      const envoi = await en(jeton, async () =>
        televerserPhotoEspace({ id }, await imageJpeg(teinte)),
      )
      expect(envoi.ok).toBe(true)
      if (envoi.ok) urls.push(envoi.data.url)
    }

    const vue = await en(jeton, () => espacesDeLaMaison())
    expect(vue.ok && vue.data[0]?.photos).toEqual(urls)

    // La troisième passe en tête : c'est elle qui illustrera la carte.
    const troisieme = urls[2] as string
    expect(
      (
        await en(jeton, () =>
          reordonnerPhotosEspace({
            id,
            urls: [troisieme, ...urls.filter((url) => url !== troisieme)],
          }),
        )
      ).ok,
    ).toBe(true)

    const reordonnee = await en(jeton, () => espacesDeLaMaison())
    expect(reordonnee.ok && reordonnee.data[0]?.photos[0]).toBe(troisieme)

    expect(
      (await en(jeton, () => retirerPhotoEspace({ id, url: troisieme }))).ok,
    ).toBe(true)

    const apres = await en(jeton, () => espacesDeLaMaison())
    expect(apres.ok && apres.data[0]?.photos).toHaveLength(2)
    expect(apres.ok && apres.data[0]?.photos).not.toContain(troisieme)
  })

  it('refuse un fichier qui n’est pas une image, sans rien ranger', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouterChambre(jeton, 'Chambre verte')

    const faux = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'x.jpg', {
      type: 'image/jpeg',
    })

    const resultat = await en(jeton, () => televerserPhotoEspace({ id }, faux))

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('FILE_NOT_IMAGE')
    const espace = await client.space.findUniqueOrThrow({ where: { id } })
    expect(espace.photos).toEqual([])
  })

  it('refuse une photo pour un espace qui n’existe pas', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, async () =>
      televerserPhotoEspace({ id: 'espace-fantome' }, await imageJpeg(70)),
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('NOT_FOUND')
  })
})

describe('SPACE-009 / R4 — désactivation', () => {
  it('masque l’espace aux amis mais le conserve en base', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouterChambre(jeton, 'Chambre d’hiver')

    expect((await en(jeton, () => activerEspace({ id, active: false }))).ok).toBe(
      true,
    )

    const ami = await creerUtilisateur(client)
    const vueAmi = await en(await sessionPour(ami.id), () => espacesDeLaMaison())
    expect(vueAmi.ok && vueAmi.data).toEqual([])

    // Solenne le voit encore, pour pouvoir le rouvrir.
    const vueSolenne = await en(jeton, () => espacesDeLaMaison())
    expect(vueSolenne.ok && vueSolenne.data).toHaveLength(1)
    expect(vueSolenne.ok && vueSolenne.data[0]?.active).toBe(false)

    expect(await client.space.count()).toBe(1)
  })
})

describe('SPACE-010 — ordre d’affichage', () => {
  it('conserve et restitue l’ordre choisi sur cinq espaces', async () => {
    const { jeton } = await decorSolenne()

    const ids: string[] = []
    for (let i = 1; i <= 5; i += 1) {
      ids.push(await ajouterChambre(jeton, `Chambre ${i}`))
    }

    const avant = await en(jeton, () => espacesDeLaMaison())
    expect(avant.ok && avant.data.map((espace) => espace.id)).toEqual(ids)

    const nouvelOrdre = [...ids].reverse()
    expect((await en(jeton, () => reordonnerEspaces({ ids: nouvelOrdre }))).ok).toBe(
      true,
    )

    const apres = await en(jeton, () => espacesDeLaMaison())
    expect(apres.ok && apres.data.map((espace) => espace.id)).toEqual(nouvelOrdre)
  })

  it('refuse un ordre qui ne correspond plus aux espaces connus', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouterChambre(jeton, 'Chambre unique')

    const resultat = await en(jeton, () =>
      reordonnerEspaces({ ids: [id, 'espace-fantome'] }),
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('CONFLICT')
  })
})

describe('SPACE-S02 — un ami ne touche pas aux espaces', () => {
  it('refuse les six écritures et n’écrit rien', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouterChambre(jeton, 'Chambre blanche')

    const ami = await creerUtilisateur(client)
    const jetonAmi = await sessionPour(ami.id)

    const appels: Array<() => Promise<Resultat<unknown>>> = [
      () => creerEspace({ type: 'ROOM', nom: 'Ma chambre', couchages: 2 }),
      () => modifierEspace({ id, type: 'ROOM', nom: 'Détournée', couchages: 4 }),
      () => activerEspace({ id, active: false }),
      () => reordonnerEspaces({ ids: [id] }),
      async () => televerserPhotoEspace({ id }, await imageJpeg(20)),
      () => retirerPhotoEspace({ id, url: '/media/quelconque.webp' }),
      () => reordonnerPhotosEspace({ id, urls: [] }),
    ]

    for (const appel of appels) {
      const resultat = await en(jetonAmi, appel)
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe('FORBIDDEN')
    }

    const espace = await client.space.findUniqueOrThrow({ where: { id } })
    expect(espace.name).toBe('Chambre blanche')
    expect(espace.active).toBe(true)
    expect(espace.photos).toEqual([])
    expect(await client.space.count()).toBe(1)
  })

  it('refuse la lecture des espaces sans session', async () => {
    await creerMaison(client)

    const resultat = await dansUneRequete(() => espacesDeLaMaison())

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('UNAUTHENTICATED')
  })
})
