import { bandeDe, iconeDe, libelleDe } from '@/components/agenda/marques'
import {
  elementsDuJour,
  mouvementsDuJour,
  type ElementAgenda,
  type SemaineGrille,
} from '@/domain/calendar/grille'
import { formaterHeure, formaterJourLong } from '@/domain/core/dates'
import { cn } from '@/lib/utils'

/**
 * `CAL` — la vue Semaine : sept jours, l'un sous l'autre.
 *
 * Une semaine en colonnes horaires est une idée d'ordinateur de bureau. Ici
 * 90 % des consultations se font sur un téléphone : la semaine se lit donc
 * verticalement, un jour après l'autre, **sans défilement latéral**
 * (CAL-014).
 *
 * Le jour d'un départ n'affiche pas le séjour qui s'achève — il n'occupe plus
 * la maison — mais il annonce le départ (CAL-R3). Sans cela, une chambre
 * libérée le matin passerait pour occupée toute la journée.
 */
export function VueSemaine({
  semaine,
  elements,
}: {
  readonly semaine: SemaineGrille
  readonly elements: readonly ElementAgenda[]
}) {
  return (
    <ol aria-label="Jours de la semaine" className="flex flex-col gap-3">
      {semaine.jours.map((jour) => {
        const presents = elementsDuJour(elements, jour.jour)
        const { arrivees, departs } = mouvementsDuJour(elements, jour.jour)
        const arrivants = new Set(arrivees.map((element) => element.cle))

        return (
          <li
            key={jour.cle}
            data-testid={`semaine-${jour.cle}`}
            {...(jour.estAujourdhui ? { 'aria-current': 'date' as const } : {})}
            className={cn(
              'flex flex-col gap-2 rounded-[var(--radius-carte)] border p-4',
              jour.estAujourdhui
                ? 'border-terracotta/50 bg-lin-fonce'
                : 'border-lin-profond bg-lin',
            )}
          >
            <h4 className="font-titre text-base text-encre first-letter:uppercase">
              {formaterJourLong(jour.jour)}
            </h4>

            {presents.length === 0 && departs.length === 0 ? (
              <p className="text-sm text-encre-doux">
                La maison est libre ce jour-là.
              </p>
            ) : null}

            {presents.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {presents.map((element) => (
                  <li key={element.cle} className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full',
                        bandeDe(element.categorie),
                      )}
                    >
                      {(() => {
                        const Icone = iconeDe(element.categorie)
                        return <Icone aria-hidden="true" className="size-3" />
                      })()}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm text-encre">
                        <span className="sr-only">
                          {libelleDe(element.categorie)} —{' '}
                        </span>
                        {element.titre}
                        {arrivants.has(element.cle) ? (
                          <span className="text-encre-doux"> — arrivée</span>
                        ) : null}
                      </span>
                      {element.debut && element.fin ? (
                        <span className="text-xs text-encre-doux">
                          {formaterHeure(element.debut)} –{' '}
                          {formaterHeure(element.fin)}
                        </span>
                      ) : null}
                      {element.precision ? (
                        <span className="text-xs text-encre-doux">
                          {element.precision}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {departs.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {departs.map((element) => (
                  <li key={`depart-${element.cle}`} className="text-sm text-encre-doux">
                    Départ — {element.titre}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
