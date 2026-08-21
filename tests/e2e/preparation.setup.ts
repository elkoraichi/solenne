import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { test as preparation } from '@playwright/test'

import { COMPTES, connecter, fichierSession, type Compte } from './aide'

/**
 * Préparation unique de la campagne : le jeu de démonstration est rejoué, puis
 * deux sessions sont ouvertes et rangées sur disque — celle de Solenne et celle
 * d'un ami. Les écrans du cercle repartent ensuite de ces sessions plutôt que
 * de se reconnecter à chaque test.
 */
preparation('jeu de démonstration et sessions', async ({ browser }) => {
  preparation.setTimeout(180_000)

  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'pipe' })

  for (const compte of Object.keys(COMPTES) as Compte[]) {
    const chemin = fichierSession(compte)
    mkdirSync(dirname(chemin), { recursive: true })

    const contexte = await browser.newContext()
    const page = await contexte.newPage()
    await connecter(page, compte)
    await contexte.storageState({ path: chemin })
    await contexte.close()
  }
})
