import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

const executer = promisify(execFile)

export function urlBaseDeTest(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('Variable manquante : TEST_DATABASE_URL')
  return url
}

/** Client Prisma branché sur une base donnée. À refermer par l'appelant. */
export function clientPour(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

export function clientDeTest(): PrismaClient {
  return clientPour(urlBaseDeTest())
}

/** Exécute une commande Prisma sur la base indiquée. */
export async function prismaCli(
  arguments_: readonly string[],
  url: string,
): Promise<{ stdout: string; stderr: string }> {
  return executer('npx', ['prisma', ...arguments_], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' },
    maxBuffer: 16 * 1024 * 1024,
  })
}

function urlAdministration(url: string): string {
  const analysee = new URL(url)
  analysee.pathname = '/postgres'
  return analysee.toString()
}

export function nomBase(url: string): string {
  return new URL(url).pathname.replace(/^\//, '')
}

export function urlPourBase(modele: string, nom: string): string {
  const analysee = new URL(modele)
  analysee.pathname = `/${nom}`
  return analysee.toString()
}

/** Crée une base vierge et renvoie son URL. Utile pour tester une migration. */
export async function creerBaseVierge(nom: string): Promise<string> {
  const modele = urlBaseDeTest()
  const admin = clientPour(urlAdministration(modele))
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`)
    await admin.$executeRawUnsafe(`CREATE DATABASE "${nom}"`)
  } finally {
    await admin.$disconnect()
  }
  return urlPourBase(modele, nom)
}

export async function supprimerBase(nom: string): Promise<void> {
  const admin = clientPour(urlAdministration(urlBaseDeTest()))
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`)
  } finally {
    await admin.$disconnect()
  }
}

/** Remet le schéma `public` d'une base à zéro, sans supprimer la base. */
export async function viderSchema(url: string): Promise<void> {
  const client = clientPour(url)
  try {
    await client.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE')
    await client.$executeRawUnsafe('CREATE SCHEMA public')
  } finally {
    await client.$disconnect()
  }
}

/** Les tables métier, dans l'ordre où on peut les vider sans heurter une clé. */
export const TABLES_METIER = [
  'rate_limit_hits',
  'email_change_requests',
  'audit_logs',
  'comments',
  'notification_deliveries',
  'notification_preferences',
  'notifications',
  'space_assignments',
  'stay_guests',
  'stays',
  'stay_requests',
  'event_item_claims',
  'event_items',
  'activity_participants',
  'event_activities',
  'event_participants',
  'events',
  'blocked_periods',
  'booking_settings',
  'house_rule_versions',
  'house_rules',
  'spaces',
  'houses',
  'password_reset_tokens',
  'invitations',
  'sessions',
  'accounts',
  'users',
] as const

export async function viderDonnees(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_pas_de_modification"',
  )
  try {
    for (const table of TABLES_METIER) {
      await client.$executeRawUnsafe(`DELETE FROM "${table}"`)
    }
  } finally {
    await client.$executeRawUnsafe(
      'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_pas_de_modification"',
    )
  }
}

export async function nomsDesTables(client: PrismaClient): Promise<string[]> {
  const lignes = await client.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  return lignes.map((ligne) => ligne.table_name)
}
