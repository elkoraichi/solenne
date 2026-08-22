import { BedDouble, Laptop } from 'lucide-react'

import { EtatVide } from '@/components/ui/etat-vide'
import type { EspaceDeLaMaison } from '@/server/actions/espaces'

/**
 * Les chambres et les bureaux, côté ami.
 *
 * Chambre et bureau doivent se distinguer sans lire l'étiquette : icône,
 * libellé et contenu diffèrent — un rendu en nuances de gris reste lisible.
 * Aucune interface d'affectation ici : `SPACE-R5` la remet à plus tard.
 */
export interface ListeEspacesProps {
  readonly espaces: readonly EspaceDeLaMaison[]
}

/** « 1 lit double — 2 personnes », la ligne qu'un ami lit d'un coup d'œil. */
export function descriptionCouchage(espace: EspaceDeLaMaison): string {
  const personnes = `${espace.couchages} personne${espace.couchages > 1 ? 's' : ''}`
  return espace.typeDeLit ? `${espace.typeDeLit} — ${personnes}` : personnes
}

export function ListeEspaces({ espaces }: ListeEspacesProps) {
  if (espaces.length === 0) {
    return (
      <EtatVide
        titre="Les pièces arrivent bientôt"
        texte="Solenne n’a pas encore décrit les chambres et les bureaux."
        illustration={<BedDouble aria-hidden="true" className="size-10" />}
      />
    )
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {espaces.map((espace) => {
        const estChambre = espace.type === 'ROOM'
        const photo = espace.photos[0]

        return (
          <li
            key={espace.id}
            className="flex flex-col overflow-hidden rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce"
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- servie par /media, derrière session
              <img
                src={photo}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              // Sans ce repli, la carte sans photo s'étirait à vide à côté de sa
              // voisine illustrée — visible dès 768 px, invisible aux mesures.
              <div className="flex aspect-[4/3] w-full items-center justify-center bg-lin-profond text-bois">
                {estChambre ? (
                  <BedDouble aria-hidden="true" className="size-8" />
                ) : (
                  <Laptop aria-hidden="true" className="size-8" />
                )}
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-1 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-bois">
                {estChambre ? (
                  <BedDouble aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <Laptop aria-hidden="true" className="size-4 shrink-0" />
                )}
                {estChambre ? 'Chambre' : 'Bureau'}
              </p>

              <h4 className="min-w-0 break-words font-titre text-lg text-encre">
                {espace.nom}
              </h4>

              {estChambre && (
                <p className="text-sm text-encre-doux">
                  {descriptionCouchage(espace)}
                </p>
              )}

              {espace.description && (
                <p className="whitespace-pre-line break-words text-sm text-encre-doux">
                  {espace.description}
                </p>
              )}

              {espace.equipements.length > 0 && (
                <p className="break-words text-sm text-encre-doux">
                  {espace.equipements.join(' · ')}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
