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
 * Onze écrans sur douze existent à la fin du lot 1. Manquent le tableau de bord
 * réel (lot 7, `DASH`) et les écrans de séjour et d'événement, qui remplaceront
 * les pages « à venir » — chacun rejoindra cette campagne à sa livraison.
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
  { chemin: '/agenda', nom: 'agenda' },
  { chemin: '/sejours', nom: 'séjours' },
  { chemin: '/maison', nom: 'maison' },
  { chemin: '/profil', nom: 'profil' },
  { chemin: '/profil/email/jeton-quelconque', nom: 'confirmation d’adresse' },
  { chemin: '/gerer', nom: 'console de gestion' },
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

test.describe('Vitrine des composants', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/vitrine')
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

  test('UI-010 — une image cassée retombe sur les initiales', async ({
    page,
  }) => {
    // Le repli est décidé côté client, à l'échec du chargement de l'image.
    await expect(page.getByText('PC', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('img[src="/image-inexistante.jpg"]')).toHaveCount(
      0,
    )
  })

  test('la pastille des demandes à traiter est visible sur « Gérer »', async ({
    page,
  }) => {
    await expect(page.getByRole('link', { name: /Gérer/ })).toContainText('2')
  })

  test('CORE-R1 — aucune trace technique à l’écran', async ({ page }) => {
    await verifierAucuneFuite(page)
  })
})

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

test.describe('CORE-R1 — page inexistante', () => {
  test('répond en français, sans trace', async ({ page }) => {
    const reponse = await page.goto('/cette-page-nexiste-pas')
    expect(reponse?.status()).toBe(404)

    const texte = await page.locator('body').innerText()
    expect(texte).toContain('Rien par ici')
    expect(texte).not.toContain('Error:')
  })
})
