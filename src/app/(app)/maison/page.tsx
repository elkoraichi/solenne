import { MapPin, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { GaleriePhotos } from '@/components/maison/galerie-photos'
import { ListeEspaces } from '@/components/maison/liste-espaces'
import { ListeRegles } from '@/components/maison/liste-regles'
import { PhotoCouverture } from '@/components/maison/photo-couverture'
import { Bouton } from '@/components/ui/bouton'
import { espacesDeLaMaison } from '@/server/actions/espaces'
import { maison } from '@/server/actions/maison'
import { reglesDeLaMaison } from '@/server/actions/regles'
import { estAdministratrice, utilisateurEventuel } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'La maison' }

/**
 * Écran « La maison », côté ami.
 *
 * Le nom affiché vient de la base, jamais d'un texte en dur : c'est une donnée,
 * Solenne la change quand elle veut.
 */
export default async function PageMaison() {
  const [utilisateur, resultat, espaces, regles] = await Promise.all([
    utilisateurEventuel(),
    maison(),
    espacesDeLaMaison(),
    reglesDeLaMaison(),
  ])
  if (!resultat.ok) notFound()

  const laMaison = resultat.data
  // La photo d'accueil est déjà en haut de page : la répéter en vignette
  // donnerait l'impression d'un doublon.
  const autresPhotos = laMaison.photos.filter(
    (photo) => photo !== laMaison.couverture,
  )

  return (
    <div className="flex flex-col gap-8">
      <PhotoCouverture url={laMaison.couverture} nomMaison={laMaison.nom} />

      <section className="flex flex-col gap-3">
        <h2 className="font-titre text-3xl leading-tight text-encre">
          {laMaison.nom}
        </h2>

        {laMaison.description && (
          <p className="whitespace-pre-line text-pretty text-encre-doux">
            {laMaison.description}
          </p>
        )}

        {laMaison.adresse && (
          <p className="flex items-start gap-2 text-sm text-bois">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{laMaison.adresse}</span>
          </p>
        )}
      </section>

      {laMaison.photos.length === 0 && (
        <GaleriePhotos photos={[]} nomMaison={laMaison.nom} />
      )}

      {autresPhotos.length > 0 && (
        <section aria-labelledby="titre-galerie" className="flex flex-col gap-3">
          <h3 id="titre-galerie" className="font-titre text-xl text-encre">
            En images
          </h3>
          <GaleriePhotos photos={autresPhotos} nomMaison={laMaison.nom} />
        </section>
      )}

      <section aria-labelledby="titre-espaces" className="flex flex-col gap-3">
        <h3 id="titre-espaces" className="font-titre text-xl text-encre">
          Chambres et bureaux
        </h3>
        {/* Un espace en sommeil n'arrive pas jusqu'ici : la Server Action ne
            l'envoie pas. Le filtre ci-dessous ne vaut que pour Solenne, qui
            reçoit tout pour pouvoir rouvrir une chambre depuis sa console. */}
        <ListeEspaces
          espaces={
            espaces.ok ? espaces.data.filter((espace) => espace.active) : []
          }
        />
      </section>

      <section aria-labelledby="titre-regles" className="flex flex-col gap-3">
        <h3 id="titre-regles" className="font-titre text-xl text-encre">
          Les règles de la maison
        </h3>
        {/* Un ami ne reçoit jamais les règles désactivées. Solenne, si — pour
            pouvoir les remettre. Cette page montre la maison telle qu'on la
            voit ; les règles en sommeil restent dans sa console. */}
        <ListeRegles
          regles={regles.ok ? regles.data.filter((regle) => regle.active) : []}
        />
      </section>

      {estAdministratrice(utilisateur) && (
        <Bouton asChild variante="secondaire" pleineLargeur>
          <Link href="/gerer/maison">
            <Pencil aria-hidden="true" />
            Modifier la maison
          </Link>
        </Bouton>
      )}
    </div>
  )
}
