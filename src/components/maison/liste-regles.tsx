import { ScrollText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { EtatVide } from '@/components/ui/etat-vide'
import type { RegleDeLaMaison } from '@/server/actions/regles'

/**
 * Les règles de la maison, côté ami.
 *
 * HOUSE-016 : les règles à accepter avant de venir sont marquées **et** par un
 * libellé, pas seulement par une couleur. HOUSE-017 : un texte de 5 000
 * caractères doit rester lisible en 320 px — d'où la césure des mots longs et
 * la conservation des retours à la ligne.
 */
export function ListeRegles({
  regles,
}: {
  readonly regles: readonly RegleDeLaMaison[]
}) {
  if (regles.length === 0) {
    return (
      <EtatVide
        titre="Aucune règle pour l’instant"
        texte="Solenne n’a rien écrit de particulier. Faites comme chez vous, presque."
        illustration={<ScrollText aria-hidden="true" className="size-10" />}
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {regles.map((regle) => (
        <li
          key={regle.id}
          className="flex flex-col gap-2 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 break-words font-titre text-lg text-encre">
              {regle.titre}
            </h4>
            {regle.acceptationObligatoire && (
              <Badge ton="contour">À accepter</Badge>
            )}
          </div>
          <p className="whitespace-pre-line break-words text-sm text-encre-doux">
            {regle.texte}
          </p>
        </li>
      ))}
    </ul>
  )
}
