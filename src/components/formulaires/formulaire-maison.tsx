'use client'

import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue-confirmation'
import { EtatVide } from '@/components/ui/etat-vide'
import { formaterPeriode } from '@/domain/core/dates'
import { TAILLE_MAX_MO } from '@/domain/core/images'
import { CAPACITE_MAX, CAPACITE_MIN } from '@/domain/house/capacite'
import { MAX_PHOTOS } from '@/domain/house/photos'
import type { Echec, Resultat } from '@/domain/core/result'
import {
  definirCouverture,
  impactCapacite,
  mettreAJourCapacite,
  mettreAJourMaison,
  reordonnerGalerie,
  retirerPhotoMaison,
  televerserPhotoMaison,
  type PeriodeConcernee,
  type VueMaison,
} from '@/server/actions/maison'

/** Console de Solenne — informations générales et galerie de la maison. */
export function FormulaireMaison({ maison }: { maison: VueMaison }) {
  const router = useRouter()
  const [nom, setNom] = useState(maison.nom)
  const [description, setDescription] = useState(maison.description ?? '')
  const [adresse, setAdresse] = useState(maison.adresse ?? '')
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [aRetirer, setARetirer] = useState<{ url: string; rang: number } | null>(
    null,
  )
  const [enCours, demarrer] = useTransition()
  const champFichier = useRef<HTMLInputElement>(null)

  function agir(appel: () => Promise<Resultat<unknown>>, message: string) {
    setEchec(null)
    setAnnonce(null)
    demarrer(async () => {
      const resultat = await appel()
      if (resultat.ok) {
        setAnnonce(message)
        router.refresh()
      } else {
        setEchec(resultat)
      }
    })
  }

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault()
    agir(
      () => mettreAJourMaison({ nom, description, adresse }),
      'Les informations de la maison sont enregistrées.',
    )
  }

  function envoyerPhoto(evenement: React.ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0]
    if (!fichier) return
    agir(() => televerserPhotoMaison(fichier), 'La photo est ajoutée.')
    if (champFichier.current) champFichier.current.value = ''
  }

  function deplacer(rang: number, sens: -1 | 1) {
    const urls = [...maison.photos]
    const voisin = rang + sens
    const ici = urls[rang]
    const la = urls[voisin]
    if (ici === undefined || la === undefined) return
    urls[rang] = la
    urls[voisin] = ici
    agir(() => reordonnerGalerie({ urls }), 'L’ordre des photos est enregistré.')
  }

  return (
    <div className="flex flex-col gap-8">
      <h2 className="font-titre text-2xl">La maison</h2>

      {echec && <BandeauErreur message={echec.message} />}
      {annonce && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {annonce}
        </p>
      )}

      <form onSubmit={enregistrer} className="flex flex-col gap-4" noValidate>
        <Champ
          etiquette="Nom affiché"
          nom="nom"
          required
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          aide="C’est ce que vos amis lisent en haut de la page."
          {...(echec?.champs?.nom ? { erreur: echec.champs.nom } : {})}
        />
        <ZoneTexte
          etiquette="Description"
          nom="description"
          rows={5}
          value={description}
          onChange={(evenement) => setDescription(evenement.target.value)}
          {...(echec?.champs?.description
            ? { erreur: echec.champs.description }
            : {})}
        />
        <Champ
          etiquette="Commune ou adresse"
          nom="adresse"
          value={adresse}
          onChange={(evenement) => setAdresse(evenement.target.value)}
          aide="Visible des seuls amis du cercle."
          {...(echec?.champs?.adresse ? { erreur: echec.champs.adresse } : {})}
        />
        <Bouton type="submit" pleineLargeur disabled={enCours}>
          {enCours ? 'Un instant…' : 'Enregistrer'}
        </Bouton>
      </form>

      <BlocCapacite maison={maison} />

      <section aria-labelledby="titre-photos" className="flex flex-col gap-4">
        <h3 id="titre-photos" className="font-titre text-xl">
          Photos
        </h3>

        {maison.photos.length === 0 ? (
          <EtatVide
            titre="Aucune photo pour l’instant"
            texte="La première photo ajoutée devient la photo d’accueil."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {maison.photos.map((photo, rang) => {
              const estCouverture = photo === maison.couverture
              return (
                <li
                  key={photo}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- servie par /media, derrière session */}
                  <img
                    src={photo}
                    alt=""
                    className="size-16 shrink-0 rounded-[var(--radius-champ)] object-cover"
                  />
                  <p className="min-w-0 flex-1 text-sm text-encre-doux">
                    Photo {rang + 1}
                    {estCouverture && (
                      <span className="block font-medium text-olive-fonce">
                        Photo d’accueil
                      </span>
                    )}
                  </p>

                  {/* En 320 px, les commandes passent à la ligne plutôt que
                      d'écraser le libellé. */}
                  <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Mettre la photo ${rang + 1} en accueil`}
                      aria-pressed={estCouverture}
                      disabled={enCours || estCouverture}
                      onClick={() =>
                        agir(
                          () => definirCouverture({ url: photo }),
                          'La photo d’accueil est changée.',
                        )
                      }
                    >
                      <Star aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Monter la photo ${rang + 1}`}
                      disabled={enCours || rang === 0}
                      onClick={() => deplacer(rang, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Descendre la photo ${rang + 1}`}
                      disabled={enCours || rang === maison.photos.length - 1}
                      onClick={() => deplacer(rang, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Retirer la photo ${rang + 1}`}
                      disabled={enCours}
                      onClick={() => setARetirer({ url: photo, rang })}
                    >
                      <Trash2 aria-hidden="true" className="text-terracotta" />
                    </Bouton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={enCours || maison.photos.length >= MAX_PHOTOS}
          onClick={() => champFichier.current?.click()}
        >
          <ImagePlus aria-hidden="true" />
          Ajouter une photo
        </Bouton>
        <p className="text-sm text-encre-doux">
          Une image, {TAILLE_MAX_MO} Mo maximum. {maison.photos.length} photo
          {maison.photos.length > 1 ? 's' : ''} sur {MAX_PHOTOS}.
        </p>
        <input
          ref={champFichier}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choisir une photo de la maison"
          onChange={envoyerPhoto}
        />
      </section>

      <DialogueConfirmation
        ouvert={aRetirer !== null}
        onOuvertureChange={(ouvert) => !ouvert && setARetirer(null)}
        titre="Retirer cette photo ?"
        objet={`La photo ${(aRetirer?.rang ?? 0) + 1} de la galerie`}
        consequence="elle sera effacée définitivement"
        libelleConfirmer="Retirer"
        enCours={enCours}
        onConfirmer={() => {
          const cible = aRetirer
          setARetirer(null)
          if (cible) {
            agir(
              () => retirerPhotoMaison({ url: cible.url }),
              'La photo est retirée.',
            )
          }
        }}
      />
    </div>
  )
}

/**
 * HOUSE-R1 → R3 — la capacité.
 *
 * Le chiffre qui gouverne toutes les acceptations de séjour a droit à son
 * propre bloc, séparé du reste : on ne le change pas par mégarde en corrigeant
 * une faute dans la description.
 */
function BlocCapacite({ maison }: { maison: VueMaison }) {
  const router = useRouter()
  const [capacite, setCapacite] = useState(String(maison.capaciteMax))
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [sejoursEnCause, setSejoursEnCause] = useState<
    readonly PeriodeConcernee[]
  >([])
  const [consequences, setConsequences] = useState<{
    readonly incompatibles: readonly PeriodeConcernee[]
    readonly rouvertes: readonly PeriodeConcernee[]
  } | null>(null)
  const [enCours, demarrer] = useTransition()

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    setAnnonce(null)
    setSejoursEnCause([])
    setConsequences(null)

    demarrer(async () => {
      const resultat = await mettreAJourCapacite({ capacite })

      if (resultat.ok) {
        setAnnonce(`La capacité est maintenant de ${capacite} personnes.`)
        setConsequences({
          incompatibles: resultat.data.demandesDevenuesIncompatibles,
          rouvertes: resultat.data.demandesRedevenuesPossibles,
        })
        router.refresh()
        return
      }

      setEchec(resultat)

      // HOUSE-007 : un refus sans la liste des séjours en cause laisserait
      // Solenne devant une porte close sans savoir quoi déplacer.
      if (resultat.code === 'CAPACITY_BELOW_OCCUPANCY') {
        const impact = await impactCapacite({ capacite })
        if (impact.ok) setSejoursEnCause(impact.data.sejoursEnCause)
      }
    })
  }

  return (
    <section aria-labelledby="titre-capacite" className="flex flex-col gap-4">
      <h3 id="titre-capacite" className="font-titre text-xl">
        Capacité d’accueil
      </h3>

      {echec && <BandeauErreur message={echec.message} />}
      {annonce && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {annonce}
        </p>
      )}

      {sejoursEnCause.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-champ)] border border-terracotta/40 bg-lin-fonce px-4 py-3">
          <p className="text-sm font-medium text-encre">
            Séjours à déplacer ou annuler d’abord :
          </p>
          <ul className="flex flex-col gap-1 text-sm text-encre-doux">
            {sejoursEnCause.map((sejour) => (
              <li key={sejour.id}>
                {sejour.qui} — {formaterPeriode(sejour.du, sejour.au)} —{' '}
                {sejour.personnes} personne{sejour.personnes > 1 ? 's' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {consequences && consequences.incompatibles.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-champ)] border border-bois-clair bg-lin-fonce px-4 py-3">
          <p className="text-sm font-medium text-encre">
            Ces demandes en attente ne tiennent plus dans la maison :
          </p>
          <ul className="flex flex-col gap-1 text-sm text-encre-doux">
            {consequences.incompatibles.map((demande) => (
              <li key={demande.id}>
                {demande.qui} — {formaterPeriode(demande.du, demande.au)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {consequences && consequences.rouvertes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3">
          <p className="text-sm font-medium text-encre">
            Ces demandes refusées redeviennent possibles :
          </p>
          <ul className="flex flex-col gap-1 text-sm text-encre-doux">
            {consequences.rouvertes.map((demande) => (
              <li key={demande.id}>
                {demande.qui} — {formaterPeriode(demande.du, demande.au)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
        <Champ
          etiquette="Nombre de personnes accueillies au maximum"
          nom="capacite"
          type="number"
          inputMode="numeric"
          min={CAPACITE_MIN}
          max={CAPACITE_MAX}
          step={1}
          value={capacite}
          onChange={(evenement) => setCapacite(evenement.target.value)}
          aide={`Entre ${CAPACITE_MIN} et ${CAPACITE_MAX}. C’est ce chiffre qui décide des séjours acceptés.`}
          {...(echec?.champs?.capacite ? { erreur: echec.champs.capacite } : {})}
        />
        <Bouton
          type="submit"
          variante="secondaire"
          disabled={enCours || capacite === String(maison.capaciteMax)}
        >
          Changer la capacité
        </Bouton>
      </form>
    </section>
  )
}
