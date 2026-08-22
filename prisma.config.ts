import { defineConfig, env } from 'prisma/config'

import { chargerFichierEnv } from './src/env/fichier'

// Prisma 7 ne charge plus `.env` automatiquement : on le fait explicitement,
// avant toute lecture de `DATABASE_URL`.
chargerFichierEnv()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
