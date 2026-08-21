import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'

import { env } from '@/env'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Client Prisma unique.
 *
 * En développement, Next recharge les modules à chaud : sans ce cache global,
 * chaque rechargement ouvrirait un nouveau pool de connexions.
 */

const cache = globalThis as unknown as { prismaClient?: PrismaClient }

function creerClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === 'development'
        ? [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
        : [{ emit: 'stdout', level: 'error' }],
  })
}

export const db: PrismaClient = cache.prismaClient ?? creerClient()

if (env.NODE_ENV !== 'production') cache.prismaClient = db
