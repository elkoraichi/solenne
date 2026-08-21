import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const styles = cva(
  'inline-flex items-center gap-1.5 rounded-[var(--radius-champ)] px-3 py-1 text-sm font-medium',
  {
    variants: {
      ton: {
        neutre: 'bg-lin-profond text-encre',
        olive: 'bg-olive text-white',
        terracotta: 'bg-terracotta text-white',
        bois: 'bg-bois text-white',
        contour: 'border border-bois text-bois',
      },
    },
    defaultVariants: { ton: 'neutre' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof styles> {}

export function Badge({ className, ton, ...props }: BadgeProps) {
  return <span className={cn(styles({ ton }), className)} {...props} />
}
