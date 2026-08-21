'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { LONGUEUR_MINIMALE } from '@/domain/core/mot-de-passe'
import type { Echec } from '@/domain/core/result'
import { seDeconnecter } from '@/server/actions/auth'
import { changerMotDePasse } from '@/server/actions/mot-de-passe'
import {
  demanderChangementEmail,
  mettreAJourProfil,
  televerserPhoto,
  type MonProfil,
} from '@/server/actions/profil'
import { TAILLE_MAX_MO } from '@/domain/core/images'

/** Écran 10 — profil. Chacun ne modifie que le sien (PROF-R1). */
export function FormulaireProfil({ profil }: { profil: MonProfil }) {
  const router = useRouter()
  const [prenom, setPrenom] = useState(profil.prenom)
  const [nom, setNom] = useState(profil.nom ?? '')
  const [telephone, setTelephone] = useState(profil.telephone ?? '')
  const [nombreEnfants, setNombreEnfants] = useState(
    String(profil.nombreEnfants),
  )
  const [avatarUrl, setAvatarUrl] = useState(profil.avatarUrl)
  const [echec, setEchec] = useState<Echec | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()
  const champFichier = useRef<HTMLInputElement>(null)

  function annoncer(message: string) {
    setEchec(null)
    setConfirmation(message)
    router.refresh()
  }

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    setConfirmation(null)
    demarrer(async () => {
      const resultat = await mettreAJourProfil({
        prenom,
        nom,
        telephone,
        nombreEnfants: Number(nombreEnfants) || 0,
      })
      if (resultat.ok) annoncer('Vos informations sont enregistrées.')
      else setEchec(resultat)
    })
  }

  function envoyerPhoto(evenement: React.ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0]
    if (!fichier) return
    setEchec(null)
    setConfirmation(null)
    demarrer(async () => {
      const resultat = await televerserPhoto(fichier)
      if (resultat.ok) {
        setAvatarUrl(resultat.data.avatarUrl)
        annoncer('Votre photo est à jour.')
      } else {
        setEchec(resultat)
      }
      if (champFichier.current) champFichier.current.value = ''
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <h2 className="font-titre text-2xl">Votre profil</h2>

      {echec && <BandeauErreur message={echec.message} />}
      {confirmation && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {confirmation}
        </p>
      )}

      <section aria-labelledby="titre-photo" className="flex items-center gap-4">
        <h3 id="titre-photo" className="sr-only">
          Photo
        </h3>
        <Avatar nom={prenom} url={avatarUrl} taille="grande" />
        <div className="flex flex-col gap-1">
          <Bouton
            variante="secondaire"
            onClick={() => champFichier.current?.click()}
            disabled={enCours}
          >
            Changer la photo
          </Bouton>
          <p className="text-sm text-encre-doux">
            Une image, {TAILLE_MAX_MO} Mo maximum.
          </p>
          <input
            ref={champFichier}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Choisir une photo"
            onChange={envoyerPhoto}
          />
        </div>
      </section>

      <form onSubmit={enregistrer} className="flex flex-col gap-4" noValidate>
        <Champ
          etiquette="Prénom"
          nom="prenom"
          autoComplete="given-name"
          required
          value={prenom}
          onChange={(evenement) => setPrenom(evenement.target.value)}
          {...(echec?.champs?.prenom ? { erreur: echec.champs.prenom } : {})}
        />
        <Champ
          etiquette="Nom"
          nom="nom"
          autoComplete="family-name"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          {...(echec?.champs?.nom ? { erreur: echec.champs.nom } : {})}
        />
        <Champ
          etiquette="Téléphone"
          nom="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telephone}
          onChange={(evenement) => setTelephone(evenement.target.value)}
          {...(echec?.champs?.telephone
            ? { erreur: echec.champs.telephone }
            : {})}
        />
        <Champ
          etiquette="Nombre d’enfants"
          nom="nombreEnfants"
          type="number"
          min={0}
          max={20}
          value={nombreEnfants}
          onChange={(evenement) => setNombreEnfants(evenement.target.value)}
          {...(echec?.champs?.nombreEnfants
            ? { erreur: echec.champs.nombreEnfants }
            : {})}
        />
        <Bouton type="submit" pleineLargeur disabled={enCours}>
          {enCours ? 'Un instant…' : 'Enregistrer'}
        </Bouton>
      </form>

      <BlocEmail profil={profil} surSucces={annoncer} surEchec={setEchec} />
      <BlocMotDePasse surSucces={annoncer} surEchec={setEchec} />

      <form
        action={async () => {
          await seDeconnecter()
          router.replace('/connexion')
          router.refresh()
        }}
      >
        <Bouton type="submit" variante="secondaire" pleineLargeur>
          <LogOut aria-hidden="true" />
          Se déconnecter
        </Bouton>
      </form>
    </div>
  )
}

function BlocEmail({
  profil,
  surSucces,
  surEchec,
}: {
  profil: MonProfil
  surSucces: (message: string) => void
  surEchec: (echec: Echec) => void
}) {
  const [nouvelEmail, setNouvelEmail] = useState('')
  const [enCours, demarrer] = useTransition()

  return (
    <section aria-labelledby="titre-email" className="flex flex-col gap-3">
      <h3 id="titre-email" className="font-titre text-xl">
        Adresse email
      </h3>
      <p className="text-sm text-encre-doux">
        Actuellement <strong>{profil.email}</strong>.
        {profil.changementEmailEnAttente
          ? ` Un changement vers ${profil.changementEmailEnAttente} attend votre confirmation.`
          : ' Un changement demande une confirmation par lien.'}
      </p>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(evenement) => {
          evenement.preventDefault()
          demarrer(async () => {
            const resultat = await demanderChangementEmail({ nouvelEmail })
            if (resultat.ok) {
              setNouvelEmail('')
              surSucces('Un lien de confirmation vient d’être envoyé.')
            } else {
              surEchec(resultat)
            }
          })
        }}
      >
        <Champ
          etiquette="Nouvelle adresse"
          nom="nouvelEmail"
          type="email"
          inputMode="email"
          value={nouvelEmail}
          onChange={(evenement) => setNouvelEmail(evenement.target.value)}
        />
        <Bouton
          type="submit"
          variante="secondaire"
          disabled={enCours || nouvelEmail.length === 0}
        >
          Demander le changement
        </Bouton>
      </form>
    </section>
  )
}

function BlocMotDePasse({
  surSucces,
  surEchec,
}: {
  surSucces: (message: string) => void
  surEchec: (echec: Echec) => void
}) {
  const [ancien, setAncien] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [enCours, demarrer] = useTransition()

  return (
    <section aria-labelledby="titre-mot-de-passe" className="flex flex-col gap-3">
      <h3 id="titre-mot-de-passe" className="font-titre text-xl">
        Mot de passe
      </h3>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(evenement) => {
          evenement.preventDefault()
          demarrer(async () => {
            const resultat = await changerMotDePasse({ ancien, nouveau })
            if (resultat.ok) {
              setAncien('')
              setNouveau('')
              surSucces(
                'Mot de passe changé. Vos autres appareils ont été déconnectés.',
              )
            } else {
              surEchec(resultat)
            }
          })
        }}
      >
        <Champ
          etiquette="Mot de passe actuel"
          nom="ancien"
          type="password"
          autoComplete="current-password"
          value={ancien}
          onChange={(evenement) => setAncien(evenement.target.value)}
        />
        <Champ
          etiquette="Nouveau mot de passe"
          nom="nouveau"
          type="password"
          autoComplete="new-password"
          aide={`Au moins ${LONGUEUR_MINIMALE} caractères.`}
          value={nouveau}
          onChange={(evenement) => setNouveau(evenement.target.value)}
        />
        <Bouton
          type="submit"
          variante="secondaire"
          disabled={enCours || ancien.length === 0 || nouveau.length === 0}
        >
          Changer le mot de passe
        </Bouton>
      </form>
    </section>
  )
}
