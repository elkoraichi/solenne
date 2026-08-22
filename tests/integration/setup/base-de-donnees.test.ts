import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { PrismaClient } from '@/generated/prisma/client'
import {
  clientDeTest,
  clientPour,
  creerBaseVierge,
  nomsDesTables,
  prismaCli,
  supprimerBase,
} from '../aide-base'

const racine = process.cwd()

/**
 * Tables attendues.
 *
 * Écart assumé avec la fiche `SETUP-006`, qui annonce 18 tables : le §4 de
 * `02_Analyse_Architecture.md` en décrit en réalité 24. S'y ajoutent trois
 * tables exigées par le lot 1 — `password_reset_tokens` (`PWD`),
 * `email_change_requests` (`PROFILE`) et `rate_limit_hits` (`AUTH`), puis
 * `house_rule_versions` au lot 2 (`HOUSE-R6`).
 * Voir les rapports de fin de module `SETUP`, `AUTH` et `HOUSE`.
 */
const TABLES_ATTENDUES = [
  'accounts',
  'activity_participants',
  'audit_logs',
  'blocked_periods',
  'booking_settings',
  'comments',
  'email_change_requests',
  'event_activities',
  'event_item_claims',
  'event_items',
  'event_participants',
  'events',
  'house_rule_versions',
  'house_rules',
  'houses',
  'invitations',
  'notification_deliveries',
  'notification_preferences',
  'notifications',
  'password_reset_tokens',
  'rate_limit_hits',
  'sessions',
  'space_assignments',
  'spaces',
  'stay_guests',
  'stay_requests',
  'stays',
  'users',
] as const

interface Empreinte {
  colonnes: string[]
  contraintes: string[]
  index: string[]
}

async function empreinteDuSchema(client: PrismaClient): Promise<Empreinte> {
  const colonnes = await client.$queryRaw<
    { ligne: string }[]
  >`SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS ligne
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    ORDER BY 1`

  const contraintes = await client.$queryRaw<
    { ligne: string }[]
  >`SELECT c.conname || ' => ' || pg_get_constraintdef(c.oid) AS ligne
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
    ORDER BY 1`

  const index = await client.$queryRaw<
    { ligne: string }[]
  >`SELECT indexname || ' => ' || indexdef AS ligne
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY 1`

  return {
    colonnes: colonnes.map((l) => l.ligne),
    contraintes: contraintes.map((l) => l.ligne),
    index: index.map((l) => l.ligne),
  }
}

describe('SETUP-005 — connexion à la base', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = clientDeTest()
  })

  afterAll(async () => {
    await client.$disconnect()
  })

  it('répond à une requête de vérification en moins d’une seconde', async () => {
    // Première requête hors mesure : elle paie l'ouverture de la connexion.
    await client.$queryRaw`SELECT 1`

    const debut = Date.now()
    const reponse = await client.$queryRaw<{ un: number }[]>`SELECT 1 AS un`
    const duree = Date.now() - debut

    expect(reponse[0]?.un).toBe(1)
    expect(duree).toBeLessThan(1_000)
  })
})

describe('SETUP-006 / 007 / 008 — migrations', () => {
  const nom = 'solenne_migrations_test'
  let url: string
  let client: PrismaClient

  beforeAll(async () => {
    url = await creerBaseVierge(nom)
    client = clientPour(url)
  }, 120_000)

  afterAll(async () => {
    await client.$disconnect()
    await supprimerBase(nom)
  })

  it('SETUP-006 — crée toutes les tables sur une base vierge', async () => {
    expect(await nomsDesTables(client)).toEqual([])

    await prismaCli(['migrate', 'deploy'], url)

    const tables = await nomsDesTables(client)
    expect(tables).toContain('_prisma_migrations')
    expect(tables.filter((t) => t !== '_prisma_migrations')).toEqual([
      ...TABLES_ATTENDUES,
    ])
  })

  it('SETUP-006 — installe les contraintes structurelles', async () => {
    const contraintes = await client.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'x' ORDER BY conname
    `
    expect(contraintes.map((c) => c.conname)).toEqual([
      'events_sans_chevauchement',
      'stays_sans_chevauchement_exclusif',
    ])

    const verifications = await client.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname LIKE '%coherentes%'
    `
    expect(verifications.length).toBeGreaterThanOrEqual(4)
  })

  it('SETUP-006 — installe les index attendus', async () => {
    const index = await client.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `
    const noms = index.map((i) => i.indexname)
    expect(noms).toContain('users_email_key')
    expect(noms).toContain('stays_house_id_start_date_end_date_idx')
    expect(noms).toContain('event_participants_event_id_user_id_key')
  })

  it('SETUP-006 — protège le journal d’audit en écriture seule', async () => {
    const declencheurs = await client.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname
    `
    expect(declencheurs.map((d) => d.tgname)).toEqual([
      'audit_logs_pas_de_modification',
      'audit_logs_pas_de_troncature',
    ])
  })

  it('SETUP-008 — rejouer les migrations ne fait rien et n’échoue pas', async () => {
    const avant = await empreinteDuSchema(client)
    const { stdout } = await prismaCli(['migrate', 'deploy'], url)

    expect(stdout).toMatch(/No pending migrations|Aucune migration/i)
    expect(await empreinteDuSchema(client)).toEqual(avant)
  })

  it('SETUP-007 — un aller-retour de migration laisse un état identique', async () => {
    const avant = await empreinteDuSchema(client)

    const migrations = [
      '20260821200000_lot2_versions_regles',
      '20260821170000_audit_anonymisation',
      '20260821164314_lot1_identite',
      '20260821160500_garanties_base',
      '20260821160337_init_schema',
    ]

    // Retour arrière complet, dans l'ordre inverse d'application.
    for (const migration of migrations) {
      const sql = readFileSync(
        join(racine, 'prisma/migrations', migration, 'down.sql'),
        'utf8',
      )
      await client.$executeRawUnsafe(sql)
      await client.$executeRawUnsafe(
        `DELETE FROM "_prisma_migrations" WHERE migration_name = '${migration}'`,
      )
    }

    // La base est bien revenue à l'état vide.
    expect(await nomsDesTables(client)).toEqual(['_prisma_migrations'])

    // Réapplication.
    await prismaCli(['migrate', 'deploy'], url)

    expect(await empreinteDuSchema(client)).toEqual(avant)
  }, 120_000)
})

describe('Garanties de la base', () => {
  let client: PrismaClient

  beforeAll(async () => {
    client = clientDeTest()
    // Le déclencheur est « pour chaque ligne » : sans ligne, il ne se déclenche
    // pas. On en écrit une pour que la garantie soit réellement éprouvée.
    await client.auditLog.create({
      data: { action: 'test.ecriture-seule', entityType: 'TEST' },
    })
  })

  afterAll(async () => {
    await client.$executeRawUnsafe(
      'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_pas_de_modification"',
    )
    await client.$executeRawUnsafe(
      `DELETE FROM "audit_logs" WHERE action = 'test.ecriture-seule'`,
    )
    await client.$executeRawUnsafe(
      'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_pas_de_modification"',
    )
    await client.$disconnect()
  })

  it('refuse une modification du journal d’audit', async () => {
    await expect(
      client.$executeRawUnsafe(`UPDATE "audit_logs" SET action = 'triché'`),
    ).rejects.toThrow(/écriture seule/)
  })

  it('refuse une suppression dans le journal d’audit', async () => {
    await expect(
      client.$executeRawUnsafe(`DELETE FROM "audit_logs"`),
    ).rejects.toThrow(/écriture seule/)
  })

  it('tolère la seule mutation prévue : détacher l’acteur (effacement RGPD)', async () => {
    const acteur = await client.user.create({
      data: { email: 'acteur-rgpd@exemple.test', firstName: 'Test' },
    })
    const entree = await client.auditLog.create({
      data: {
        actorId: acteur.id,
        action: 'test.anonymisation',
        entityType: 'TEST',
      },
    })

    // La suppression du compte détache l'acteur — et rien d'autre.
    await client.user.delete({ where: { id: acteur.id } })

    const relue = await client.auditLog.findUniqueOrThrow({
      where: { id: entree.id },
    })
    expect(relue.actorId).toBeNull()
    expect(relue.action).toBe('test.anonymisation')
    expect(relue.createdAt.getTime()).toBe(entree.createdAt.getTime())

    await client.$executeRawUnsafe(
      'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_pas_de_modification"',
    )
    await client.$executeRawUnsafe(
      `DELETE FROM "audit_logs" WHERE action = 'test.anonymisation'`,
    )
    await client.$executeRawUnsafe(
      'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_pas_de_modification"',
    )
  })

  it('refuse de réattribuer une entrée à un autre acteur', async () => {
    await expect(
      client.$executeRawUnsafe(
        `UPDATE "audit_logs" SET actor_id = 'quelquun-dautre'`,
      ),
    ).rejects.toThrow(/écriture seule/)
  })

  it('refuse une troncature du journal d’audit', async () => {
    await expect(
      client.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs"`),
    ).rejects.toThrow(/écriture seule/)
  })

  it('refuse deux séjours exclusifs qui se chevauchent (filet C1)', async () => {
    const maison = await client.house.create({
      data: { name: 'Maison d’essai', capacityMax: 10 },
    })
    const habitant = await client.user.create({
      data: { email: 'exclusif@exemple.test', firstName: 'Test' },
    })

    const commun = {
      houseId: maison.id,
      userId: habitant.id,
      exclusive: true,
      status: 'CONFIRMED' as const,
      adults: 1,
    }

    await client.stay.create({
      data: {
        ...commun,
        startDate: new Date('2027-06-10T00:00:00.000Z'),
        endDate: new Date('2027-06-15T00:00:00.000Z'),
      },
    })

    await expect(
      client.stay.create({
        data: {
          ...commun,
          startDate: new Date('2027-06-14T00:00:00.000Z'),
          endDate: new Date('2027-06-20T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow(/stays_sans_chevauchement_exclusif/)

    // Convention [arrivée, départ[ : accoler les deux séjours reste possible.
    await expect(
      client.stay.create({
        data: {
          ...commun,
          startDate: new Date('2027-06-15T00:00:00.000Z'),
          endDate: new Date('2027-06-20T00:00:00.000Z'),
        },
      }),
    ).resolves.toBeDefined()

    await client.stay.deleteMany({ where: { houseId: maison.id } })
    await client.house.delete({ where: { id: maison.id } })
    await client.user.delete({ where: { id: habitant.id } })
  })

  it('refuse deux événements qui se chevauchent (D8)', async () => {
    const maison = await client.house.create({
      data: { name: 'Maison d’essai — événements', capacityMax: 10 },
    })
    const hote = await client.user.create({
      data: { email: 'evenements@exemple.test', firstName: 'Test', role: 'ADMIN' },
    })

    const commun = {
      houseId: maison.id,
      createdById: hote.id,
      status: 'PUBLISHED' as const,
    }

    await client.event.create({
      data: {
        ...commun,
        title: 'Premier',
        startAt: new Date('2027-07-10T16:00:00.000Z'),
        endAt: new Date('2027-07-12T12:00:00.000Z'),
      },
    })

    await expect(
      client.event.create({
        data: {
          ...commun,
          title: 'Second',
          startAt: new Date('2027-07-11T16:00:00.000Z'),
          endAt: new Date('2027-07-13T12:00:00.000Z'),
        },
      }),
    ).rejects.toThrow(/events_sans_chevauchement/)

    await client.event.deleteMany({ where: { houseId: maison.id } })
    await client.house.delete({ where: { id: maison.id } })
    await client.user.delete({ where: { id: hote.id } })
  })

  it('refuse un séjour dont le départ précède l’arrivée', async () => {
    const maison = await client.house.create({
      data: { name: 'Maison d’essai — dates', capacityMax: 10 },
    })
    const habitant = await client.user.create({
      data: { email: 'dates@exemple.test', firstName: 'Test' },
    })

    await expect(
      client.stay.create({
        data: {
          houseId: maison.id,
          userId: habitant.id,
          adults: 1,
          startDate: new Date('2027-08-10T00:00:00.000Z'),
          endDate: new Date('2027-08-10T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow(/stays_dates_coherentes/)

    await client.house.delete({ where: { id: maison.id } })
    await client.user.delete({ where: { id: habitant.id } })
  })

  it('borne la capacité de la maison entre 1 et 25 (D1)', async () => {
    await expect(
      client.house.create({ data: { name: 'Trop grande', capacityMax: 26 } }),
    ).rejects.toThrow(/houses_capacite_bornee/)
    await expect(
      client.house.create({ data: { name: 'Trop petite', capacityMax: 0 } }),
    ).rejects.toThrow(/houses_capacite_bornee/)
  })
})
