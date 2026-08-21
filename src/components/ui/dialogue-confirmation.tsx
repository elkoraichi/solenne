'use client'

import * as Dialog from '@radix-ui/react-dialog'
import type * as React from 'react'

import { Bouton } from './bouton'

/**
 * UI-R5 / UI-011 : toute action destructive passe par une confirmation qui
 * **nomme l'objet supprimé**. « Supprimer cet élément ? » ne suffit pas.
 */
export interface DialogueConfirmationProps {
  readonly ouvert: boolean
  readonly onOuvertureChange: (ouvert: boolean) => void
  readonly titre: string
  /** Nom exact de ce qui va disparaître : il est affiché tel quel. */
  readonly objet: string
  readonly consequence?: string
  readonly libelleConfirmer?: string
  readonly onConfirmer: () => void
  readonly enCours?: boolean
}

export function DialogueConfirmation({
  ouvert,
  onOuvertureChange,
  titre,
  objet,
  consequence,
  libelleConfirmer = 'Supprimer',
  onConfirmer,
  enCours = false,
}: DialogueConfirmationProps) {
  return (
    <Dialog.Root open={ouvert} onOpenChange={onOuvertureChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-encre/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))]
                     -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-feuille)]
                     bg-white p-6 text-encre shadow-relief"
        >
          <Dialog.Title className="font-titre text-2xl leading-tight">
            {titre}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-encre-doux">
            <span className="font-medium text-encre">{objet}</span>
            {consequence ? ` — ${consequence}` : null}
          </Dialog.Description>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Bouton variante="secondaire" disabled={enCours}>
                Annuler
              </Bouton>
            </Dialog.Close>
            <Bouton
              variante="destructeur"
              onClick={onConfirmer}
              disabled={enCours}
            >
              {libelleConfirmer}
            </Bouton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
