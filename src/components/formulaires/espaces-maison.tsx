'use client'

import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Eye,
  EyeOff,
  ImagePlus,
  Laptop,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue-confirmation'
import { EtatVide } from '@/components/ui/etat-vide'
import { TAILLE_MAX_MO } from '@/domain/core/images'
import type { Echec, Resultat } from '@/domain/core/result'
import { CAPACITE_MAX } from '@/domain/house/capacite'
import {
  coherenceCouchages,
  MAX_PHOTOS_ESPACE,
  type TypeEspace,
} from '@/domain/house/espaces'
import {
  activerEspace,
  creerEspace,
  modifierEspace,
  reordonnerEspaces,
  reordonnerPhotosEspace,
  retirerPhotoEspace,
  televerserPhotoEspace,
  type EspaceDeLaMaison,
} from '@/server/actions/espaces'

/**
 * Console de Solenne — les chambres et les bureaux.
 *
 * `SPACE-R3` s'affiche ici, et nulle part ailleurs : un écart entre les
 * couchages et la capacité est une information, pas un refus. Aucun bouton
 * n'est désactivé à cause de lui.
 */
export function EspacesMaison({
  espaces,
  capaciteMax,
}: {
  readonly espaces: readonly EspaceDeLaMaison[]
  readonly capaciteMax: number
}) {
  const router = useRouter()
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [enEdition, setEnEdition] = useState<string | null>(null)
  const [nouveau, setNouveau] = useState(false)
  const [aRetirer, setARetirer] = useState<{
    readonly espace: EspaceDeLaMaison
    readonly url: string
    readonly rang: number
  } | null>(null)
  const [enCours, demarrer] = useTransition()

  const bilan = coherenceCouchages(
    espaces.map((espace) => ({
      type: espace.type,
      couchages: espace.couchages,
      active: espace.active,
    })),
    capaciteMax,
  )

  function agir(appel: () => Promise<Resultat<unknown>>, message: string) {
    setEchec(null)
    setAnnonce(null)
    demarrer(async () => {
      const resultat = await appel()
      if (resultat.ok) {
        setAnnonce(message)
        setEnEdition(null)
        setNouveau(false)
        router.refresh()
      } else {
        setEchec(resultat)
      }
    })
  }

  function deplacer(rang: number, sens: -1 | 1) {
    const ids = espaces.map((espace) => espace.id)
    const voisin = rang + sens
    const ici = ids[rang]
    const la = ids[voisin]
    if (ici === undefined || la === undefined) return
    ids[rang] = la
    ids[voisin] = ici
    agir(() => reordonnerEspaces({ ids }), 'L’ordre des espaces est enregistré.')
  }

  return (
    <section aria-labelledby="titre-espaces" className="flex flex-col gap-4">
      <h3 id="titre-espaces" className="font-titre text-xl">
        Chambres et bureaux
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

      {bilan.avertissement && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-bois-clair bg-lin-fonce px-4 py-3 text-sm text-encre-doux"
        >
          {bilan.avertissement}
        </p>
      )}

      {espaces.length === 0 && !nouveau && (
        <EtatVide
          titre="Aucun espace pour l’instant"
          texte="Décrivez les chambres et les bureaux : vos amis sauront où ils dorment."
        />
      )}

      {espaces.length > 0 && (
        <ul className="flex flex-col gap-3">
          {espaces.map((espace, rang) => (
            <li
              key={espace.id}
              className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4"
            >
              {enEdition === espace.id ? (
                <FormulaireEspace
                  espace={espace}
                  enCours={enCours}
                  echec={echec}
                  onAnnuler={() => setEnEdition(null)}
                  onValider={(valeurs) =>
                    agir(
                      () => modifierEspace({ id: espace.id, ...valeurs }),
                      'L’espace est enregistré.',
                    )
                  }
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {espace.type === 'ROOM' ? (
                      <BedDouble aria-hidden="true" className="size-4 shrink-0" />
                    ) : (
                      <Laptop aria-hidden="true" className="size-4 shrink-0" />
                    )}
                    <h4 className="min-w-0 flex-1 break-words font-titre text-lg">
                      {espace.nom}
                    </h4>
                    <Badge ton="contour">
                      {espace.type === 'ROOM' ? 'Chambre' : 'Bureau'}
                    </Badge>
                    {!espace.active && <Badge ton="neutre">En sommeil</Badge>}
                  </div>

                  <p className="text-sm text-encre-doux">
                    {espace.type === 'ROOM'
                      ? `${espace.typeDeLit ?? 'Couchage'} — ${espace.couchages} personne${espace.couchages > 1 ? 's' : ''}`
                      : (espace.equipements.join(' · ') || 'Aucun équipement')}
                  </p>

                  <GalerieEspace
                    espace={espace}
                    enCours={enCours}
                    onAjouter={(fichier) =>
                      agir(
                        () => televerserPhotoEspace({ id: espace.id }, fichier),
                        'La photo est ajoutée.',
                      )
                    }
                    onMettreEnAvant={(url) =>
                      agir(
                        () =>
                          reordonnerPhotosEspace({
                            id: espace.id,
                            urls: [
                              url,
                              ...espace.photos.filter((autre) => autre !== url),
                            ],
                          }),
                        'La photo passe en premier.',
                      )
                    }
                    onRetirer={(url, rangPhoto) =>
                      setARetirer({ espace, url, rang: rangPhoto })
                    }
                  />

                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Modifier « ${espace.nom} »`}
                      disabled={enCours}
                      onClick={() => setEnEdition(espace.id)}
                    >
                      <Pencil aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Monter « ${espace.nom} »`}
                      disabled={enCours || rang === 0}
                      onClick={() => deplacer(rang, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Descendre « ${espace.nom} »`}
                      disabled={enCours || rang === espaces.length - 1}
                      onClick={() => deplacer(rang, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={
                        espace.active
                          ? `Mettre « ${espace.nom} » en sommeil`
                          : `Réafficher « ${espace.nom} »`
                      }
                      disabled={enCours}
                      onClick={() =>
                        agir(
                          () =>
                            activerEspace({
                              id: espace.id,
                              active: !espace.active,
                            }),
                          espace.active
                            ? 'L’espace est en sommeil.'
                            : 'L’espace est de nouveau visible.',
                        )
                      }
                    >
                      {espace.active ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </Bouton>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {nouveau ? (
        <div className="rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4">
          <FormulaireEspace
            enCours={enCours}
            echec={echec}
            onAnnuler={() => setNouveau(false)}
            onValider={(valeurs) =>
              agir(() => creerEspace(valeurs), 'L’espace est ajouté.')
            }
          />
        </div>
      ) : (
        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={enCours}
          onClick={() => setNouveau(true)}
        >
          <Plus aria-hidden="true" />
          Ajouter une chambre ou un bureau
        </Bouton>
      )}

      <DialogueConfirmation
        ouvert={aRetirer !== null}
        onOuvertureChange={(ouvert) => !ouvert && setARetirer(null)}
        titre="Retirer cette photo ?"
        objet={`La photo ${(aRetirer?.rang ?? 0) + 1} de « ${aRetirer?.espace.nom ?? ''} »`}
        consequence="elle sera effacée définitivement"
        libelleConfirmer="Retirer"
        enCours={enCours}
        onConfirmer={() => {
          const cible = aRetirer
          setARetirer(null)
          if (cible) {
            agir(
              () => retirerPhotoEspace({ id: cible.espace.id, url: cible.url }),
              'La photo est retirée.',
            )
          }
        }}
      />
    </section>
  )
}

/** SPACE-008 — la galerie d'un espace, en petit. */
function GalerieEspace({
  espace,
  enCours,
  onAjouter,
  onMettreEnAvant,
  onRetirer,
}: {
  readonly espace: EspaceDeLaMaison
  readonly enCours: boolean
  readonly onAjouter: (fichier: File) => void
  readonly onMettreEnAvant: (url: string) => void
  readonly onRetirer: (url: string, rang: number) => void
}) {
  const champFichier = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-2">
      {espace.photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {espace.photos.map((photo, rang) => (
            <li key={photo} className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- servie par /media, derrière session */}
              <img
                src={photo}
                alt=""
                className="size-16 rounded-[var(--radius-champ)] object-cover"
              />
              <div className="flex items-center">
                <Bouton
                  variante="discret"
                  taille="icone"
                  aria-label={`Mettre la photo ${rang + 1} de « ${espace.nom} » en premier`}
                  aria-pressed={rang === 0}
                  disabled={enCours || rang === 0}
                  onClick={() => onMettreEnAvant(photo)}
                >
                  <Star aria-hidden="true" />
                </Bouton>
                <Bouton
                  variante="discret"
                  taille="icone"
                  aria-label={`Retirer la photo ${rang + 1} de « ${espace.nom} »`}
                  disabled={enCours}
                  onClick={() => onRetirer(photo, rang)}
                >
                  <Trash2 aria-hidden="true" className="text-terracotta" />
                </Bouton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Bouton
        variante="secondaire"
        disabled={enCours || espace.photos.length >= MAX_PHOTOS_ESPACE}
        onClick={() => champFichier.current?.click()}
      >
        <ImagePlus aria-hidden="true" />
        Ajouter une photo
      </Bouton>
      <p className="text-sm text-encre-doux">
        Une image, {TAILLE_MAX_MO} Mo maximum. {espace.photos.length} sur{' '}
        {MAX_PHOTOS_ESPACE}.
      </p>
      <input
        ref={champFichier}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={`Choisir une photo de « ${espace.nom} »`}
        onChange={(evenement) => {
          const fichier = evenement.target.files?.[0]
          if (fichier) onAjouter(fichier)
          if (champFichier.current) champFichier.current.value = ''
        }}
      />
    </div>
  )
}

interface ValeursEspace {
  readonly type: TypeEspace
  readonly nom: string
  readonly description: string
  readonly couchages: number
  readonly typeDeLit: string
  readonly equipements: readonly string[]
}

/**
 * SPACE-002 : le champ « couchages » n'existe pas pour un bureau — il n'est pas
 * grisé, il n'est pas là. Le refus serveur (`SPACE-R2`) reste, pour l'appel
 * forgé.
 */
function FormulaireEspace({
  espace,
  enCours,
  echec,
  onValider,
  onAnnuler,
}: {
  readonly espace?: EspaceDeLaMaison
  readonly enCours: boolean
  readonly echec: Echec | null
  readonly onValider: (valeurs: ValeursEspace) => void
  readonly onAnnuler: () => void
}) {
  const [type, setType] = useState<TypeEspace>(espace?.type ?? 'ROOM')
  const [nom, setNom] = useState(espace?.nom ?? '')
  const [description, setDescription] = useState(espace?.description ?? '')
  const [couchages, setCouchages] = useState(String(espace?.couchages ?? 2))
  const [typeDeLit, setTypeDeLit] = useState(espace?.typeDeLit ?? '')
  const [equipements, setEquipements] = useState(
    (espace?.equipements ?? []).join(', '),
  )

  const identifiant = espace?.id ?? 'nouveau'
  const estChambre = type === 'ROOM'

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(evenement) => {
        evenement.preventDefault()
        onValider({
          type,
          nom,
          description,
          couchages: estChambre ? Number(couchages) : 0,
          typeDeLit: estChambre ? typeDeLit : '',
          equipements: equipements
            .split(',')
            .map((equipement) => equipement.trim())
            .filter((equipement) => equipement.length > 0),
        })
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-encre">Type d’espace</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(
            [
              { valeur: 'ROOM', libelle: 'Chambre' },
              { valeur: 'OFFICE', libelle: 'Bureau' },
            ] as const
          ).map((choix) => (
            <label
              key={choix.valeur}
              className="flex min-h-11 flex-1 items-center gap-3 rounded-[var(--radius-champ)] border border-lin-profond px-3 text-sm text-encre"
            >
              <input
                type="radio"
                name={`type-${identifiant}`}
                className="size-5 accent-[var(--color-olive)]"
                checked={type === choix.valeur}
                onChange={() => setType(choix.valeur)}
              />
              {choix.libelle}
            </label>
          ))}
        </div>
      </fieldset>

      <Champ
        etiquette="Nom"
        nom={`nom-${identifiant}`}
        required
        value={nom}
        onChange={(evenement) => setNom(evenement.target.value)}
        {...(echec?.champs?.nom ? { erreur: echec.champs.nom } : {})}
      />

      {estChambre && (
        <>
          <Champ
            etiquette="Type de lit"
            nom={`lit-${identifiant}`}
            value={typeDeLit}
            onChange={(evenement) => setTypeDeLit(evenement.target.value)}
            aide="Par exemple : 1 lit double, ou 2 lits simples."
            {...(echec?.champs?.typeDeLit
              ? { erreur: echec.champs.typeDeLit }
              : {})}
          />
          <Champ
            etiquette="Nombre de couchages"
            nom={`couchages-${identifiant}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={CAPACITE_MAX}
            step={1}
            value={couchages}
            onChange={(evenement) => setCouchages(evenement.target.value)}
            {...(echec?.champs?.couchages
              ? { erreur: echec.champs.couchages }
              : {})}
          />
        </>
      )}

      <Champ
        etiquette="Équipements"
        nom={`equipements-${identifiant}`}
        value={equipements}
        onChange={(evenement) => setEquipements(evenement.target.value)}
        aide="Séparés par des virgules — écran, Wi-Fi, imprimante."
        {...(echec?.champs?.equipements
          ? { erreur: echec.champs.equipements }
          : {})}
      />

      <ZoneTexte
        etiquette="Description"
        nom={`description-${identifiant}`}
        rows={3}
        value={description}
        onChange={(evenement) => setDescription(evenement.target.value)}
        {...(echec?.champs?.description
          ? { erreur: echec.champs.description }
          : {})}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Bouton type="submit" disabled={enCours}>
          {enCours ? 'Un instant…' : 'Enregistrer'}
        </Bouton>
        <Bouton variante="secondaire" disabled={enCours} onClick={onAnnuler}>
          Annuler
        </Bouton>
      </div>
    </form>
  )
}
