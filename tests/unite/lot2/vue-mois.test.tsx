import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VueMois } from '@/components/agenda/vue-mois'
import { grilleDuMois, type ElementAgenda } from '@/domain/calendar/grille'
import { jour } from '@/domain/core/dates'

/**
 * `CAL` — la vue Mois.
 *
 * Le placement des dates est déjà éprouvé sur le moteur pur ; ce fichier
 * vérifie ce que le moteur ne peut pas voir : qu'un élément **arrive à
 * l'écran**, qu'il s'annonce par un mot et pas seulement par une couleur
 * (CAL-R4), et qu'une journée trop chargée le dit au lieu de tronquer en
 * silence (CAL-009).
 */

function element(
  cle: string,
  du: string,
  au: string,
  reste: Partial<ElementAgenda> = {},
): ElementAgenda {
  return {
    cle,
    categorie: 'SEJOUR',
    titre: cle,
    du: jour(du),
    au: jour(au),
    ...reste,
  }
}

function rendreMois(elements: readonly ElementAgenda[], rangeesMax = 2) {
  return render(
    <VueMois
      grille={grilleDuMois({ annee: 2026, mois: 9 }, elements, {
        aujourdhui: jour('2026-09-12'),
        rangeesMax,
      })}
    />,
  )
}

describe('CAL-001 — le mois affiché', () => {
  it('annonce le mois et ses sept colonnes', () => {
    rendreMois([])
    expect(screen.getByText('septembre 2026')).toBeInTheDocument()
    expect(screen.getByText('lun.')).toBeInTheDocument()
    expect(screen.getByText('dim.')).toBeInTheDocument()
  })

  it('pose chaque catégorie avec son mot, pas seulement sa couleur', () => {
    rendreMois([
      element('Marc', '2026-09-10', '2026-09-12'),
      element('fermeture', '2026-09-02', '2026-09-04', {
        categorie: 'INDISPONIBLE',
        titre: 'Maison fermée',
      }),
      element('occupee', '2026-09-20', '2026-09-22', {
        categorie: 'OCCUPEE',
        titre: 'Maison occupée',
      }),
    ])

    const grille = within(screen.getByTestId('grille'))
    expect(grille.getByText('Marc')).toBeInTheDocument()
    expect(grille.getByText('Maison fermée')).toBeInTheDocument()
    // Du 20 au 22 septembre enjambe un dimanche : la bande est coupée en deux
    // lignes, et se nomme sur chacune. Une bande muette sur sa seconde ligne
    // serait illisible.
    expect(grille.getAllByText('Maison occupée')).toHaveLength(2)
    // Le nom de la catégorie reste lisible pour un lecteur d'écran.
    expect(grille.getAllByText(/^Séjour —/)).not.toHaveLength(0)
  })

  it('CAL-015 — une légende nomme ce que la grille contient, et rien d’autre', () => {
    rendreMois([
      element('Marc', '2026-09-10', '2026-09-12'),
      element('fermeture', '2026-09-02', '2026-09-04', {
        categorie: 'INDISPONIBLE',
        titre: 'Maison fermée',
      }),
    ])

    const legende = within(screen.getByRole('list', { name: 'Légende' }))
    expect(legende.getByText('Séjour')).toBeInTheDocument()
    expect(legende.getByText('Maison fermée')).toBeInTheDocument()
    expect(legende.queryByText('Maison occupée')).toBeNull()
  })

  it('ne met pas de légende sous un mois vide', () => {
    rendreMois([])
    expect(screen.queryByRole('list', { name: 'Légende' })).toBeNull()
  })

  it('distingue le jour courant', () => {
    rendreMois([])
    expect(screen.getByTestId('jour-2026-09-12')).toHaveAttribute(
      'aria-current',
      'date',
    )
    expect(screen.getByTestId('jour-2026-09-11')).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('montre les jours des mois voisins en retrait, sans les cacher', () => {
    rendreMois([])
    expect(screen.getByTestId('jour-2026-08-31')).toBeInTheDocument()
    expect(screen.getByTestId('jour-2026-10-04')).toBeInTheDocument()
  })
})

describe('CAL-009 — une journée chargée', () => {
  it('annonce ce qu’elle ne montre pas', () => {
    rendreMois(
      Array.from({ length: 6 }, (_, index) =>
        element(`e${index}`, '2026-09-12', '2026-09-14'),
      ),
    )

    const case12 = screen.getByTestId('jour-2026-09-12')
    expect(within(case12).getByText('+4')).toBeInTheDocument()
  })

  it('ne dit rien quand tout tient', () => {
    rendreMois([element('seul', '2026-09-12', '2026-09-14')])
    const case12 = screen.getByTestId('jour-2026-09-12')
    expect(within(case12).queryByText(/^\+/)).toBeNull()
  })
})

describe('CAL-006 — un mois sans rien', () => {
  it('le dit avec des mots, et invite à venir', () => {
    rendreMois([])
    expect(
      screen.getByText(/La maison est libre tout le mois/),
    ).toBeInTheDocument()
  })

  it('se tait dès qu’il se passe quelque chose', () => {
    rendreMois([element('Marc', '2026-09-10', '2026-09-12')])
    expect(screen.queryByText(/La maison est libre tout le mois/)).toBeNull()
  })
})
