import { expect, test } from '@playwright/test'

import { ciblesTropPetites, fichierSession, verifierAucunDebordement } from './aide'

/**
 * `STAY` à l'écran — la vie d'un séjour confirmé.
 *
 * `STAY-001` lit le séjour de Marc posé par le jeu de démonstration
 * (`dans(7)` → `dans(10)`) sans y toucher : les trois tailles peuvent le
 * lire en parallèle, comme `STAYREQ-010` le fait déjà pour la disponibilité.
 * `confidentialite.spec.ts` dépend du même séjour — ce fichier ne l'annule
 * jamais.
 *
 * `STAY-002` / `STAY-005` créent et annulent leur **propre** séjour, sur des
 * dates qu'aucun autre parcours n'utilise : écriture, une seule taille.
 */

function dans(n: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

test.describe('Mes séjours (ami)', () => {
  test.use({ storageState: fichierSession('marc') })

  test('STAY-001 — le séjour confirmé apparaît, sans débordement ni cible trop petite', async ({
    page,
  }) => {
    await page.goto('/sejours')

    await expect(page.getByRole('heading', { name: 'Vos séjours' })).toBeVisible()
    await expect(page.getByText('Confirmé').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Annuler ce séjour' }).first()).toBeVisible()

    await verifierAucunDebordement(page)
    expect(await ciblesTropPetites(page)).toEqual([])
  })
})

test.describe('Vie du séjour (Solenne)', () => {
  test.use({ storageState: fichierSession('solenne') })

  test('STAY-002 / STAY-005 / STAY-006 — créer un séjour personnel puis l’annuler avec motif', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'mobile-320', 'Écriture : une seule taille')

    await page.goto('/gerer')
    await expect(page.getByRole('heading', { name: 'Créer un séjour' })).toBeVisible()

    // Le jeu de démonstration porte déjà un séjour personnel de Solenne :
    // un simple « Solenne · » ne distingue pas la ligne créée ici. On
    // raisonne donc en nombre de lignes, jamais en texte de date formaté.
    const lignesSolenne = page.locator('li').filter({ hasText: 'Solenne ·' })
    const avant = await lignesSolenne.count()

    await page.getByLabel('Arrivée', { exact: true }).fill(dans(300))
    await page.getByLabel('Départ', { exact: true }).fill(dans(302))
    await page.getByRole('button', { name: 'Créer ce séjour' }).click()

    await expect(lignesSolenne).toHaveCount(avant + 1, { timeout: 15_000 })
    // Dates les plus lointaines de la liste (`orderBy: startDate asc') : la
    // ligne créée ci-dessus est forcément la dernière.
    const ligne = lignesSolenne.last()

    // Un motif vide ne permet pas de confirmer (STAY-006).
    await ligne.getByRole('button', { name: 'Annuler ce séjour' }).click()
    const confirmer = page.getByRole('button', { name: 'Confirmer l’annulation' })
    await expect(confirmer).toBeDisabled()

    await page.getByLabel('Motif de l’annulation').fill('Test automatisé — annulation')
    await expect(confirmer).toBeEnabled()
    await confirmer.click()

    // Un séjour annulé quitte « Séjours à venir » (même filtre que `PRIV` pour
    // l'agenda : seuls `CONFIRMED`/`COMPLETED` y figurent).
    await expect(lignesSolenne).toHaveCount(avant, { timeout: 15_000 })
  })
})
