'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Champ de formulaire : étiquette, saisie, aide et message d'erreur liés entre
 * eux par `aria-describedby` — la lecture d'écran annonce l'erreur du champ,
 * pas seulement sa présence.
 */

export interface ChampProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly etiquette: string
  readonly nom: string
  readonly aide?: string
  readonly erreur?: string
}

export function Champ({
  etiquette,
  nom,
  aide,
  erreur,
  className,
  ...props
}: ChampProps) {
  const idAide = aide ? `${nom}-aide` : undefined
  const idErreur = erreur ? `${nom}-erreur` : undefined
  const description = [idAide, idErreur].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nom} className="text-sm font-medium text-encre">
        {etiquette}
      </label>
      <input
        id={nom}
        name={nom}
        aria-describedby={description}
        aria-invalid={erreur ? true : undefined}
        className={cn(
          'min-h-11 w-full rounded-[var(--radius-champ)] border bg-white px-4 text-base text-encre',
          'placeholder:text-encre-doux/70',
          'transition-colors focus:border-olive-fonce',
          erreur ? 'border-terracotta' : 'border-lin-profond',
          className,
        )}
        {...props}
      />
      {aide && !erreur && (
        <p id={idAide} className="text-sm text-encre-doux">
          {aide}
        </p>
      )}
      {erreur && (
        <p
          id={idErreur}
          role="alert"
          className="text-sm font-medium text-terracotta-fonce"
        >
          {erreur}
        </p>
      )}
    </div>
  )
}

export interface ZoneTexteProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  readonly etiquette: string
  readonly nom: string
  readonly aide?: string
  readonly erreur?: string
}

export function ZoneTexte({
  etiquette,
  nom,
  aide,
  erreur,
  className,
  ...props
}: ZoneTexteProps) {
  const idAide = aide ? `${nom}-aide` : undefined
  const idErreur = erreur ? `${nom}-erreur` : undefined
  const description = [idAide, idErreur].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nom} className="text-sm font-medium text-encre">
        {etiquette}
      </label>
      <textarea
        id={nom}
        name={nom}
        rows={4}
        aria-describedby={description}
        aria-invalid={erreur ? true : undefined}
        className={cn(
          'w-full rounded-[var(--radius-champ)] border bg-white px-4 py-3 text-base text-encre',
          'placeholder:text-encre-doux/70',
          'transition-colors focus:border-olive-fonce',
          erreur ? 'border-terracotta' : 'border-lin-profond',
          className,
        )}
        {...props}
      />
      {aide && !erreur && (
        <p id={idAide} className="text-sm text-encre-doux">
          {aide}
        </p>
      )}
      {erreur && (
        <p
          id={idErreur}
          role="alert"
          className="text-sm font-medium text-terracotta-fonce"
        >
          {erreur}
        </p>
      )}
    </div>
  )
}
