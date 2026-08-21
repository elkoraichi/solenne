import type * as React from 'react'

import { NavigationBasse } from './navigation-basse'

/**
 * Mise en page applicative : un en-tête discret, un contenu à largeur de lecture
 * bornée (UI-005) et la navigation basse toujours atteignable au pouce.
 */
export interface CoquilleAppProps {
  readonly titre: string
  readonly enTeteActions?: React.ReactNode
  readonly estAdministratrice: boolean
  readonly demandesEnAttente?: number
  readonly children: React.ReactNode
}

export function CoquilleApp({
  titre,
  enTeteActions,
  estAdministratrice,
  demandesEnAttente = 0,
  children,
}: CoquilleAppProps) {
  return (
    <div className="min-h-dvh bg-lin">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                   focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-[var(--radius-bouton)]
                   focus:bg-olive focus:px-5 focus:text-white"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-20 border-b border-lin-profond bg-lin/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="min-w-0 truncate font-titre text-2xl">{titre}</h1>
          {enTeteActions && (
            <div className="flex shrink-0 items-center gap-1">
              {enTeteActions}
            </div>
          )}
        </div>
      </header>

      <main
        id="contenu"
        className="mx-auto w-full max-w-3xl px-4 pb-[calc(var(--spacing-nav-basse)+1.5rem)] pt-5"
      >
        {children}
      </main>

      <NavigationBasse
        estAdministratrice={estAdministratrice}
        demandesEnAttente={demandesEnAttente}
      />
    </div>
  )
}
