import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/** UI-R2 : toutes les tailles respectent 44 px de haut minimum. */
const styles = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-bouton)]',
    'font-medium whitespace-nowrap',
    'transition-colors duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:size-5 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variante: {
        principal: 'bg-olive text-white hover:bg-olive-fonce',
        secondaire:
          'bg-lin-fonce text-encre hover:bg-lin-profond border border-lin-profond',
        discret: 'bg-transparent text-olive-fonce hover:bg-lin-fonce',
        destructeur: 'bg-terracotta text-white hover:bg-terracotta-fonce',
      },
      taille: {
        normale: 'min-h-11 px-5 text-base',
        large: 'min-h-13 px-7 text-lg',
        icone: 'min-h-11 min-w-11 p-0',
      },
      pleineLargeur: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variante: 'principal',
      taille: 'normale',
      pleineLargeur: false,
    },
  },
)

export interface BoutonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof styles> {
  /** Rend l'élément enfant au lieu d'un `<button>` (pour un lien, par exemple). */
  asChild?: boolean
}

export function Bouton({
  className,
  variante,
  taille,
  pleineLargeur,
  asChild = false,
  type,
  ...props
}: BoutonProps) {
  const Composant = asChild ? Slot : 'button'
  return (
    <Composant
      className={cn(styles({ variante, taille, pleineLargeur }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  )
}

export const stylesBouton = styles
