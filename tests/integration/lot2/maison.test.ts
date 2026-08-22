import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import sharp from 'sharp'

import type { Resultat } from '@/domain/core/result'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  definirCouverture,
  maison,
  mettreAJourMaison,
  reordonnerGalerie,
  retirerPhotoMaison,
  televerserPhotoMaison,
} from '@/server/actions/maison'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import { creerAdministratrice, creerMaison, creerUtilisateur } from '../fabriques'

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
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: teinte, g: 180, b: 150 },
    },
  })
    .jpeg()
    .toBuffer()
  return new File([new Uint8Array(contenu)], `photo-${teinte}.jpg`, {
    type: 'image/jpeg',
  })
}

describe('HOUSE-001 — informations générales', () => {
  it('enregistre nom, description et adresse, et journalise le changement', async () => {
    const solenne = await creerAdministratrice(client)
    await creerMaison(client)
    const jeton = await sessionPour(solenne.id)

    const resultat = await en(jeton, () =>
      mettreAJourMaison({
        nom: 'La maison du tilleul',
        description: 'Une longère en pierre, un grand jardin, une table dehors.',
        adresse: '3 chemin des Vignes, 24000 Périgueux',
      }),
    )
    expect(resultat.ok).toBe(true)

    const enregistree = await client.house.findFirstOrThrow()
    expect(enregistree.name).toBe('La maison du tilleul')
    expect(enregistree.address).toBe('3 chemin des Vignes, 24000 Périgueux')

    const trace = await client.auditLog.findFirst({
      where: { action: 'maison.modification' },
    })
    expect(trace).not.toBeNull()
    expect(trace?.actorId).toBe(solenne.id)
  })

  it('refuse un nom vide, en désignant le champ fautif', async () => {
    const solenne = await creerAdministratrice(client)
    await creerMaison(client)
    const jeton = await sessionPour(solenne.id)

    const resultat = await en(jeton, () => mettreAJourMaison({ nom: '   ' }))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(resultat.champs?.nom).toBeTruthy()
  })

  it('laisse un ami consulter la maison', async () => {
    await creerMaison(client)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const resultat = await en(jeton, () => maison())

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.nom).toBe('La maison de Solenne')
    expect(resultat.data.capaciteMax).toBe(10)
  })

  it('refuse la consultation sans session', async () => {
    await creerMaison(client)

    const resultat = await dansUneRequete(() => maison())

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('UNAUTHENTICATED')
  })
})

describe('HOUSE-011 — photos', () => {
  it('téléverse, conserve l’ordre, désigne la couverture et retire', async () => {
    const solenne = await creerAdministratrice(client)
    await creerMaison(client)
    const jeton = await sessionPour(solenne.id)

    const urls: string[] = []
    for (const teinte of [10, 60, 110, 160, 210]) {
      const envoi = await en(jeton, async () =>
        televerserPhotoMaison(await imageJpeg(teinte)),
      )
      expect(envoi.ok).toBe(true)
      if (envoi.ok) urls.push(envoi.data.url)
    }

    const vue = await en(jeton, () => maison())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data.photos).toEqual(urls)
    // Sans désignation, la première photo fait la couverture.
    expect(vue.data.couverture).toBe(urls[0])

    const troisieme = urls[2] as string
    expect((await en(jeton, () => definirCouverture({ url: troisieme }))).ok).toBe(
      true,
    )
    const apresCouverture = await en(jeton, () => maison())
    expect(apresCouverture.ok && apresCouverture.data.couverture).toBe(troisieme)

    const inverse = [...urls].reverse()
    expect((await en(jeton, () => reordonnerGalerie({ urls: inverse }))).ok).toBe(
      true,
    )
    const apresOrdre = await en(jeton, () => maison())
    expect(apresOrdre.ok && apresOrdre.data.photos).toEqual(inverse)

    expect((await en(jeton, () => retirerPhotoMaison({ url: troisieme }))).ok).toBe(
      true,
    )
    const apresRetrait = await en(jeton, () => maison())
    expect(apresRetrait.ok).toBe(true)
    if (!apresRetrait.ok) return
    expect(apresRetrait.data.photos).not.toContain(troisieme)
    expect(apresRetrait.data.photos).toHaveLength(4)
    // La couverture retirée ne laisse pas la page sans image.
    expect(apresRetrait.data.couverture).toBe(inverse[0])
  })

  it('refuse un fichier qui n’est pas une image', async () => {
    const solenne = await creerAdministratrice(client)
    await creerMaison(client)
    const jeton = await sessionPour(solenne.id)

    const faux = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    const resultat = await en(jeton, () => televerserPhotoMaison(faux))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('FILE_NOT_IMAGE')
  })

  it('refuse un ordre qui ne correspond plus à la galerie', async () => {
    const solenne = await creerAdministratrice(client)
    await creerMaison(client)
    const jeton = await sessionPour(solenne.id)

    const envoi = await en(jeton, async () => televerserPhotoMaison(await imageJpeg(30)))
    expect(envoi.ok).toBe(true)

    const resultat = await en(jeton, () =>
      reordonnerGalerie({ urls: ['/media/inconnue.webp'] }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('CONFLICT')
  })
})

describe('HOUSE-012 — maison sans photo', () => {
  it('renvoie une galerie vide et aucune couverture', async () => {
    await creerMaison(client)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const resultat = await en(jeton, () => maison())

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.photos).toEqual([])
    expect(resultat.data.couverture).toBeNull()
  })
})

describe('HOUSE-S02 — un ami ne modifie pas la maison', () => {
  it('refuse les quatre actions d’administration et ne change rien', async () => {
    const maisonInitiale = await creerMaison(client)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const appels: Array<() => Promise<Resultat<unknown>>> = [
      () => mettreAJourMaison({ nom: 'La maison de Marc' }),
      async () => televerserPhotoMaison(await imageJpeg(90)),
      () => definirCouverture({ url: '/media/quelconque.webp' }),
      () => reordonnerGalerie({ urls: [] }),
    ]

    for (const appel of appels) {
      const resultat = await en(jeton, appel)
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe('FORBIDDEN')
    }

    const inchangee = await client.house.findUniqueOrThrow({
      where: { id: maisonInitiale.id },
    })
    expect(inchangee.name).toBe(maisonInitiale.name)
    expect(inchangee.photos).toEqual([])
    expect(inchangee.coverImage).toBeNull()

    const refus = await client.auditLog.findMany({
      where: { action: { startsWith: 'refus.maison.' } },
    })
    expect(refus.length).toBeGreaterThanOrEqual(1)
    expect(refus.every((trace) => trace.actorId === ami.id)).toBe(true)
  })

  it('S7 — une adresse de photo forgée ne sort pas du dossier des images', async () => {
    const solenne = await creerAdministratrice(client)
    await creerMaison(client)
    const jeton = await sessionPour(solenne.id)

    const envoi = await en(jeton, async () => televerserPhotoMaison(await imageJpeg(45)))
    expect(envoi.ok).toBe(true)

    for (const url of [
      '/media/../../.env',
      '../../prisma/seed.ts',
      '/media/demo-accueil.webp',
    ]) {
      const retrait = await en(jeton, () => retirerPhotoMaison({ url }))
      expect(retrait.ok, url).toBe(false)
      if (!retrait.ok) expect(retrait.code, url).toBe('NOT_FOUND')

      const couverture = await en(jeton, () => definirCouverture({ url }))
      expect(couverture.ok, url).toBe(false)
    }

    // La galerie légitime n'a pas bougé.
    const vue = await en(jeton, () => maison())
    expect(vue.ok && vue.data.photos).toHaveLength(1)
  })

  it('ignore un identifiant de maison envoyé par le client', async () => {
    const solenne = await creerAdministratrice(client)
    const laMaison = await creerMaison(client)
    const jeton = await sessionPour(solenne.id)

    // L'identifiant n'existe pas dans le schéma d'entrée : il ne peut pas
    // désigner une autre maison, il est simplement ignoré.
    const resultat = await en(jeton, () =>
      mettreAJourMaison({ id: 'une-autre-maison', nom: 'Renommée' }),
    )

    expect(resultat.ok).toBe(true)
    const enregistree = await client.house.findUniqueOrThrow({
      where: { id: laMaison.id },
    })
    expect(enregistree.name).toBe('Renommée')
  })
})
