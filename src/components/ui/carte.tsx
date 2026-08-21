import type * as React from 'react'

import { cn } from '@/lib/utils'

/** Grande carte photo — l'unité de base de l'interface (§20). */
export function Carte({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-carte)] bg-lin-fonce',
        'border border-lin-profond shadow-douce',
        className,
      )}
      {...props}
    />
  )
}

export function CarteVisuel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative aspect-[16/10] w-full overflow-hidden bg-lin-profond',
        className,
      )}
      {...props}
    />
  )
}

export function CarteCorps({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2 p-5', className)} {...props} />
}

export function CarteTitre({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      // UI-009 : un titre à rallonge se coupe proprement, la carte ne se déforme pas.
      className={cn(
        'font-titre text-xl leading-snug text-encre',
        'line-clamp-2 break-words',
        className,
      )}
      {...props}
    />
  )
}

export function CarteMeta({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-sm text-encre-doux break-words', className)}
      {...props}
    />
  )
}
