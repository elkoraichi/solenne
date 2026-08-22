import { Trees } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Photo d'accueil de la maison.
 *
 * HOUSE-012 : sans photo, on pose un aplat de lin et un arbre discret. Jamais
 * une balise `img` vide, qui donnerait l'icône d'image brisée du navigateur.
 */
export interface PhotoCouvertureProps {
  readonly url: string | null
  readonly nomMaison: string
  readonly className?: string
}

export function PhotoCouverture({
  url,
  nomMaison,
  className,
}: PhotoCouvertureProps) {
  return (
    <div
      className={cn(
        'relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-carte)]',
        'border border-lin-profond bg-lin-profond shadow-douce sm:aspect-[2/1]',
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- servie par /media, derrière session : pas d'optimisation Next
        <img
          src={url}
          alt={nomMaison}
          className="size-full object-cover"
          fetchPriority="high"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Trees aria-hidden="true" className="size-12 text-bois-clair" />
        </div>
      )}
    </div>
  )
}
