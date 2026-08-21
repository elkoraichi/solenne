import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const stubServerOnly = fileURLToPath(
  new URL('./tests/stub-server-only.ts', import.meta.url),
)

/**
 * Deux familles de tests :
 *   · `unite` — domaine, règles, composants. Rapides, sans base de données.
 *   · `integration` — socle, migrations, jeu de démonstration. Base réelle.
 *
 * La suite complète doit rester sous 5 minutes (§9 du Mode Opératoire).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': stubServerOnly,
    },
  },
  test: {
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unite',
          environment: 'jsdom',
          include: ['tests/unite/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/preparation-unite.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/preparation-integration.ts'],
          globalSetup: ['tests/integration/preparation-globale.ts'],
          // Une base partagée : les suites d'intégration ne tournent pas en parallèle.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
})
