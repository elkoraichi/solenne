import { expect, type Locator, type Page } from '@playwright/test'

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

/**
 * Un clic qui attend d'avoir servi à quelque chose.
 *
 * Un bouton existe dans le HTML **avant** que React ne lui attache son
 * comportement. Cliquer dans cet intervalle ne fait rien, et le test s'épuise à
 * attendre un formulaire qui ne s'ouvrira jamais — d'autant plus en mode
 * développement, où les scripts arrivent tard. On re-clique donc tant que le
 * témoin attendu n'est pas apparu, plutôt que de parier sur un délai.
 */
export async function cliquerJusquA(
  bouton: Locator,
  temoin: Locator,
): Promise<void> {
  await expect(async () => {
    if (await temoin.isVisible()) return
    if (await bouton.isVisible()) await bouton.click()
    await expect(temoin).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
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

/**
 * Textes rognés ou superposés — la famille de défauts que les mesures d'écran
 * ont laissée passer trois modules de suite (`HOUSE`, `SPACE`, `BLOCK`).
 *
 * Aucun de ces trois défauts ne débordait de la fenêtre : le texte était coupé
 * *à l'intérieur* de sa boîte, ou recouvert par un voisin. On regarde donc, pour
 * chaque porteur de texte, si son contenu tient dans la largeur qu'on lui donne.
 *
 * `sélecteur` cadre la vérification sur une zone : appliquée à une page entière
 * elle ramasserait des faux positifs (défilements volontaires, `truncate`).
 */
export async function textesRognes(
  page: Page,
  selecteur: string,
): Promise<string[]> {
  return page.$$eval(`${selecteur} :is(p, span, h1, h2, h3, h4, li, label)`, (
    noeuds,
  ) =>
    noeuds
      .filter((noeud) => {
        const element = noeud as HTMLElement
        if (element.offsetParent === null) return false
        // Un conteneur qui défile volontairement n'est pas rogné.
        const style = getComputedStyle(element)
        if (style.overflowX !== 'visible' && style.overflowX !== 'clip') {
          return false
        }
        return element.scrollWidth > element.clientWidth + 1
      })
      .map((noeud) => {
        const element = noeud as HTMLElement
        return `${element.tagName.toLowerCase()} « ${
          element.textContent?.trim().slice(0, 40) ?? ''
        } » — ${element.scrollWidth} px dans ${element.clientWidth} px`
      }),
  )
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
