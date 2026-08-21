import { defineConfig, devices } from '@playwright/test'

process.loadEnvFile?.('.env')

const PORT = Number(process.env.PORT_E2E ?? 3210)
const ADRESSE = `http://127.0.0.1:${PORT}`

/**
 * Parcours et vérifications de rendu.
 *
 * Trois tailles imposées par le Mode Opératoire : 320 (petit mobile),
 * 768 (tablette) et 1440 px (bureau).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: ADRESSE,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
  },

  projects: [
    // Rejoue le jeu de démonstration et ouvre les sessions, une fois pour toutes.
    { name: 'preparation', testMatch: /preparation\.setup\.ts/ },
    {
      name: 'mobile-320',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } },
      dependencies: ['preparation'],
    },
    {
      name: 'tablette-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
      dependencies: ['preparation'],
    },
    {
      name: 'bureau-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      dependencies: ['preparation'],
    },
  ],

  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: ADRESSE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
