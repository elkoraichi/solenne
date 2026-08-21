import { CalendarDays, Leaf } from 'lucide-react'
import { notFound } from 'next/navigation'

import { CoquilleApp } from '@/components/layout/coquille-app'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import {
  Carte,
  CarteCorps,
  CarteMeta,
  CarteTitre,
  CarteVisuel,
} from '@/components/ui/carte'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { EtatVide } from '@/components/ui/etat-vide'
import { CATALOGUE_MESSAGES } from '@/domain/core/messages'
import { SqueletteCarte } from '@/components/ui/squelette'

/**
 * Vitrine du vocabulaire visuel.
 *
 * Elle n'existe qu'en développement : c'est le support de la validation visuelle
 * de Yassine (limite L2) et des tests de rendu en 320 / 768 / 1440 px, tant que
 * les 12 écrans de l'application n'existent pas encore.
 */
export default function Vitrine() {
  if (process.env.NODE_ENV === 'production') notFound()

  const titreTresLong =
    'Anniversaire de Léa, week-end prolongé avec baignades, grande tablée sous le tilleul et brunch tardif le dimanche matin'

  return (
    <CoquilleApp
      titre="Vitrine"
      estAdministratrice
      demandesEnAttente={2}
      enTeteActions={<Avatar nom="Solenne Marchand" taille="petite" />}
    >
      <div className="flex flex-col gap-10">
        <section aria-labelledby="section-boutons" className="flex flex-col gap-3">
          <h2 id="section-boutons" className="font-titre text-xl">
            Boutons
          </h2>
          <div className="flex flex-wrap gap-2">
            <Bouton>Demander un séjour</Bouton>
            <Bouton variante="secondaire">Modifier</Bouton>
            <Bouton variante="discret">Voir le détail</Bouton>
            <Bouton variante="destructeur">Annuler le séjour</Bouton>
            <Bouton disabled>Indisponible</Bouton>
          </div>
          <Bouton taille="large" pleineLargeur>
            Envoyer la demande
          </Bouton>
        </section>

        <section aria-labelledby="section-badges" className="flex flex-col gap-3">
          <h2 id="section-badges" className="font-titre text-xl">
            Badges
          </h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Maison occupée</Badge>
            <Badge ton="olive">Confirmé</Badge>
            <Badge ton="terracotta">À traiter</Badge>
            <Badge ton="bois">2 nuits</Badge>
            <Badge ton="contour">Privatisé</Badge>
          </div>
        </section>

        <section aria-labelledby="section-cartes" className="flex flex-col gap-3">
          <h2 id="section-cartes" className="font-titre text-xl">
            Cartes
          </h2>
          <Carte>
            <CarteVisuel className="flex items-center justify-center">
              <Leaf aria-hidden="true" className="size-12 text-bois" />
            </CarteVisuel>
            <CarteCorps>
              <Badge ton="olive">Dans 3 semaines</Badge>
              <CarteTitre>{titreTresLong}</CarteTitre>
              <CarteMeta>
                Du 12 au 14 septembre · 6 personnes attendues
              </CarteMeta>
            </CarteCorps>
          </Carte>
          <SqueletteCarte />
        </section>

        <section aria-labelledby="section-formulaire" className="flex flex-col gap-3">
          <h2 id="section-formulaire" className="font-titre text-xl">
            Formulaire
          </h2>
          <Champ
            etiquette="Adresse email"
            nom="email-vitrine"
            type="email"
            placeholder="prenom@exemple.fr"
            aide="Elle sert uniquement à vous prévenir."
          />
          <Champ
            etiquette="Nombre d’adultes"
            nom="adultes-vitrine"
            type="number"
            defaultValue={2}
            erreur="Il faut au moins un adulte."
          />
          <ZoneTexte
            etiquette="Un mot pour Solenne"
            nom="commentaire-vitrine"
            placeholder="On arrive vendredi en fin de journée…"
          />
        </section>

        <section aria-labelledby="section-etats" className="flex flex-col gap-3">
          <h2 id="section-etats" className="font-titre text-xl">
            États
          </h2>
          <BandeauErreur message={CATALOGUE_MESSAGES.INTERNAL} />
          <BandeauErreur message={CATALOGUE_MESSAGES.BLOCKED_PERIOD} />
          <EtatVide
            titre="Aucun séjour pour l’instant"
            texte="Vos demandes et vos séjours s’afficheront ici."
            illustration={<CalendarDays aria-hidden="true" className="size-10" />}
            action={<Bouton variante="secondaire">Demander un séjour</Bouton>}
          />
        </section>

        <section aria-labelledby="section-avatars" className="flex flex-col gap-3">
          <h2 id="section-avatars" className="font-titre text-xl">
            Avatars
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar nom="Solenne Marchand" taille="petite" />
            <Avatar nom="Marc Delaunay" />
            <Avatar nom="Léa Fournier" taille="grande" />
            <Avatar nom="Photo cassée" url="/image-inexistante.jpg" />
          </div>
        </section>
      </div>
    </CoquilleApp>
  )
}
