import { expect, type Page } from '@playwright/test'

/**
 * Outillage commun des parcours en navigateur.
 *
 * Les comptes sont ceux du jeu de démonstration (`prisma/seed.ts`), rejoué au
 * début de chaque campagne par `preparation.setup.ts` : les écrans sont donc
 * toujours regardés avec les mêmes données.
 */

export const MOT_DE_PASSE_DEMO = 'DemoSolenne2026!'

export const COMPTES = {
  solenne: 'solenne@exemple.test',
  marc: 'marc@exemple.test',
} as const

export type Compte = keyof typeof COMPTES

export function fichierSession(compte: Compte): string {
  return `tests/e2e/.session/${compte}.json`
}

/** Connexion par l'écran, comme une personne le ferait. */
export async function connecter(page: Page, compte: Compte): Promise<void> {
  await page.goto('/connexion')
  await page.getByLabel('Adresse email').fill(COMPTES[compte])
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE_DEMO)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(
    page.getByRole('navigation', { name: 'Navigation principale' }),
  ).toBeVisible({ timeout: 30_000 })
}

export const CIBLE_TACTILE_MIN = 44

/**
 * Cibles interactives réellement présentées à l'œil et au doigt.
 * Les liens d'évitement masqués (`sr-only`) sont mesurés séparément, une fois
 * qu'ils ont le focus : c'est le seul moment où ils sont visibles.
 */
export async function ciblesTropPetites(page: Page): Promise<string[]> {
  const elements = await page
    .locator('a[href], button, input, textarea, select, [role="button"]')
    .all()

  const trop_petites: string[] = []
  for (const element of elements) {
    if (!(await element.isVisible())) continue
    const masque = await element.evaluate((n) =>
      (n as HTMLElement).classList.contains('sr-only'),
    )
    if (masque) continue

    const boite = await element.boundingBox()
    if (!boite) continue
    if (boite.height < CIBLE_TACTILE_MIN || boite.width < CIBLE_TACTILE_MIN) {
      const description = await element.evaluate(
        (n) =>
          `${n.tagName.toLowerCase()} « ${n.textContent?.trim().slice(0, 30) ?? ''} »`,
      )
      trop_petites.push(
        `${description} — ${Math.round(boite.width)} × ${Math.round(boite.height)}`,
      )
    }
  }
  return trop_petites
}

/** Aucun débordement horizontal : rien ne dépasse de la fenêtre. */
export async function verifierAucunDebordement(page: Page): Promise<void> {
  const mesures = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    fenetre: window.innerWidth,
  }))
  // Une marge d'un pixel absorbe les arrondis de rendu.
  expect(mesures.document).toBeLessThanOrEqual(mesures.fenetre + 1)
}

/** Un titre à rallonge ne déforme pas sa carte (UI-009). */
export async function verifierTitresBornes(page: Page): Promise<void> {
  const largeurFenetre = await page.evaluate(() => window.innerWidth)
  const titres = page.locator('h1, h2, h3')
  const nombre = await titres.count()
  for (let i = 0; i < nombre; i += 1) {
    const titre = titres.nth(i)
    if (!(await titre.isVisible())) continue
    const boite = await titre.boundingBox()
    if (!boite) continue
    expect(boite.width).toBeLessThanOrEqual(largeurFenetre + 1)
  }
}

/** CORE-R1 : rien de technique ne parvient jusqu'à l'écran. */
export const FUITES_INTERDITES = [
  'PrismaClient',
  'at Object.',
  'SELECT ',
  'Error:',
  'DATABASE_URL',
  'undefined',
  'passwordHash',
  'tokenHash',
] as const

export async function verifierAucuneFuite(page: Page): Promise<void> {
  // `innerText` ne contient que ce qui est présenté à la personne : les
  // scripts et le balisage technique en sont exclus.
  const texte = await page.locator('body').innerText()
  for (const fuite of FUITES_INTERDITES) {
    expect(texte, `fuite « ${fuite} »`).not.toContain(fuite)
  }
}
