import { expect, test, type Page } from '@playwright/test'

import { fichierSession, verifierAucunDebordement } from './aide'

/**
 * `CAL` à l'écran — CAL-007, CAL-012, CAL-013, CAL-016.
 *
 * Le jeu de démonstration place ses séjours par rapport à aujourd'hui (+7,
 * +21, +40, +75 jours) : les mois visés sont donc calculés, jamais écrits en
 * dur. Un agenda testé sur un mois figé aurait cessé de l'être le mois suivant.
 */

/** Ce qui ne doit jamais atteindre l'écran d'un ami (jeu de démonstration). */
const SECRETS_DES_AUTRES = [
  'Rester dormir après la fête',
  'Week-end en famille',
  'On peut décaler',
  'Léa',
] as const

function moisDansNJours(nombre: number): string {
  const cible = new Date()
  cible.setDate(cible.getDate() + nombre)
  return `${cible.getFullYear()}-${String(cible.getMonth() + 1).padStart(2, '0')}`
}

async function libelleAffiche(page: Page): Promise<string> {
  return (await page.locator('main h3').first().innerText()).trim()
}

/** Un pas de navigation, achevé : le mois suivant n'est lu qu'une fois arrivé. */
async function avancerDUnMois(page: Page, sens: 'suivant' | 'précédent') {
  const lien = page.getByRole('link', {
    name: sens === 'suivant' ? /Mois suivant/ : /Mois précédent/,
  })
  const cible = await lien.getAttribute('href')
  await lien.click()
  await page.waitForURL(
    (url) => `${url.pathname}${url.search}` === cible,
  )
}

test.describe('L’agenda du cercle', () => {
  test.use({ storageState: fichierSession('marc') })

  test('CAL-012 — six mois en avant, six mois en arrière, rien de perdu', async ({
    page,
  }) => {
    await page.goto('/agenda')
    const depart = await libelleAffiche(page)

    for (let i = 0; i < 6; i += 1) await avancerDUnMois(page, 'suivant')
    expect(await libelleAffiche(page)).not.toBe(depart)

    for (let i = 0; i < 6; i += 1) await avancerDUnMois(page, 'précédent')
    expect(await libelleAffiche(page)).toBe(depart)
  })

  test('CAL-007 — un séjour se retrouve dans le mois où il tombe', async ({
    page,
  }) => {
    // Le séjour de Solenne tombe à +40 jours (`dans(40)` du jeu de démonstration) :
    // viser ce mois-là, pas +21, qui n'y tombe que certains jours du mois par
    // coïncidence de calendrier.
    await page.goto(`/agenda?vue=mois&mois=${moisDansNJours(40)}`)

    // Le séjour de Solenne est en « prénom et nombre » : c'est le seul nom
    // qu'un ami a le droit de lire sur la grille.
    await expect(page.getByText('Solenne').first()).toBeVisible()
  })

  test('CAL-016 — la grille n’emporte rien de privé dans sa charge utile', async ({
    page,
  }) => {
    await page.goto(`/agenda?vue=mois&mois=${moisDansNJours(21)}`)
    const charge = await page.content()

    for (const secret of SECRETS_DES_AUTRES) {
      expect(charge, `« ${secret} » ne doit pas être envoyé`).not.toContain(
        secret,
      )
    }
  })

  test('CAL-013 — la grille tient dans l’écran et se touche au pouce', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'mobile-320', 'Mesure propre au 320 px')

    await page.goto('/agenda')
    await verifierAucunDebordement(page)

    const cellules = page.locator('[data-testid^="jour-"]')
    const nombre = await cellules.count()
    expect(nombre).toBeGreaterThanOrEqual(28)

    for (const index of [0, Math.floor(nombre / 2), nombre - 1]) {
      const boite = await cellules.nth(index).boundingBox()
      expect(boite?.width ?? 0).toBeGreaterThanOrEqual(44)
      expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })

  test('CAL-006 — un mois sans rien le dit avec des mots', async ({ page }) => {
    // Un mois lointain : le jeu de démonstration ne va pas au-delà de 90 jours.
    await page.goto(`/agenda?vue=mois&mois=${moisDansNJours(400)}`)
    await expect(
      page.getByText(/La maison est libre tout le mois/),
    ).toBeVisible()
  })

  test('CAL-014 — la semaine ne défile que verticalement', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'mobile-320', 'Mesure propre au 320 px')

    await page.goto('/agenda?vue=semaine')
    await verifierAucunDebordement(page)
    await expect(
      page.getByRole('list', { name: 'Jours de la semaine' }).getByRole('listitem'),
    ).toHaveCount(7)
  })

  test('CAL-015 — les catégories se distinguent sans la couleur', async ({
    page,
  }) => {
    await page.goto(`/agenda?vue=mois&mois=${moisDansNJours(21)}`)
    // On retire la couleur : ce qui reste doit suffire.
    await page.addStyleTag({ content: 'html { filter: grayscale(1); }' })

    const formes = await page
      .getByLabel('Légende')
      .locator('li svg path, li svg circle, li svg rect')
      .evaluateAll((noeuds) =>
        noeuds.map((noeud) => noeud.getAttribute('d') ?? noeud.outerHTML),
      )

    expect(formes.length).toBeGreaterThan(0)
    // Deux catégories qui partageraient toutes leurs formes seraient
    // indiscernables une fois la couleur ôtée.
    expect(new Set(formes).size).toBe(formes.length)
  })

  test('BLOCK-S02 — un ami n’a aucune surface pour fermer des dates', async ({
    page,
  }) => {
    await page.goto('/agenda')
    await expect(
      page.getByRole('button', { name: 'Fermer des dates' }),
    ).toHaveCount(0)
  })

  test('une adresse abîmée ramène au mois courant, pas à une erreur', async ({
    page,
  }) => {
    await page.goto('/agenda?vue=mois&mois=2026-99')
    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible()

    await page.goto('/agenda')
    const courant = await libelleAffiche(page)
    await page.goto('/agenda?vue=mois&mois=nimportequoi')
    expect(await libelleAffiche(page)).toBe(courant)
  })
})

/**
 * `BLOCK-011` — fermer des dates au cliquer-glisser.
 *
 * Renvoyé ici par le module `BLOCK` : le geste suppose un agenda, qui
 * n'existait pas encore. Le test écrit en base ; il ne tourne donc que sur une
 * seule taille d'écran, sinon trois navigateurs se disputeraient les mêmes
 * dates.
 */
test.describe('Le cliquer-glisser de Solenne', () => {
  test.use({ storageState: fichierSession('solenne') })

  test('BLOCK-011 — glisser sur trois jours ferme trois nuits', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'mobile-320', 'Écriture : une seule taille')

    // Un mois lointain : personne d'autre n'y touche, aucun séjour ne s'y oppose.
    const mois = moisDansNJours(400)
    await page.goto(`/agenda?vue=mois&mois=${mois}`)
    await page.getByRole('button', { name: 'Fermer des dates' }).click()

    const premier = page.locator('[data-jour]').nth(7)
    const dernier = page.locator('[data-jour]').nth(9)
    const depart = await premier.boundingBox()
    const arrivee = await dernier.boundingBox()
    if (!depart || !arrivee) throw new Error('Grille introuvable')

    await page.mouse.move(depart.x + depart.width / 2, depart.y + depart.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      arrivee.x + arrivee.width / 2,
      arrivee.y + arrivee.height / 2,
      { steps: 6 },
    )
    await page.mouse.up()

    // Les trois jours sont marqués, et la borne de fin est le quatrième.
    await expect(page.locator('[data-choisi="oui"]')).toHaveCount(3)

    const du = await premier.getAttribute('data-jour')
    const attenduAu = await page.locator('[data-jour]').nth(10).getAttribute('data-jour')
    await expect(page.getByLabel('Du')).toHaveValue(du ?? '')
    await expect(page.getByLabel('Au (non compris)')).toHaveValue(attenduAu ?? '')

    await page.getByLabel('Libellé').fill('Peinture des volets')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page.getByText('La période est fermée.')).toBeVisible()
    await expect(page.getByLabel('Légende').getByText('Maison fermée')).toBeVisible()

    // On repart d'une maison propre : le blocage posé ici ne doit pas peser sur
    // les autres campagnes.
    await page.goto('/gerer/maison')
    await page
      .getByRole('button', { name: 'Lever « Peinture des volets »' })
      .click()
    await page.getByRole('button', { name: 'Lever le blocage' }).click()
    await expect(
      page.getByText('La période est de nouveau disponible.'),
    ).toBeVisible()
  })
})
