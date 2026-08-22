import { expect, test, type Page } from '@playwright/test'

import { fichierSession, textesRognes, verifierAucuneFuite } from './aide'

/**
 * `PRIV` à l'écran — PRIV-001, 004, 006, 016.
 *
 * Le jeu de démonstration porte les trois niveaux à la fois : le séjour de Marc
 * et celui de Léa sont en « Maison occupée », celui de Solenne en « prénom et
 * nombre ». Marc regarde donc, dans un même écran, ce qu'il a le droit de
 * savoir et ce qu'il n'a pas le droit de savoir.
 *
 * **Lecture seule.** Les écritures — changer un niveau, changer le défaut —
 * sont éprouvées par les tests d'intégration : trois tailles d'écran jouant en
 * parallèle sur la même base ne peuvent pas se disputer trois séjours sans
 * devenir instables.
 */

/** Ce qui ne doit jamais atteindre l'écran d'un ami (jeu de démonstration). */
const SECRETS_DES_AUTRES = [
  'Rester dormir après la fête',
  'Week-end en famille',
  'On peut décaler',
  'Léa',
] as const

async function texteDe(page: Page): Promise<string> {
  return page.locator('body').innerText()
}

test.describe('L’agenda vu par un ami', () => {
  test.use({ storageState: fichierSession('marc') })

  test('PRIV-001 / 004 / 006 — « Maison occupée », son séjour, et rien des autres', async ({
    page,
  }) => {
    // La vue Liste montre ce qui vient, quel que soit le mois affiché : c'est
    // là que les trois niveaux du jeu de démonstration se lisent d'un coup.
    await page.goto('/agenda?vue=liste')

    // Le séjour de Léa : une bande anonyme, sans prénom ni effectif.
    await expect(page.getByText('Maison occupée').first()).toBeVisible()

    // Le sien : en entier, nommé comme tel.
    await expect(page.getByText('Votre séjour').first()).toBeVisible()

    // Celui de Solenne, en « prénom et nombre » : elle a choisi de se montrer.
    await expect(page.getByText('Solenne', { exact: true }).first()).toBeVisible()

    const texte = await texteDe(page)
    for (const secret of SECRETS_DES_AUTRES) {
      expect(texte, `« ${secret} » ne doit pas s’afficher`).not.toContain(secret)
    }

    await verifierAucuneFuite(page)
  })

  test('PRIV-012 — aucun décompte de places à l’écran', async ({ page }) => {
    await page.goto('/agenda')
    const texte = await texteDe(page)

    expect(texte).not.toMatch(/\d+\s+places?\s+restantes?/i)
    expect(texte).not.toMatch(/reste\s+\d+\s+places?/i)
  })

  test('aucun texte rogné dans l’agenda', async ({ page }) => {
    await page.goto('/agenda?vue=liste')
    await expect(page.getByText('Maison occupée').first()).toBeVisible()

    expect(await textesRognes(page, 'main')).toEqual([])
  })

  test('PRIV-001 en vue Mois — la grille ne dit rien de plus que la liste', async ({
    page,
  }) => {
    await page.goto('/agenda')
    await expect(
      page.getByRole('link', { name: 'Mois', exact: true }),
    ).toHaveAttribute('aria-current', 'page')

    const texte = await texteDe(page)
    for (const secret of SECRETS_DES_AUTRES) {
      expect(texte, `« ${secret} » ne doit pas s’afficher`).not.toContain(secret)
    }

    await verifierAucuneFuite(page)
  })

  test('PRIV-016 — l’accueil ne détaille aucun séjour d’autrui', async ({
    page,
  }) => {
    await page.goto('/')
    const texte = await texteDe(page)

    for (const secret of SECRETS_DES_AUTRES) {
      expect(texte, `« ${secret} » ne doit pas s’afficher`).not.toContain(secret)
    }
    await verifierAucuneFuite(page)
  })

  test('PRIV-S08 — la console de Solenne reste fermée', async ({ page }) => {
    const reponse = await page.goto('/gerer/maison')
    expect(reponse?.status()).toBe(404)

    const texte = await texteDe(page)
    expect(texte).not.toContain('Confidentialité des séjours')
  })
})

test.describe('La console de confidentialité', () => {
  test.use({ storageState: fichierSession('solenne') })

  test('PRIV-002 / 011 — Solenne lit les trois séjours et leur réglage', async ({
    page,
  }) => {
    await page.goto('/gerer/maison')

    const section = page.getByRole('region', {
      name: 'Confidentialité des séjours',
    })
    await expect(section).toBeVisible()

    // Le défaut, puis un réglage par séjour — deux choses distinctes.
    await expect(
      section.getByRole('group', {
        name: 'Pour les prochains séjours de vos amis',
      }),
    ).toBeVisible()

    // Et la phrase qui dit que ses séjours à elle partent plus visibles.
    await expect(
      section.getByText(/Vos propres séjours.*prénom et nombre de personnes/s),
    ).toBeVisible()

    const parSejour = section.getByRole('group', {
      name: 'Ce que les amis en voient',
    })
    await expect(parSejour.first()).toBeVisible()
    expect(await parSejour.count()).toBeGreaterThanOrEqual(3)

    // Le prénom et l'effectif de chacun, que seule Solenne lit.
    await expect(section.getByText('Marc', { exact: true })).toBeVisible()
    await expect(section.getByText('Léa', { exact: true })).toBeVisible()

    await verifierAucuneFuite(page)
  })

  test('aucun texte rogné dans la console de confidentialité', async ({
    page,
  }) => {
    await page.goto('/gerer/maison')
    await expect(
      page.getByRole('region', { name: 'Confidentialité des séjours' }),
    ).toBeVisible()

    expect(await textesRognes(page, '[aria-labelledby="titre-confidentialite"]'))
      .toEqual([])
  })
})
