import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { chevauchent } from '@/domain/core/dates'
import type { PrismaClient } from '@/generated/prisma/client'
import { clientDeTest, urlBaseDeTest, viderDonnees } from '../aide-base'

const executer = promisify(execFile)

function lancerSeed(variables: Record<string, string> = {}) {
  return executer('npx', ['tsx', 'prisma/seed.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: urlBaseDeTest(),
      NODE_ENV: 'test',
      ...variables,
    },
    maxBuffer: 16 * 1024 * 1024,
  })
}

describe('SETUP-010 — le jeu de démonstration est interdit en production', () => {
  let client: PrismaClient

  beforeAll(async () => {
    client = clientDeTest()
    await viderDonnees(client)
  })

  afterAll(async () => {
    await client.$disconnect()
  })

  it('refuse immédiatement et n’écrit rien', async () => {
    const avant = await client.user.count()
    expect(avant).toBe(0)

    await expect(lancerSeed({ NODE_ENV: 'production' })).rejects.toMatchObject({
      code: 1,
    })

    let sortie = ''
    try {
      await lancerSeed({ NODE_ENV: 'production' })
    } catch (erreur) {
      sortie = String((erreur as { stderr?: string }).stderr ?? '')
    }
    expect(sortie).toContain('Refus')
    expect(sortie).toContain('production')

    expect(await client.user.count()).toBe(0)
    expect(await client.house.count()).toBe(0)
  }, 120_000)
})

describe('SETUP-009 — jeu de démonstration cohérent', () => {
  let client: PrismaClient

  beforeAll(async () => {
    client = clientDeTest()
    await viderDonnees(client)
    await lancerSeed()
  }, 180_000)

  afterAll(async () => {
    await viderDonnees(client)
    await client.$disconnect()
  })

  it('crée Solenne, seule administratrice (D5), et quatre amis', async () => {
    const administratrices = await client.user.findMany({
      where: { role: 'ADMIN' },
    })
    expect(administratrices).toHaveLength(1)
    expect(administratrices[0]?.firstName).toBe('Solenne')

    expect(await client.user.count({ where: { role: 'FRIEND' } })).toBe(4)
    expect(await client.user.count()).toBe(5)
  })

  it('n’utilise aucune adresse réelle', async () => {
    const comptes = await client.user.findMany({ select: { email: true } })
    for (const compte of comptes) {
      expect(compte.email).toMatch(/@exemple\.test$/)
    }
  })

  it('ne stocke jamais un mot de passe en clair', async () => {
    const comptes = await client.user.findMany({
      select: { passwordHash: true },
    })
    for (const compte of comptes) {
      expect(compte.passwordHash).toMatch(/^\$argon2id\$/)
    }
  })

  it('crée la maison avec la capacité provisoire de 10 (D1)', async () => {
    const maisons = await client.house.findMany()
    expect(maisons).toHaveLength(1)
    expect(maisons[0]?.capacityMax).toBe(10)
    expect(maisons[0]?.name).toBeTruthy()
  })

  it('dépose les photos réelles de la maison et en désigne une en accueil', async () => {
    const maison = await client.house.findFirstOrThrow()
    expect(maison.photos.length).toBeGreaterThanOrEqual(9)
    expect(maison.coverImage).toBe(maison.photos[0])
    for (const photo of maison.photos) {
      // Le format servi par `/media/[nom]` — rien d'autre n'est lisible.
      expect(photo).toMatch(/^\/media\/[\w-]+\.webp$/)
    }
  })

  it('crée les chambres et les bureaux du contenu provisoire', async () => {
    expect(await client.space.count({ where: { type: 'ROOM' } })).toBe(5)
    expect(await client.space.count({ where: { type: 'OFFICE' } })).toBe(2)
  })

  it('pose la photo de Solenne sur les six pièces qui en ont une', async () => {
    const espaces = await client.space.findMany({ orderBy: { order: 'asc' } })
    const illustres = espaces.filter((espace) => espace.photos.length > 0)

    expect(illustres).toHaveLength(6)
    for (const espace of illustres) {
      expect(espace.photos[0]).toMatch(/^\/media\/[\w-]+\.webp$/)
    }
    // Le canapé-lit du salon n'a pas de photo : l'absence ne casse rien.
    expect(
      espaces.find((espace) => espace.photos.length === 0)?.name,
    ).toBe('Canapé-lit du salon')
  })

  it('crée les règles de la maison, dont certaines à accepter', async () => {
    expect(await client.houseRule.count()).toBeGreaterThanOrEqual(1)
    expect(
      await client.houseRule.count({ where: { requiresAcceptance: true } }),
    ).toBeGreaterThanOrEqual(1)
  })

  it('crée les paramètres de réservation alignés sur la capacité', async () => {
    const parametres = await client.bookingSettings.findFirst()
    expect(parametres?.maxGuests).toBe(10)
    expect(parametres?.maxStayNights).toBeGreaterThan(0)
  })

  it('crée 2 événements, 3 séjours et 2 périodes bloquées', async () => {
    expect(await client.event.count()).toBe(2)
    expect(await client.stay.count()).toBe(3)
    expect(await client.blockedPeriod.count()).toBe(2)
  })

  it('ne viole aucune règle métier — R6 : deux événements ne se chevauchent pas', async () => {
    const evenements = await client.event.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: { startAt: 'asc' },
    })
    for (let i = 0; i < evenements.length - 1; i += 1) {
      const a = evenements[i]
      const b = evenements[i + 1]
      if (!a || !b) continue
      expect(chevauchent(a.startAt, a.endAt, b.startAt, b.endAt)).toBe(false)
    }
  })

  it('ne viole aucune règle métier — R1 : aucun séjour sur une période bloquée', async () => {
    const sejours = await client.stay.findMany({
      where: { status: 'CONFIRMED' },
    })
    const blocages = await client.blockedPeriod.findMany()

    for (const sejour of sejours) {
      for (const blocage of blocages) {
        expect(
          chevauchent(
            sejour.startDate,
            sejour.endDate,
            blocage.startDate,
            blocage.endDate,
          ),
          `séjour ${sejour.id} et blocage ${blocage.label}`,
        ).toBe(false)
      }
    }
  })

  it('ne viole aucune règle métier — R4 : la capacité n’est jamais dépassée', async () => {
    const maison = await client.house.findFirstOrThrow()
    const sejours = await client.stay.findMany({
      where: { status: 'CONFIRMED' },
    })

    // Occupation jour par jour, convention [arrivée, départ[.
    const parJour = new Map<string, number>()
    for (const sejour of sejours) {
      const fin = sejour.endDate.getTime()
      for (
        let t = sejour.startDate.getTime();
        t < fin;
        t += 86_400_000
      ) {
        const cle = new Date(t).toISOString().slice(0, 10)
        parJour.set(cle, (parJour.get(cle) ?? 0) + sejour.adults + sejour.children)
      }
    }

    for (const [cle, total] of parJour) {
      expect(total, `journée ${cle}`).toBeLessThanOrEqual(maison.capacityMax)
    }
  })

  it('ne viole aucune règle métier — R2/R3 : aucun conflit d’exclusivité', async () => {
    expect(
      await client.stay.count({ where: { exclusive: true } }),
    ).toBe(0)
  })

  it('laisse une demande en attente, pour que l’écran de décision ait de la matière', async () => {
    expect(
      await client.stayRequest.count({ where: { status: 'PENDING' } }),
    ).toBeGreaterThanOrEqual(1)
  })

  it('rattache le séjour de Solenne à aucune demande (isOwnerStay)', async () => {
    const sejourProprietaire = await client.stay.findFirst({
      where: { isOwnerStay: true },
    })
    expect(sejourProprietaire).not.toBeNull()
    expect(sejourProprietaire?.requestId).toBeNull()
  })

  it('est rejouable : une seconde exécution redonne exactement le même volume', async () => {
    const avant = {
      utilisateurs: await client.user.count(),
      espaces: await client.space.count(),
      evenements: await client.event.count(),
      sejours: await client.stay.count(),
    }

    await lancerSeed()

    expect({
      utilisateurs: await client.user.count(),
      espaces: await client.space.count(),
      evenements: await client.event.count(),
      sejours: await client.stay.count(),
    }).toEqual(avant)
  }, 180_000)
})
