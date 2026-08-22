import { bandeDe, iconeDe, libelleDe } from '@/components/agenda/marques'
import { JOURS_DE_SEMAINE, type GrilleMois } from '@/domain/calendar/grille'
import { formaterJourLong } from '@/domain/core/dates'
import { cn } from '@/lib/utils'

/**
 * `CAL` — la vue Mois.
 *
 * Elle ne calcule aucune date : tout vient de `grilleDuMois`, y compris le
 * découpage des bandes aux frontières de semaine et le décompte des éléments
 * qui ne tiennent pas (CAL-009). Un écran qui recalculerait ses dates serait
 * une seconde occasion de se tromper d'un jour.
 *
 * Chaque bande porte **une icône, un mot de catégorie et un titre** : en
 * nuances de gris, rien n'est perdu (CAL-R4, CAL-015).
 */

const HAUTEUR_NUMERO = '1.75rem'
const HAUTEUR_BANDE = '1.125rem'
const HAUTEUR_RESTE = '0.875rem'

export function VueMois({
  grille,
  selection = null,
}: {
  readonly grille: GrilleMois
  /** Les jours en cours de sélection (`[du, au[`) — cliquer-glisser de Solenne. */
  readonly selection?: { readonly du: Date; readonly au: Date } | null
}) {
  const rangees = Math.max(
    1,
    ...grille.semaines.flatMap((semaine) =>
      semaine.segments.map((segment) => segment.rangee + 1),
    ),
  )
  const desMasques = grille.semaines.some((semaine) =>
    semaine.jours.some((jour) => jour.masques > 0),
  )
  const rienDuTout =
    !desMasques &&
    grille.semaines.every((semaine) => semaine.segments.length === 0)

  /**
   * La légende ne liste que ce que le mois contient : elle explique la grille
   * affichée, elle n'énumère pas un vocabulaire. En 320 px, c'est elle qui
   * porte les mots que les bandes n'ont plus la place d'écrire.
   */
  const categories = [
    ...new Set(
      grille.semaines.flatMap((semaine) =>
        semaine.segments.map((segment) => segment.element.categorie),
      ),
    ),
  ]

  const lignes = `${HAUTEUR_NUMERO} repeat(${rangees}, ${HAUTEUR_BANDE})${
    desMasques ? ` ${HAUTEUR_RESTE}` : ''
  }`

  return (
    <section aria-label={`Agenda de ${grille.libelle}`} className="flex flex-col gap-3">
      <h3 className="font-titre text-lg text-encre first-letter:uppercase">
        {grille.libelle}
      </h3>

      <div
        data-testid="grille"
        className="-mx-4 overflow-hidden border-y border-lin-profond sm:mx-0 sm:rounded-[var(--radius-carte)] sm:border"
      >
        <div
          aria-hidden="true"
          className="grid grid-cols-7 bg-lin-fonce text-center text-[0.6875rem] text-encre-doux"
        >
          {JOURS_DE_SEMAINE.map((nom) => (
            <span key={nom} className="py-1.5">
              {nom}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-px bg-lin-profond">
          {grille.semaines.map((semaine) => (
            <div
              key={semaine.cle}
              className="grid grid-cols-7 gap-px"
              style={{ gridTemplateRows: lignes }}
            >
              {semaine.jours.map((jour, colonne) => {
                const choisi =
                  selection !== null &&
                  selection.du.getTime() <= jour.jour.getTime() &&
                  jour.jour.getTime() < selection.au.getTime()

                return (
                <div
                  key={jour.cle}
                  data-jour={jour.cle}
                  data-testid={`jour-${jour.cle}`}
                  {...(jour.estAujourdhui ? { 'aria-current': 'date' as const } : {})}
                  {...(choisi ? { 'data-choisi': 'oui' } : {})}
                  className={cn(
                    'flex flex-col px-1 pb-0.5 pt-1',
                    jour.dansLeMois ? 'bg-lin' : 'bg-lin-fonce/70',
                    choisi && 'bg-terracotta/15 inset-ring-2 inset-ring-terracotta',
                  )}
                  style={{ gridColumn: colonne + 1, gridRow: '1 / -1' }}
                >
                  <span className="sr-only">{formaterJourLong(jour.jour)}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'text-[0.75rem] leading-none',
                      jour.dansLeMois ? 'text-encre' : 'text-encre-doux/60',
                      jour.estAujourdhui &&
                        'inline-flex size-5 items-center justify-center self-start rounded-full bg-terracotta font-semibold text-white',
                    )}
                  >
                    {jour.numero}
                  </span>
                  {jour.masques > 0 ? (
                    <span className="mt-auto text-[0.625rem] leading-none text-encre-doux">
                      +{jour.masques}
                    </span>
                  ) : null}
                </div>
                )
              })}

              {semaine.segments.map((segment) => {
                const Icone = iconeDe(segment.element.categorie)
                return (
                  <div
                    key={`${semaine.cle}-${segment.element.cle}`}
                    className={cn(
                      'z-10 mx-px flex items-center gap-1 overflow-hidden px-1 text-[0.625rem] leading-none',
                      bandeDe(segment.element.categorie),
                      segment.continueAvant ? 'rounded-l-none' : 'rounded-l-full',
                      segment.continueApres ? 'rounded-r-none' : 'rounded-r-full',
                    )}
                    style={{
                      gridColumn: `${segment.colonne} / span ${segment.longueur}`,
                      gridRow: segment.rangee + 2,
                    }}
                  >
                    <Icone
                      aria-hidden="true"
                      className="size-2.5 shrink-0 max-sm:mx-auto"
                    />
                    <span className="sr-only">
                      {libelleDe(segment.element.categorie)} —{' '}
                    </span>
                    {/* En 320 px, une case fait 45 px : un titre y tiendrait
                        sur trois lettres et des points de suspension. L'icône
                        et la couleur suffisent, la légende dit le reste. */}
                    <span className="sr-only sm:not-sr-only sm:truncate">
                      {segment.element.titre}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {categories.length > 0 ? (
        <ul
          aria-label="Légende"
          className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-encre-doux"
        >
          {categories.map((categorie) => {
            const Icone = iconeDe(categorie)
            return (
              <li key={categorie} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-4 items-center justify-center rounded-full',
                    bandeDe(categorie),
                  )}
                >
                  <Icone className="size-2.5" />
                </span>
                {libelleDe(categorie)}
              </li>
            )
          })}
        </ul>
      ) : null}

      {rienDuTout ? (
        <p className="text-sm text-encre-doux">
          La maison est libre tout le mois. Vous pourrez bientôt y demander un
          séjour.
        </p>
      ) : null}
    </section>
  )
}
