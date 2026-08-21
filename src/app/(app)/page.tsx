import { CalendarDays, Leaf } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Bouton } from '@/components/ui/bouton'
import {
  Carte,
  CarteCorps,
  CarteMeta,
  CarteTitre,
  CarteVisuel,
} from '@/components/ui/carte'
import { EtatVide } from '@/components/ui/etat-vide'
import { requireUser } from '@/server/auth/garde'

/**
 * Accueil provisoire.
 *
 * Le vrai tableau de bord — prochain événement, prochain séjour, état de la
 * maison, demandes à traiter — arrive au lot 7 (`DASH`), quand il y aura de
 * quoi le remplir.
 */
export default async function Accueil() {
  const utilisateur = await requireUser('accueil')

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-titre text-2xl">
        Bonjour {utilisateur.firstName}
      </h2>

      <Carte>
        <CarteVisuel className="flex items-center justify-center bg-lin-profond">
          <Leaf aria-hidden="true" className="size-12 text-bois" />
        </CarteVisuel>
        <CarteCorps>
          <Badge ton="olive">Votre accès est ouvert</Badge>
          <CarteTitre>La maison se prépare</CarteTitre>
          <CarteMeta>
            L’agenda, les séjours et les événements arrivent aux prochains lots.
          </CarteMeta>
        </CarteCorps>
      </Carte>

      <EtatVide
        titre="Rien de prévu pour l’instant"
        texte="Les prochains événements et les séjours à venir s’afficheront ici."
        illustration={<CalendarDays aria-hidden="true" className="size-10" />}
        action={
          <Bouton variante="secondaire" disabled>
            Bientôt disponible
          </Bouton>
        }
      />
    </div>
  )
}
