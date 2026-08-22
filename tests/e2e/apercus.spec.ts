import { test } from '@playwright/test'

import { fichierSession } from './aide'

/**
 * Captures pour la validation visuelle de Yassine (limite L2).
 * Hors campagne : lancer avec `--grep @apercu`.
 */
const ECRANS = [
  { chemin: '/maison', nom: 'maison' },
  { chemin: '/gerer/maison', nom: 'gerer-maison' },
] as const

/**
 * Sections livrées au fil du lot : une capture cadrée vaut mieux qu'une page
 * entière de trois mètres de haut quand il s'agit de juger un bloc précis.
 */
const SECTIONS = [
  { chemin: '/gerer/maison', region: 'Périodes bloquées', nom: 'blocages' },
  {
    chemin: '/gerer/maison',
    region: 'Confidentialité des séjours',
    nom: 'confidentialite',
  },
] as const

test.describe('@apercu', () => {
  test.use({ storageState: fichierSession('solenne') })

  for (const section of SECTIONS) {
    test(`aperçu ${section.nom}`, async ({ page }, infos) => {
      await page.goto(section.chemin)
      await page.waitForLoadState('networkidle')
      await page
        .getByRole('region', { name: section.region })
        .screenshot({
          path: `Rapports/apercus-lot2/${section.nom}-${infos.project.name}.png`,
        })
    })
  }

  for (const ecran of ECRANS) {
    test(`aperçu ${ecran.nom}`, async ({ page }, infos) => {
      await page.goto(ecran.chemin)
      await page.waitForLoadState('networkidle')
      await page.screenshot({
        path: `Rapports/apercus-lot2/${ecran.nom}-${infos.project.name}.png`,
        fullPage: true,
      })
    })
  }
})

/** Le mois où tombe le jeu de démonstration : une grille vide ne se juge pas. */
function moisAvecDuMonde(): string {
  const cible = new Date()
  cible.setDate(cible.getDate() + 21)
  return `${cible.getFullYear()}-${String(cible.getMonth() + 1).padStart(2, '0')}`
}

const VUES_AGENDA = [
  { adresse: () => `/agenda?vue=mois&mois=${moisAvecDuMonde()}`, nom: 'mois' },
  { adresse: () => '/agenda?vue=semaine', nom: 'semaine' },
  { adresse: () => '/agenda?vue=liste', nom: 'liste' },
] as const

/**
 * L'agenda se capture **tel qu'il s'ouvre**, à hauteur d'écran.
 *
 * Les deux autres cadrages mentent chacun à leur façon : la capture pleine page
 * peint la navigation basse, qui est fixe, là où l'écran s'était arrêté — elle
 * recouvre alors un contenu qu'elle ne recouvre pas en vrai ; la capture cadrée
 * sur `main` passe sous l'en-tête collant, qui en mange la première ligne. Une
 * capture qu'on ne peut pas croire ne sert à rien (limite L2).
 *
 * Le premier écran est aussi ce qui décide : c'est là que Yassine juge si
 * l'agenda est beau et lisible sur un téléphone. Ce qui se trouve plus bas est
 * mesuré, lui, par `rendu-responsive.spec.ts`.
 */
async function capturerAgenda(
  page: import('@playwright/test').Page,
  chemin: string,
  fichier: string,
): Promise<void> {
  await page.goto(chemin)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: fichier })
}

/**
 * L'agenda se juge d'abord du côté de l'ami : c'est là que la décision D4 se
 * voit — ou ne se voit pas. Vu par Solenne, il ne prouverait rien.
 */
test.describe('@apercu cercle', () => {
  test.use({ storageState: fichierSession('marc') })

  for (const vue of VUES_AGENDA) {
    test(`aperçu agenda ${vue.nom}`, async ({ page }, infos) => {
      await capturerAgenda(
        page,
        vue.adresse(),
        `Rapports/apercus-lot2/agenda-ami-${vue.nom}-${infos.project.name}.png`,
      )
    })
  }
})

/**
 * Le même agenda vu par Solenne : elle y lit les prénoms que l'ami n'a pas, et
 * elle y ferme des dates au doigt (BLOCK-011). Deux surfaces différentes pour
 * une même grille — les deux se jugent.
 */
test.describe('@apercu console', () => {
  test.use({ storageState: fichierSession('solenne') })

  for (const vue of VUES_AGENDA) {
    test(`aperçu agenda de Solenne ${vue.nom}`, async ({ page }, infos) => {
      await capturerAgenda(
        page,
        vue.adresse(),
        `Rapports/apercus-lot2/agenda-solenne-${vue.nom}-${infos.project.name}.png`,
      )
    })
  }
})
