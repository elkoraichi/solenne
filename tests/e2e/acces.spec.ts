import { expect, test } from '@playwright/test'

import { fichierSession, verifierAucuneFuite } from './aide'

/**
 * AUTH-S01 · PERM-S01 · PERM-S05 · PERM-S08 — vus depuis le navigateur.
 *
 * Les gardes des Server Actions sont éprouvées côté serveur (tests
 * d'intégration du lot 1). Ce qui se joue ici est l'autre moitié : ce qu'obtient
 * quelqu'un qui **tape l'adresse à la main**.
 */

const ECRANS_PRIVES = [
  '/',
  '/agenda',
  '/sejours',
  '/maison',
  '/profil',
  '/profil/email/jeton-quelconque',
  '/gerer',
  '/gerer/maison',
] as const

test.describe('AUTH-S01 / PERM-S01 — sans session', () => {
  for (const chemin of ECRANS_PRIVES) {
    test(`« ${chemin} » renvoie à la connexion sans rien livrer`, async ({
      page,
    }) => {
      await page.goto(chemin)
      await page.waitForURL('**/connexion')

      await expect(
        page.getByRole('heading', { name: 'Bienvenue chez Solenne' }),
      ).toBeVisible()
      // Aucun fragment du cercle n'a été rendu au passage.
      const texte = await page.locator('body').innerText()
      expect(texte).not.toContain('Bonjour Solenne')
      expect(texte).not.toContain('Navigation principale')
    })
  }

  test('aucune donnée du jeu de démonstration ne transparaît', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForURL('**/connexion')

    const corps = await page.content()
    for (const secret of ['solenne@exemple.test', 'marc@exemple.test', 'Delaunay']) {
      expect(corps).not.toContain(secret)
    }
  })
})

test.describe('Ami connecté', () => {
  test.use({ storageState: fichierSession('marc') })

  test('PERM-S08 — « /gerer » est introuvable, pas « interdit »', async ({
    page,
  }) => {
    const reponse = await page.goto('/gerer')
    expect(reponse?.status()).toBe(404)

    const texte = await page.locator('body').innerText()
    expect(texte).toContain('Rien par ici')
    // Le refus ne confirme pas l'existence de la console.
    expect(texte).not.toContain('Gérer')
    expect(texte).not.toContain('interdit')
  })

  test('HOUSE-S02 — « /gerer/maison » est introuvable pour un ami', async ({
    page,
  }) => {
    const reponse = await page.goto('/gerer/maison')
    expect(reponse?.status()).toBe(404)

    const texte = await page.locator('body').innerText()
    expect(texte).toContain('Rien par ici')
    // Ni le nom de la maison, ni un champ de saisie ne doivent transparaître.
    expect(texte).not.toContain('Nom affiché')
    await expect(page.locator('input')).toHaveCount(0)
  })

  test('PERM-S05 — l’onglet « Gérer » n’est pas proposé', async ({ page }) => {
    await page.goto('/')
    const onglets = page.getByRole('navigation', {
      name: 'Navigation principale',
    })
    await expect(onglets.getByRole('link')).toHaveCount(5)
    await expect(onglets.getByRole('link', { name: /Gérer/ })).toHaveCount(0)
  })

  test('PROFILE-010 — son profil ne montre que ses propres informations', async ({
    page,
  }) => {
    await page.goto('/profil')
    await page.waitForLoadState('networkidle')

    const texte = await page.locator('body').innerText()
    expect(texte).toContain('marc@exemple.test')
    expect(texte).not.toContain('solenne@exemple.test')
    await verifierAucuneFuite(page)
  })
})

test.describe('Personne déjà connectée', () => {
  test.use({ storageState: fichierSession('solenne') })

  test('n’a rien à faire sur l’écran de connexion', async ({ page }) => {
    await page.goto('/connexion')
    await page.waitForURL((url) => !url.pathname.startsWith('/connexion'))
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }),
    ).toBeVisible()
  })
})
