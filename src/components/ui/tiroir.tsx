'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Tiroir latéral — support du panneau de notifications ouvert depuis l'en-tête.
 * Sur mobile il occupe presque tout l'écran, sur grand écran une colonne.
 */
export interface TiroirProps {
  readonly titre: string
  readonly ouvert: boolean
  readonly onOuvertureChange: (ouvert: boolean) => void
  readonly children: React.ReactNode
  readonly className?: string
}

export function Tiroir({
  titre,
  ouvert,
  onOuvertureChange,
  children,
  className,
}: TiroirProps) {
  return (
    <Dialog.Root open={ouvert} onOpenChange={onOuvertureChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-encre/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-[min(24rem,100vw)] flex-col',
            'bg-lin shadow-relief',
            className,
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-lin-profond px-5 py-4">
            <Dialog.Title className="font-titre text-xl">{titre}</Dialog.Title>
            <Dialog.Description className="sr-only">{titre}</Dialog.Description>
            <Dialog.Close
              aria-label="Fermer"
              className="cible-tactile -mr-2 flex items-center justify-center rounded-full text-encre-doux hover:bg-lin-fonce"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
