import { defineConfig } from 'prisma/config'

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
    // `env()` de `prisma/config` LÈVE si la variable est absente — inutilisable
    // pour un repli. `process.env.DATABASE_URL` rend `undefined` sans bruit.
    // Netlify DB (Neon en coulisses) injecte sa chaîne sous NETLIFY_DB_URL,
    // jamais DATABASE_URL — même repli que src/env/schema.ts::resoudreSourceEnv.
    url:
      process.env.DATABASE_URL ??
      process.env.NETLIFY_DB_URL ??
      process.env.NETLIFY_DATABASE_URL,
  },
})
