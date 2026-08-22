import { Images } from 'lucide-react'

import { EtatVide } from '@/components/ui/etat-vide'

/**
 * La galerie de la maison, telle que la voient les amis.
 *
 * Non interactive à dessein : rien à cliquer, donc aucune cible tactile à
 * dimensionner. Les photos parlent d'elles-mêmes ; leur ordre et leur choix se
 * règlent dans la console de Solenne.
 */
export interface GaleriePhotosProps {
  readonly photos: readonly string[]
  readonly nomMaison: string
}

export function GaleriePhotos({ photos, nomMaison }: GaleriePhotosProps) {
  if (photos.length === 0) {
    return (
      <EtatVide
        titre="Les photos arrivent bientôt"
        texte="Solenne n’a pas encore déposé de photos de la maison."
        illustration={<Images aria-hidden="true" className="size-10" />}
      />
    )
  }

  return (
    <ul
      aria-label={`Photos de ${nomMaison}`}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {photos.map((photo) => (
        <li
          key={photo}
          className="overflow-hidden rounded-[var(--radius-carte)] border border-lin-profond bg-lin-profond"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- servie par /media, derrière session */}
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        </li>
      ))}
    </ul>
  )
}
