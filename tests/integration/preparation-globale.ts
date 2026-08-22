import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { chargerFichierEnv } from '../../src/env/fichier'

const executer = promisify(execFile)

/**
 * Préparation unique de la base de test : schéma remis à zéro puis migré.
 * Chaque suite repart ensuite d'un jeu de données vide.
 */
export async function setup(): Promise<void> {
  chargerFichierEnv()

  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('Variable manquante : TEST_DATABASE_URL')
  }

  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { PrismaClient } = await import('../../src/generated/prisma/client')

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  })
  try {
    await client.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE')
    await client.$executeRawUnsafe('CREATE SCHEMA public')
  } finally {
    await client.$disconnect()
  }

  await executer('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' },
    maxBuffer: 16 * 1024 * 1024,
  })
}
