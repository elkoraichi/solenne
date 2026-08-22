import { expect, test } from '@playwright/test'

import { cliquerJusquA, fichierSession, verifierAucuneFuite } from './aide'

/**
 * `BLOCK` à l'écran — la console des périodes bloquées.
 *
 * Les trois tailles jouent en parallèle sur la même base : chaque test crée son
 * propre blocage, sous un libellé qui ne peut appartenir qu'à lui, et le lève à
 * la fin. Aucun test ne compte les blocages présents.
 *
 * Le cliquer-glisser de `BLOCK-011` n'est pas ici : il suppose l'agenda, qui
 * arrive au module `CAL` (lot 2.5). Il y sera joué.
 */

/** Un jour à `n` jours d'ici, au format `AAAA-MM-JJ`. */
function dans(n: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

/** Chaque taille d'écran travaille sur ses propres dates, loin des autres. */
const DECALAGES: Readonly<Record<string, number>> = {
  'mobile-320': 200,
  'tablette-768': 240,
  'bureau-1440': 280,
}

test.describe('Console des périodes bloquées', () => {
  test.use({ storageState: fichierSession('solenne') })

  test('BLOCK-001 / 009 — Solenne bloque une période, puis la lève', async ({
    page,
  }, infos) => {
    const libelle = `Volets à repeindre ${infos.project.name}`
    const decalage = DECALAGES[infos.project.name] ?? 320

    await page.goto('/gerer/maison')
    const section = page.getByRole('region', { name: 'Périodes bloquées' })
    await expect(section).toBeVisible()

    await cliquerJusquA(
      section.getByRole('button', { name: 'Bloquer une période' }),
      section.getByLabel('Du'),
    )
    await section.getByLabel('Du').fill(dans(decalage))
    await section.getByLabel('Au (non compris)').fill(dans(decalage + 4))
    await section.getByLabel('Libellé').fill(libelle)
    await section.getByLabel('Personnel').check()
    await section
      .getByLabel('Motif (pour vous seule)')
      .fill('Julien s’en occupe pendant que je suis à Lyon.')
    await section.getByRole('button', { name: 'Enregistrer' }).click()

    const carte = section.getByRole('listitem').filter({ hasText: libelle })
    await expect(carte).toBeVisible({ timeout: 15_000 })
    await expect(carte).toContainText('Personnel')
    await verifierAucuneFuite(page)

    // La levée nomme l'objet avant de l'effacer (UI-R5).
    await carte.getByRole('button', { name: `Lever « ${libelle} »` }).click()
    const dialogue = page.getByRole('dialog')
    await expect(dialogue).toContainText(libelle)
    await dialogue.getByRole('button', { name: 'Lever le blocage' }).click()

    await expect(section.getByText(libelle)).toHaveCount(0, { timeout: 15_000 })
  })

  test('BLOCK-007 — un blocage par-dessus un séjour confirmé est refusé, et dit lequel', async ({
    page,
  }, infos) => {
    await page.goto('/gerer/maison')
    const section = page.getByRole('region', { name: 'Périodes bloquées' })

    await cliquerJusquA(
      section.getByRole('button', { name: 'Bloquer une période' }),
      section.getByLabel('Du'),
    )
    // Le jeu de démonstration confirme un séjour du 40ᵉ au 44ᵉ jour.
    await section.getByLabel('Du').fill(dans(39))
    await section.getByLabel('Au (non compris)').fill(dans(46))
    await section
      .getByLabel('Libellé')
      .fill(`Tentative impossible ${infos.project.name}`)
    await section.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(section.getByRole('alert').first()).toContainText(
      'Un séjour confirmé occupe ces dates',
      { timeout: 15_000 },
    )
    await expect(section).toContainText('Séjours confirmés à annuler d’abord')
    await verifierAucuneFuite(page)
  })
})
