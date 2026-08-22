import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  libelleSemaine,
  NavigationAgenda,
  type VueAgenda,
} from '@/components/agenda/navigation-agenda'
import { SelectionBlocage } from '@/components/agenda/selection-blocage'
import { VueListe } from '@/components/agenda/vue-liste'
import { VueMois } from '@/components/agenda/vue-mois'
import { VueSemaine } from '@/components/agenda/vue-semaine'
import {
  elementsDeLaConsole,
  elementsDuCercle,
} from '@/domain/calendar/elements'
import {
  grilleDeSemaine,
  grilleDuMois,
  jourDepuisTexte,
  lundiDeLaSemaine,
  moisDepuisTexte,
  moisDuJour,
  premierJourDuMois,
  type ElementAgenda,
  type ReferenceMois,
} from '@/domain/calendar/grille'
import { ajouterJours, debutDeJour, versTexteJour } from '@/domain/core/dates'
import { periodesIndisponibles } from '@/server/actions/blocages'
import {
  occupationDuCercle,
  sejoursDetailles,
} from '@/server/actions/confidentialite'
import { requireUser } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Agenda' }

/**
 * `CAL` — l'agenda.
 *
 * Ce que chacun y lit dépend de qui il est, et la différence se joue **côté
 * serveur** : un ami ne reçoit pas les séjours des autres, il ne les reçoit pas
 * masqués (D4, règle non négociable n°4). Deux lectures séparées, jamais une
 * seule assortie d'un `if` sur le rôle au moment de l'affichage.
 *
 * La vue et le mois vivent dans l'adresse, pas dans le navigateur : l'écran est
 * rendu côté serveur, donc les données qui n'ont pas le droit de sortir ne
 * partent pas, même le temps d'un aller-retour (CAL-016).
 */

/** La fenêtre de données d'un mois : la grille affichée, débordements compris. */
function fenetreDuMois(reference: ReferenceMois): {
  readonly du: string
  readonly au: string
} {
  const premier = premierJourDuMois(reference)
  const dernier = new Date(Date.UTC(reference.annee, reference.mois, 0))
  return {
    du: versTexteJour(lundiDeLaSemaine(premier)),
    au: versTexteJour(ajouterJours(lundiDeLaSemaine(dernier), 7)),
  }
}

export default async function PageAgenda({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const utilisateur = await requireUser('agenda')
  const parametres = await searchParams

  const aujourdhui = debutDeJour(new Date())
  const vue: VueAgenda =
    parametres.vue === 'liste' || parametres.vue === 'semaine'
      ? parametres.vue
      : 'mois'

  // Un mois ou un jour illisible ramène à aujourd'hui plutôt qu'à une page
  // d'erreur : une adresse tronquée dans une conversation ne doit pas casser
  // l'agenda.
  const jourRepere =
    (typeof parametres.jour === 'string'
      ? jourDepuisTexte(parametres.jour)
      : null) ?? aujourdhui
  const reference =
    (typeof parametres.mois === 'string'
      ? moisDepuisTexte(parametres.mois)
      : null) ?? moisDuJour(vue === 'semaine' ? jourRepere : aujourdhui)

  const estAdministratrice = utilisateur.role === 'ADMIN'
  const lundi = lundiDeLaSemaine(jourRepere)

  /**
   * Chaque vue ne demande que ce qu'elle montre. La vue Liste ne parle que de
   * ce qui vient : le passé n'a pas à circuler.
   */
  const fenetre =
    vue === 'mois'
      ? fenetreDuMois(reference)
      : vue === 'semaine'
        ? { du: versTexteJour(lundi), au: versTexteJour(ajouterJours(lundi, 7)) }
        : { du: versTexteJour(aujourdhui) }

  const indisponibilites = await periodesIndisponibles()
  if (!indisponibilites.ok) notFound()

  let elements: readonly ElementAgenda[] = []

  if (estAdministratrice) {
    const sejours = await sejoursDetailles(fenetre)
    if (!sejours.ok) notFound()
    elements = elementsDeLaConsole({
      indisponibilites: indisponibilites.data,
      sejours: sejours.data,
    })
  } else {
    const cercle = await occupationDuCercle(fenetre)
    if (!cercle.ok) notFound()
    elements = elementsDuCercle({
      indisponibilites: indisponibilites.data,
      occupations: cercle.data.occupations,
      sejours: cercle.data.sejours,
      mesDemandes: cercle.data.mesDemandes,
    })
  }

  const grilleOptions = { aujourdhui, rangeesMax: 2 }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-titre text-2xl text-encre">Agenda</h2>
        <p className="text-sm text-encre-doux">
          {estAdministratrice
            ? 'Tout ce qui occupe la maison, séjours discrets compris.'
            : 'Les périodes où la maison est prise. Ce qui s’y passe reste entre celles et ceux qui y sont.'}
        </p>
      </header>

      <NavigationAgenda
        vue={vue}
        reference={reference}
        jourRepere={jourRepere}
      />

      {vue === 'mois' ? (
        estAdministratrice ? (
          // BLOCK-011 — Solenne ferme des dates à même la grille. Le geste est
          // à elle seule : un ami reçoit la grille, sans surface d'écriture.
          <SelectionBlocage grille={grilleDuMois(reference, elements, grilleOptions)} />
        ) : (
          <VueMois grille={grilleDuMois(reference, elements, grilleOptions)} />
        )
      ) : null}

      {vue === 'semaine' ? (
        <section className="flex flex-col gap-3">
          <h3 className="font-titre text-lg text-encre first-letter:uppercase">
            {libelleSemaine(jourRepere)}
          </h3>
          <VueSemaine
            semaine={grilleDeSemaine(jourRepere, elements, { aujourdhui })}
            elements={elements}
          />
        </section>
      ) : null}

      {vue === 'liste' ? <VueListe elements={elements} /> : null}
    </div>
  )
}
