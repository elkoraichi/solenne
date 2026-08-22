import { defineConfig, devices } from '@playwright/test'

import { chargerFichierEnv } from './src/env/fichier'

chargerFichierEnv()

const PORT = Number(process.env.PORT_E2E ?? 3210)
const ADRESSE = `http://127.0.0.1:${PORT}`

/**
 * Serveur de développement au lieu du build de production.
 *
 * Réservé à la mise au point d'un test isolé, où recompiler à chaque essai
 * coûterait plus cher que l'instabilité. Une campagne complète, elle, se joue
 * toujours sur le build — voir `webServer` plus bas.
 */
const EN_DEVELOPPEMENT = Boolean(process.env.E2E_DEV)

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

  // 30 s par défaut. La console de Solenne les dépasse de temps à autre quand
  // cinq navigateurs la demandent en même temps. Les assertions, elles, gardent
  // leurs propres délais — rien n'est masqué.
  timeout: 60_000,
  // Hors intégration continue : `dot`. La campagne nomme 454 tests, ce qui fait
  // 80 Ko de sortie dont seuls les échecs comptent — et cette sortie est lue par
  // un agent qui la paie au caractère (§2.2, mesure M4). Un échec reste détaillé
  // en entier ; c'est la litanie des succès qui disparaît.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'dot',

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

  /**
   * La campagne se joue sur le **build de production**, pas sur le serveur de
   * développement.
   *
   * En mode développement, Next compile chaque route au premier appel et
   * réécrit ses manifestes pendant qu'il sert les pages. Trois tailles d'écran
   * lancées en parallèle prennent ce chantier de plein fouet : sur trois
   * campagnes complètes, trois échecs, chaque fois sur un test différent et
   * chaque fois pour la même raison — une page rendue en erreur, ou une page
   * arrivée trop tard pour être cliquée. Aucun ne portait sur l'application.
   *
   * Le build supprime la cause : plus de compilation à la demande, plus de
   * manifeste réécrit sous le pied des tests. Il coûte une douzaine de
   * secondes et, accessoirement, éprouve enfin ce qui sera réellement mis en
   * ligne.
   */
  webServer: {
    command: EN_DEVELOPPEMENT
      ? `npx next dev --port ${PORT}`
      : `npm run build && npx next start --port ${PORT}`,
    url: ADRESSE,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // Le build passe en `NODE_ENV=production`, où le contrat des variables
      // d'environnement exige un émetteur d'emails (SETUP-004). La campagne
      // n'envoie aucun courrier : elle fournit donc une valeur de façade,
      // plutôt que d'affaiblir un garde-fou qui protège la mise en ligne.
      // Les parcours de sécurité provoquent des refus **attendus**, que le
      // serveur journalise consciencieusement. Repris par `stderr: 'pipe'`,
      // ils recouvraient la liste des tests. Seules les erreurs remontent
      // désormais — le journal reste entier en production.
      JOURNAL_NIVEAU_MIN: process.env.JOURNAL_NIVEAU_MIN || 'error',
      RESEND_API_KEY: process.env.RESEND_API_KEY || 'cle-de-facade-parcours',
      EMAIL_FROM:
        process.env.EMAIL_FROM || 'La Maison de Solenne <parcours@exemple.test>',
    },
  },
})
