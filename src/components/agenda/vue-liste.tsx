import { DoorClosed } from 'lucide-react'

import { bandeDe, iconeDe, libelleDe } from '@/components/agenda/marques'
import { EtatVide } from '@/components/ui/etat-vide'
import type { ElementAgenda } from '@/domain/calendar/grille'
import { formaterPeriode } from '@/domain/core/dates'
import { cn } from '@/lib/utils'

/**
 * `CAL` — la vue Liste : ce qui vient, dans l'ordre.
 *
 * Elle lit **les mêmes éléments** que la vue Mois. Deux vues alimentées par
 * deux chemins de données finiraient par ne plus dire la même chose, et l'une
 * des deux finirait par en dire trop.
 *
 * Rien n'est masqué ici : le composant ne reçoit que ce que `PRIV` a bien voulu
 * envoyer. Une bande « Maison occupée » n'a ni nom, ni effectif, ni motif — pas
 * parce qu'on les cache, mais parce qu'ils ne sont jamais arrivés jusque-là.
 */
export function VueListe({
  elements,
}: {
  readonly elements: readonly ElementAgenda[]
}) {
  const ordonnes = [...elements].sort(
    (a, b) => a.du.getTime() - b.du.getTime() || a.cle.localeCompare(b.cle),
  )

  if (ordonnes.length === 0) {
    return (
      <EtatVide
        titre="Rien de prévu pour l’instant"
        texte="La maison est libre sur les semaines à venir. Vous pourrez bientôt y demander un séjour."
        illustration={<DoorClosed aria-hidden="true" className="size-10" />}
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {ordonnes.map((element) => {
        const Icone = iconeDe(element.categorie)
        return (
          <li
            key={element.cle}
            className="flex items-start gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4"
          >
            <Icone aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-bois" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-medium text-encre">{element.titre}</p>
              <p className="text-sm text-encre-doux">
                {formaterPeriode(element.du, element.au)}
                {element.precision ? ` — ${element.precision}` : ''}
              </p>
              <span
                className={cn(
                  'inline-flex self-start rounded-[var(--radius-champ)] px-3 py-1 text-sm font-medium',
                  bandeDe(element.categorie),
                )}
              >
                {libelleDe(element.categorie)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
