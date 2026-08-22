import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import {
  libelleMois,
  lundiDeLaSemaine,
  moisPrecedent,
  moisSuivant,
  versTexteMois,
  type ReferenceMois,
} from '@/domain/calendar/grille'
import { ajouterJours, formaterPeriode, versTexteJour } from '@/domain/core/dates'
import { cn } from '@/lib/utils'

/**
 * `CAL` — se déplacer dans l'agenda.
 *
 * Tout passe par l'adresse : `?vue=mois&mois=2026-09`, `?vue=semaine&jour=…`.
 * Aucun état côté navigateur, donc rien à perdre en revenant en arrière
 * (CAL-012), et une vue qu'on peut envoyer par message à quelqu'un d'autre.
 */

export type VueAgenda = 'mois' | 'semaine' | 'liste'

export const VUES: readonly { readonly cle: VueAgenda; readonly nom: string }[] =
  [
    { cle: 'mois', nom: 'Mois' },
    { cle: 'semaine', nom: 'Semaine' },
    { cle: 'liste', nom: 'Liste' },
  ]

export function adresseAgenda(
  vue: VueAgenda,
  reference: ReferenceMois,
  jourRepere: Date,
): string {
  if (vue === 'semaine') {
    return `/agenda?vue=semaine&jour=${versTexteJour(lundiDeLaSemaine(jourRepere))}`
  }
  return `/agenda?vue=${vue}&mois=${versTexteMois(reference)}`
}

/** « du 7 au 13 septembre 2026 » — deux jours affichés, pas une période `[du, au[`. */
export function libelleSemaine(jourRepere: Date): string {
  const lundi = lundiDeLaSemaine(jourRepere)
  return formaterPeriode(lundi, ajouterJours(lundi, 6))
}

const FLECHE =
  'inline-flex size-11 items-center justify-center rounded-[var(--radius-champ)] border border-lin-profond text-encre transition-colors hover:bg-lin-fonce'

function Pas({
  href,
  libelle,
  sens,
}: {
  readonly href: string
  readonly libelle: string
  readonly sens: 'avant' | 'arriere'
}) {
  const Icone = sens === 'avant' ? ChevronRight : ChevronLeft
  return (
    <Link href={href} aria-label={libelle} className={FLECHE}>
      <Icone aria-hidden="true" className="size-5" />
    </Link>
  )
}

export function NavigationAgenda({
  vue,
  reference,
  jourRepere,
}: {
  readonly vue: VueAgenda
  readonly reference: ReferenceMois
  readonly jourRepere: Date
}) {
  const lundi = lundiDeLaSemaine(jourRepere)

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Vue de l’agenda" className="flex gap-2">
        {VUES.map((choix) => {
          const actif = choix.cle === vue
          return (
            <Link
              key={choix.cle}
              href={adresseAgenda(choix.cle, reference, jourRepere)}
              {...(actif ? { 'aria-current': 'page' as const } : {})}
              className={cn(
                'inline-flex min-h-11 items-center rounded-[var(--radius-champ)] px-4 text-sm font-medium transition-colors',
                actif
                  ? 'bg-olive text-white'
                  : 'border border-lin-profond text-encre hover:bg-lin-fonce',
              )}
            >
              {choix.nom}
            </Link>
          )
        })}
      </nav>

      {vue === 'liste' ? null : (
        <div className="flex items-center justify-between gap-2">
          {vue === 'mois' ? (
            <Pas
              sens="arriere"
              href={adresseAgenda(vue, moisPrecedent(reference), jourRepere)}
              libelle={`Mois précédent, ${libelleMois(moisPrecedent(reference))}`}
            />
          ) : (
            <Pas
              sens="arriere"
              href={adresseAgenda(vue, reference, ajouterJours(lundi, -7))}
              libelle={`Semaine précédente, ${libelleSemaine(ajouterJours(lundi, -7))}`}
            />
          )}

          <Link
            href={`/agenda?vue=${vue}`}
            className="min-h-11 rounded-[var(--radius-champ)] px-3 py-2 text-sm text-encre-doux underline-offset-4 hover:underline"
          >
            Aujourd’hui
          </Link>

          {vue === 'mois' ? (
            <Pas
              sens="avant"
              href={adresseAgenda(vue, moisSuivant(reference), jourRepere)}
              libelle={`Mois suivant, ${libelleMois(moisSuivant(reference))}`}
            />
          ) : (
            <Pas
              sens="avant"
              href={adresseAgenda(vue, reference, ajouterJours(lundi, 7))}
              libelle={`Semaine suivante, ${libelleSemaine(ajouterJours(lundi, 7))}`}
            />
          )}
        </div>
      )}
    </div>
  )
}
