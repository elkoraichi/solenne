import type { LucideIcon } from 'lucide-react'

import { EtatVide } from './etat-vide'

/**
 * Écran encore à construire.
 *
 * Il existe pour que la navigation basse ne mène nulle part à vide : un onglet
 * qui renvoie une page introuvable donne l'impression d'une application cassée.
 */
export function PageAVenir({
  titre,
  texte,
  icone: Icone,
  lot,
}: {
  titre: string
  texte: string
  icone: LucideIcon
  lot: string
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-titre text-2xl">{titre}</h2>
      <EtatVide
        titre="Cet écran arrive bientôt"
        texte={texte}
        illustration={<Icone aria-hidden="true" className="size-10" />}
      />
      <p className="text-center text-sm text-encre-doux">Prévu au {lot}.</p>
    </div>
  )
}
