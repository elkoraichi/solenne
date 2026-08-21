import { TriangleAlert } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Bandeau d'erreur (UI-R4, CORE-R1).
 * N'affiche jamais qu'un message du catalogue : aucune pile d'appels, aucun
 * code technique, aucune requête. Le détail est parti au journal.
 */
export interface BandeauErreurProps
  extends React.HTMLAttributes<HTMLDivElement> {
  readonly message: string
  readonly action?: React.ReactNode
}

export function BandeauErreur({
  message,
  action,
  className,
  ...props
}: BandeauErreurProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-champ)] border border-terracotta/40',
        'bg-lin-fonce px-4 py-3 text-terracotta-fonce',
        className,
      )}
      {...props}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm font-medium">{message}</p>
        {action}
      </div>
    </div>
  )
}
