import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * État vide (UI-R4, UI-007) : jamais une page blanche. Un mot chaleureux et,
 * quand c'est possible, l'action qui remplira l'écran.
 */
export interface EtatVideProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly titre: string
  readonly texte?: string
  readonly illustration?: React.ReactNode
  readonly action?: React.ReactNode
}

export function EtatVide({
  titre,
  texte,
  illustration,
  action,
  className,
  ...props
}: EtatVideProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-[var(--radius-carte)]',
        'border border-dashed border-bois-clair bg-lin-fonce px-6 py-10 text-center',
        className,
      )}
      {...props}
    >
      {illustration && (
        <div aria-hidden="true" className="text-bois">
          {illustration}
        </div>
      )}
      <h3 className="font-titre text-xl text-encre">{titre}</h3>
      {texte && (
        <p className="max-w-prose text-balance text-encre-doux">{texte}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
