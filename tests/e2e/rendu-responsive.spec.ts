import { expect, test } from '@playwright/test'

import {
  CIBLE_TACTILE_MIN,
  ciblesTropPetites,
  fichierSession,
  verifierAucunDebordement,
  verifierAucuneFuite,
  verifierTitresBornes,
} from './aide'

/**
 * UI-002 → UI-006, UI-009, UI-010 : rendu en 320 / 768 / 1440 px.
 *
 * La fiche de la maison et sa console de gestion ont rejoint la campagne au
 * lot 2. Manquent encore le tableau de bord réel (lot 7, `DASH`) et les écrans
 * de séjour et d'événement, qui remplaceront les pages « à venir » — chacun
 * rejoindra cette liste à sa livraison.
 */

/** Écrans publics : sous la coquille d'authentification, sans navigation basse. */
const ECRANS_PUBLICS = [
  { chemin: '/connexion', nom: 'connexion' },
  { chemin: '/invitation/jeton-qui-nexiste-pas', nom: 'invitation périmée' },
  { chemin: '/mot-de-passe/jeton-quelconque', nom: 'nouveau mot de passe' },
] as const

/** Écrans du cercle : coquille applicative, navigation basse comprise. */
const ECRANS_CERCLE = [
  { chemin: '/', nom: 'accueil' },
  { chemin: '/agenda', nom: 'agenda — vue Mois' },
  { chemin: '/agenda?vue=semaine', nom: 'agenda — vue Semaine' },
  { chemin: '/agenda?vue=liste', nom: 'agenda — vue Liste' },
  { chemin: '/sejours', nom: 'séjours' },
  { chemin: '/maison', nom: 'maison' },
  { chemin: '/profil', nom: 'profil' },
  { chemin: '/profil/email/jeton-quelconque', nom: 'confirmation d’adresse' },
  { chemin: '/gerer', nom: 'console de gestion' },
  { chemin: '/gerer/maison', nom: 'gestion de la maison' },
] as const

/** Solenne voit un onglet de plus que les amis : « Gérer » (UI §2). */
const ONGLETS_SOLENNE = 6

test.describe('Écrans publics', () => {
  for (const ecran of ECRANS_PUBLICS) {
    test.describe(`Écran ${ecran.nom}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(ecran.chemin)
        await page.waitForLoadState('networkidle')
      })

      test('UI-003/004/005 — aucun débordement horizontal', async ({ page }) => {
        await verifierAucunDebordement(page)
      })

      test('UI-002 — toutes les cibles tactiles font au moins 44 × 44 px', async ({
        page,
      }) => {
        expect(await ciblesTropPetites(page)).toEqual([])
      })

      test('UI-005 — la largeur de lecture reste bornée', async ({ page }) => {
        const boite = await page.locator('main').boundingBox()
        expect(boite).not.toBeNull()
        // `max-w-md` = 28 rem = 448 px, plus les marges latérales.
        expect(boite?.width ?? 0).toBeLessThanOrEqual(448 + 40 + 1)
      })

      test('UI-009 — un titre à rallonge ne déforme pas sa carte', async ({
        page,
      }) => {
        await verifierTitresBornes(page)
      })

      test('CORE-R1 — aucune trace technique à l’écran', async ({ page }) => {
        await verifierAucuneFuite(page)
      })
    })
  }
})

/**
 * La vitrine des composants n'est plus dans cette campagne.
 *
 * Elle `notFound()` en production (`src/app/vitrine/page.tsx`) : c'est un
 * support de mise au point, il n'a jamais eu vocation à être mis en ligne. Tant
 * que la campagne tournait sur le serveur de développement, cinq tests
 * l'interrogeaient — dont trois qui passaient à vide, faute de trouver quoi que
 * ce soit à mesurer sur une page absente.
 *
 * Ce qu'ils vérifiaient est repris là où il vit vraiment :
 * — UI-002, UI-003/004/005 et CORE-R1 sur les dix écrans réels, plus bas ;
 * — UI-010 et la pastille de « Gérer » au niveau du composant, dans
 *   `tests/unite/ui/composants.test.tsx` et `navigation.test.tsx`, où l'on peut
 *   casser une image pour de bon au lieu d'espérer qu'elle casse.
 *
 * La vitrine reste en place pour le jugement visuel de Yassine (limite L2).
 */

test.describe('Écrans du cercle', () => {
  test.use({ storageState: fichierSession('solenne') })

  for (const ecran of ECRANS_CERCLE) {
    test.describe(`Écran ${ecran.nom}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(ecran.chemin)
        await page.waitForLoadState('networkidle')
      })

      test('UI-003/004/005 — aucun débordement horizontal', async ({ page }) => {
        await verifierAucunDebordement(page)
      })

      test('UI-002 — toutes les cibles tactiles font au moins 44 × 44 px', async ({
        page,
      }) => {
        expect(await ciblesTropPetites(page)).toEqual([])
      })

      test('UI-002 — le lien d’évitement devient une vraie cible une fois au focus', async ({
        page,
      }) => {
        await page.keyboard.press('Tab')
        const lien = page.getByRole('link', { name: 'Aller au contenu' })
        await expect(lien).toBeFocused()

        const boite = await lien.boundingBox()
        expect(boite?.height ?? 0).toBeGreaterThanOrEqual(CIBLE_TACTILE_MIN)
      })

      test('UI-005 — la largeur de lecture reste bornée', async ({ page }) => {
        const boite = await page.locator('main#contenu').boundingBox()
        expect(boite).not.toBeNull()
        // `max-w-3xl` = 48 rem = 768 px, plus les marges latérales.
        expect(boite?.width ?? 0).toBeLessThanOrEqual(768 + 32 + 1)
      })

      test('UI-009 — un titre à rallonge ne déforme pas sa carte', async ({
        page,
      }) => {
        await verifierTitresBornes(page)
      })

      test('UI-006 — la tabulation commence par le lien d’évitement', async ({
        page,
      }) => {
        await page.keyboard.press('Tab')
        await expect(
          page.getByRole('link', { name: 'Aller au contenu' }),
        ).toBeFocused()
      })

      test('UI-006 — la navigation basse est faite de liens tabulables', async ({
        page,
      }) => {
        const onglets = page.getByRole('navigation', {
          name: 'Navigation principale',
        })
        await expect(onglets.getByRole('link')).toHaveCount(ONGLETS_SOLENNE)
      })

      test('la navigation basse reste posée en bas de l’écran', async ({
        page,
      }) => {
        const nav = page.getByRole('navigation', {
          name: 'Navigation principale',
        })
        await expect(nav).toBeVisible()

        const boite = await nav.boundingBox()
        const hauteur = page.viewportSize()?.height ?? 0
        expect((boite?.y ?? 0) + (boite?.height ?? 0)).toBeGreaterThanOrEqual(
          hauteur - 2,
        )
      })

      test('CORE-R1 — aucune trace technique à l’écran', async ({ page }) => {
        await verifierAucuneFuite(page)
      })
    })
  }
})

test.describe('SPACE-011 — les chambres et les bureaux', () => {
  test.use({ storageState: fichierSession('solenne') })

  test('les cartes des espaces tiennent dans la largeur', async ({ page }) => {
    await page.goto('/maison')
    await page.waitForLoadState('networkidle')

    const section = page.getByRole('region', { name: 'Chambres et bureaux' })
    await expect(section.getByRole('listitem').first()).toBeVisible()

    const largeurPage = page.viewportSize()?.width ?? 0
    for (const carte of await section.getByRole('listitem').all()) {
      const boite = await carte.boundingBox()
      expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(
        largeurPage + 1,
      )
    }
  })
})

test.describe('CORE-R1 — page inexistante', () => {
  test('répond en français, sans trace', async ({ page }) => {
    const reponse = await page.goto('/cette-page-nexiste-pas')
    expect(reponse?.status()).toBe(404)

    const texte = await page.locator('body').innerText()
    expect(texte).toContain('Rien par ici')
    expect(texte).not.toContain('Error:')
  })
})
