'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Feuille modale : sur mobile elle monte du bas, sur grand écran elle se centre.
 * C'est le support des panneaux superposés du §5 — détail d'un séjour, réponse
 * rapide à un RSVP, acceptation des règles — pour ne jamais perdre le contexte.
 */

export interface FeuilleProps {
  readonly titre: string
  readonly description?: string
  readonly ouverte: boolean
  readonly onOuvertureChange: (ouverte: boolean) => void
  readonly children: React.ReactNode
  readonly piedDePage?: React.ReactNode
  readonly className?: string
}

export function Feuille({
  titre,
  description,
  ouverte,
  onOuvertureChange,
  children,
  piedDePage,
  className,
}: FeuilleProps) {
  return (
    <Dialog.Root open={ouverte} onOpenChange={onOuvertureChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-encre/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-white text-encre shadow-relief',
            // Mobile : feuille basse, hauteur bornée, coins arrondis en haut.
            'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[var(--radius-feuille)]',
            // Grand écran : boîte centrée.
            'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2',
            'sm:w-[min(34rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-[var(--radius-feuille)]',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="font-titre text-2xl leading-tight">
                {titre}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-encre-doux">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  {titre}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Fermer"
              className="cible-tactile -mr-2 -mt-2 flex items-center justify-center rounded-full text-encre-doux hover:bg-lin-fonce"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {piedDePage && (
            <div className="zone-sure-basse border-t border-lin-profond px-6 py-4">
              {piedDePage}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
