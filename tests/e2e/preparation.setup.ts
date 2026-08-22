import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { test as preparation } from '@playwright/test'

import { COMPTES, connecter, fichierSession, type Compte } from './aide'

/**
 * Écrans compilés une fois, en série, avant que les trois tailles ne partent en
 * parallèle. En mode développement, Next compile chaque route au premier appel :
 * si trois navigateurs la demandent en même temps sur une machine chargée, la
 * première réponse peut dépasser la minute et faire échouer un test qui n'a rien
 * à se reprocher.
 *
 * Sur le build de production — le cas normal d'une campagne — il n'y a plus rien
 * à compiler : le préchauffage est sauté.
 */
const ROUTES_A_CHAUFFER = [
  '/',
  '/agenda',
  '/sejours',
  '/maison',
  '/profil',
  '/gerer',
  '/gerer/maison',
] as const

/**
 * Préparation unique de la campagne : le jeu de démonstration est rejoué, puis
 * deux sessions sont ouvertes et rangées sur disque — celle de Solenne et celle
 * d'un ami. Les écrans du cercle repartent ensuite de ces sessions plutôt que
 * de se reconnecter à chaque test.
 */
preparation('jeu de démonstration et sessions', async ({ browser }) => {
  preparation.setTimeout(300_000)

  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'pipe' })

  for (const compte of Object.keys(COMPTES) as Compte[]) {
    const chemin = fichierSession(compte)
    mkdirSync(dirname(chemin), { recursive: true })

    const contexte = await browser.newContext()
    const page = await contexte.newPage()
    await connecter(page, compte)
    await contexte.storageState({ path: chemin })

    // Seule Solenne atteint la console ; l'ami chauffe le reste.
    if (compte === 'solenne' && process.env.E2E_DEV) {
      for (const route of ROUTES_A_CHAUFFER) {
        await page.goto(route, { timeout: 120_000 })
      }
    }

    await contexte.close()
  }
})
