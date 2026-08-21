'use client'

import {
  BedDouble,
  CalendarDays,
  Home,
  Settings2,
  Trees,
  User,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * Barre basse à 5 onglets, plus un 6ᵉ « Gérer » pour Solenne (UI §2).
 *
 * Le 6ᵉ onglet n'est qu'un **confort d'affichage** : la protection réelle des
 * pages d'administration est côté serveur (module PERM). Masquer un onglet
 * n'a jamais sécurisé quoi que ce soit.
 */

export interface Onglet {
  readonly href: string
  readonly libelle: string
  readonly icone: LucideIcon
}

export const ONGLETS_COMMUNS: readonly Onglet[] = [
  { href: '/', libelle: 'Accueil', icone: Home },
  { href: '/agenda', libelle: 'Agenda', icone: CalendarDays },
  { href: '/sejours', libelle: 'Séjours', icone: BedDouble },
  { href: '/maison', libelle: 'Maison', icone: Trees },
  { href: '/profil', libelle: 'Profil', icone: User },
] as const

export const ONGLET_GERER: Onglet = {
  href: '/gerer',
  libelle: 'Gérer',
  icone: Settings2,
}

export function estOngletActif(href: string, chemin: string): boolean {
  if (href === '/') return chemin === '/'
  return chemin === href || chemin.startsWith(`${href}/`)
}

export interface NavigationBasseProps {
  readonly estAdministratrice: boolean
  /** Nombre de demandes en attente, affiché en pastille sur « Gérer ». */
  readonly demandesEnAttente?: number
}

export function NavigationBasse({
  estAdministratrice,
  demandesEnAttente = 0,
}: NavigationBasseProps) {
  const chemin = usePathname() ?? '/'
  const onglets = estAdministratrice
    ? [...ONGLETS_COMMUNS, ONGLET_GERER]
    : ONGLETS_COMMUNS

  return (
    <nav
      aria-label="Navigation principale"
      className="zone-sure-basse fixed inset-x-0 bottom-0 z-30 border-t border-lin-profond bg-lin/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch">
        {onglets.map((onglet) => {
          const actif = estOngletActif(onglet.href, chemin)
          const Icone = onglet.icone
          const pastille =
            onglet.href === ONGLET_GERER.href && demandesEnAttente > 0
              ? demandesEnAttente
              : 0

          return (
            <li key={onglet.href} className="min-w-0 flex-1">
              <Link
                href={onglet.href}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'cible-tactile relative flex h-full flex-col items-center justify-center gap-1 px-1 py-2',
                  'text-[0.6875rem] leading-tight transition-colors',
                  actif
                    ? 'text-olive-fonce'
                    : 'text-encre-doux hover:text-encre',
                )}
              >
                <span className="relative">
                  <Icone
                    aria-hidden="true"
                    className={cn('size-6', actif && 'stroke-[2.25]')}
                  />
                  {pastille > 0 && (
                    <span
                      className="absolute -right-2.5 -top-1.5 flex min-w-[1.15rem] items-center justify-center
                                 rounded-full bg-terracotta px-1 text-[0.625rem] font-semibold leading-[1.15rem] text-white"
                    >
                      {pastille > 9 ? '9+' : pastille}
                      <span className="sr-only">
                        {` demande${pastille > 1 ? 's' : ''} à traiter`}
                      </span>
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center">
                  {onglet.libelle}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
