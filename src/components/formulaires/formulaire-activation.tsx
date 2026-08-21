'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { LONGUEUR_MINIMALE } from '@/domain/core/mot-de-passe'
import type { Echec } from '@/domain/core/result'
import { activerInvitation } from '@/server/actions/invitations'

/**
 * Écran 2 — activation d'une invitation, en deux temps.
 *
 * Objectif du parcours A : moins de 90 secondes, entièrement au pouce. D'où
 * deux étapes courtes plutôt qu'un formulaire unique de huit champs.
 */
export function FormulaireActivation({
  jeton,
  email,
}: {
  jeton: string
  email: string
}) {
  const router = useRouter()
  const [etape, setEtape] = useState<1 | 2>(1)
  const [motDePasse, setMotDePasse] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [echec, setEchec] = useState<Echec | null>(null)
  const [enCours, demarrer] = useTransition()

  function passerAuProfil(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    if (motDePasse.length < LONGUEUR_MINIMALE) {
      setEchec({
        ok: false,
        code: 'PASSWORD_TOO_SHORT',
        message: `Le mot de passe doit faire au moins ${LONGUEUR_MINIMALE} caractères.`,
      })
      return
    }
    setEtape(2)
  }

  function terminer(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    demarrer(async () => {
      const resultat = await activerInvitation({
        jeton,
        motDePasse,
        prenom,
        nom,
        telephone,
      })
      if (resultat.ok) {
        router.replace('/')
        router.refresh()
      } else {
        setEchec(resultat)
        // Un défaut sur le mot de passe se corrige à l'étape 1.
        if (resultat.code.startsWith('PASSWORD_')) setEtape(1)
      }
    })
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl leading-tight">
          Solenne vous invite chez elle 🌿
        </h1>
        <p className="text-encre-doux">
          {etape === 1
            ? `Choisissez un mot de passe pour ${email}.`
            : 'Dernière étape : comment vous appelle-t-on ?'}
        </p>
        <p className="text-sm text-encre-doux">Étape {etape} sur 2</p>
      </header>

      {echec && <BandeauErreur message={echec.message} />}

      {etape === 1 ? (
        <form onSubmit={passerAuProfil} className="flex flex-col gap-4" noValidate>
          <Champ
            etiquette="Mot de passe"
            nom="motDePasse"
            type="password"
            autoComplete="new-password"
            required
            aide={`Au moins ${LONGUEUR_MINIMALE} caractères.`}
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
            {...(echec?.champs?.motDePasse
              ? { erreur: echec.champs.motDePasse }
              : {})}
          />
          <Bouton type="submit" taille="large" pleineLargeur>
            Continuer
          </Bouton>
        </form>
      ) : (
        <form onSubmit={terminer} className="flex flex-col gap-4" noValidate>
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
            aide="Facultatif."
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
          />
          <Champ
            etiquette="Téléphone"
            nom="telephone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aide="Facultatif — pour vous joindre le jour J."
            value={telephone}
            onChange={(evenement) => setTelephone(evenement.target.value)}
            {...(echec?.champs?.telephone
              ? { erreur: echec.champs.telephone }
              : {})}
          />
          <Bouton type="submit" taille="large" pleineLargeur disabled={enCours}>
            {enCours ? 'Un instant…' : 'Entrer dans la maison'}
          </Bouton>
          <Bouton variante="discret" onClick={() => setEtape(1)}>
            Revenir en arrière
          </Bouton>
        </form>
      )}
    </section>
  )
}
