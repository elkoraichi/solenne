import { expect, test } from '@playwright/test'

import {
  ciblesTropPetites,
  cliquerJusquA,
  fichierSession,
  verifierAucunDebordement,
} from './aide'

/**
 * `STAYREQ` à l'écran — l'assistant de demande de séjour, ami connecté.
 *
 * `STAYREQ-010` lit seulement (aucune écriture) : les trois tailles peuvent
 * jouer sur les mêmes dates bloquées, en parallèle, sans se gêner.
 * `STAYREQ-013` et `STAYREQ-018` envoient une vraie demande : chacune prend
 * ses propres dates, comme `BLOCK-001` le fait déjà pour les blocages.
 */

function dans(n: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

const MENTION_OBLIGATOIRE =
  'Votre demande sera envoyée à Solenne et ne sera confirmée qu’après son accord.'

/**
 * Chaque taille d'écran envoie sa demande sur ses propres dates : à moins de
 * deux jours (délai minimum de 48 h) et moins de 365 jours (horizon maximum),
 * loin des séjours et blocages du jeu de démonstration (jusqu'à `dans(95)`).
 */
const DECALAGES_ENVOI: Readonly<Record<string, number>> = {
  'mobile-320': 150,
  'tablette-768': 160,
  'bureau-1440': 170,
}

test.describe('Assistant de demande de séjour', () => {
  test.use({ storageState: fichierSession('marc') })

  test('STAYREQ-010 — la disponibilité s’affiche avant l’envoi', async ({
    page,
  }) => {
    await page.goto('/sejours')
    await cliquerJusquA(
      page.getByRole('button', { name: 'Faire une demande de séjour' }),
      page.getByLabel('Arrivée'),
    )

    // Dates entièrement comprises dans le blocage « Ramonage… » du jeu de
    // démonstration (`dans(30)` → `dans(33)`).
    await page.getByLabel('Arrivée').fill(dans(31))
    await page.getByLabel('Départ').fill(dans(32))
    await page.getByRole('button', { name: 'Suivant' }).click()

    await expect(page.getByText('Ces dates ne sont pas disponibles.')).toBeVisible(
      { timeout: 15_000 },
    )
  })

  test('STAYREQ-013 — la mention obligatoire précède chaque envoi', async ({
    page,
  }, infos) => {
    const decalage = DECALAGES_ENVOI[infos.project.name] ?? 190

    await page.goto('/sejours')
    await cliquerJusquA(
      page.getByRole('button', { name: 'Faire une demande de séjour' }),
      page.getByLabel('Arrivée'),
    )

    await page.getByLabel('Arrivée').fill(dans(decalage))
    await page.getByLabel('Départ').fill(dans(decalage + 2))
    await page.getByRole('button', { name: 'Suivant' }).click()
    await page.getByRole('button', { name: 'Suivant' }).click()

    await expect(page.getByText(MENTION_OBLIGATOIRE)).toBeVisible()
    // SREQ-R3 : les règles obligatoires du jeu de démonstration doivent être
    // acceptées avant l'envoi.
    await page.getByLabel('J’ai lu et j’accepte ces règles').check({ force: true })

    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page.getByText('Votre demande est envoyée')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('En attente').first()).toBeVisible()
  })

  test('STAYREQ-018 — les 3 étapes s’utilisent au pouce en 320 px', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'mobile-320', 'Écriture : une seule taille')

    await page.goto('/sejours')
    await verifierAucunDebordement(page)

    await cliquerJusquA(
      page.getByRole('button', { name: 'Faire une demande de séjour' }),
      page.getByLabel('Arrivée'),
    )
    expect(await ciblesTropPetites(page)).toEqual([])

    await page.getByLabel('Arrivée').fill(dans(200))
    await page.getByLabel('Départ').fill(dans(202))
    await page.getByRole('button', { name: 'Suivant' }).click()

    await verifierAucunDebordement(page)
    expect(await ciblesTropPetites(page)).toEqual([])
    await page.getByRole('button', { name: 'Ajouter un invité' }).click()
    await page.getByRole('button', { name: 'Suivant' }).click()

    await verifierAucunDebordement(page)
    expect(await ciblesTropPetites(page)).toEqual([])
    await expect(page.getByText(MENTION_OBLIGATOIRE)).toBeVisible()
    await page.getByLabel('J’ai lu et j’accepte ces règles').check({ force: true })

    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page.getByText('Votre demande est envoyée')).toBeVisible({
      timeout: 15_000,
    })
  })
})
