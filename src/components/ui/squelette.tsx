import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Squelette de chargement (UI-R4, UI-008).
 * Il occupe exactement la place du contenu à venir : aucun saut de mise en page
 * au moment où les données arrivent.
 */
export function Squelette({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-[var(--radius-menu)] bg-lin-profond',
        className,
      )}
      {...props}
    />
  )
}

/** Squelette d'une grande carte photo. */
export function SqueletteCarte() {
  return (
    <div
      role="status"
      aria-label="Chargement en cours"
      className="overflow-hidden rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce"
    >
      <Squelette className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Squelette className="h-6 w-3/4" />
        <Squelette className="h-4 w-1/2" />
      </div>
      <span className="sr-only">Chargement en cours…</span>
    </div>
  )
}
