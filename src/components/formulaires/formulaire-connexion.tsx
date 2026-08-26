'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import type { Echec } from '@/domain/core/result'
import { demanderReinitialisation } from '@/server/actions/mot-de-passe'
import { seConnecter } from '@/server/actions/auth'

/**
 * Écran 1 — connexion.
 *
 * « Mot de passe oublié » est un **état** de cet écran, pas une page : on ne
 * perd pas le contexte pour une adresse email déjà saisie.
 */
type Etape = 'connexion' | 'oubli' | 'oubli-envoye'

export function FormulaireConnexion() {
  const router = useRouter()
  const [etape, setEtape] = useState<Etape>('connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [echec, setEchec] = useState<Echec | null>(null)
  const [enCours, demarrer] = useTransition()

  function envoyerConnexion(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    demarrer(async () => {
      const resultat = await seConnecter({ email, motDePasse })
      if (resultat.ok) {
        router.replace('/')
        router.refresh()
      } else {
        setEchec(resultat)
      }
    })
  }

  function envoyerOubli(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    demarrer(async () => {
      const resultat = await demanderReinitialisation({ email })
      if (resultat.ok) setEtape('oubli-envoye')
      else setEchec(resultat)
    })
  }

  if (etape === 'oubli-envoye') {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="font-titre text-3xl">C’est envoyé</h1>
        <p className="text-encre-doux">
          Si un compte existe pour <strong>{email}</strong>, un lien vient d’y
          être adressé. Il est valable une heure.
        </p>
        <p className="text-sm text-encre-doux">
          Rien reçu ? Regardez dans les indésirables, puis réessayez.
        </p>
        <Bouton variante="secondaire" onClick={() => setEtape('connexion')}>
          Revenir à la connexion
        </Bouton>
      </section>
    )
  }

  const oubli = etape === 'oubli'

  return (
    <section className="flex flex-col gap-6">
      {!oubli && (
        // eslint-disable-next-line @next/next/no-img-element -- image statique hors pipeline photo (module SPACE), simple habillage de l'écran public
        <img
          src="/accueil-connexion.jpg"
          alt=""
          className="h-40 w-full rounded-2xl object-cover shadow-md"
        />
      )}
      <header className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl leading-tight">
          {oubli ? 'Mot de passe oublié' : 'Bienvenue chez Baby House'}
        </h1>
        <p className="text-encre-doux">
          {oubli
            ? 'Indiquez votre adresse : vous recevrez un lien pour en choisir un nouveau.'
            : 'Ce carnet est privé. On y entre sur invitation.'}
        </p>
      </header>

      {echec && <BandeauErreur message={echec.message} />}

      <form
        onSubmit={oubli ? envoyerOubli : envoyerConnexion}
        className="flex flex-col gap-4"
        noValidate
      >
        <Champ
          etiquette="Adresse email"
          nom="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          {...(echec?.champs?.email ? { erreur: echec.champs.email } : {})}
        />

        {!oubli && (
          <Champ
            etiquette="Mot de passe"
            nom="motDePasse"
            type="password"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
            {...(echec?.champs?.motDePasse
              ? { erreur: echec.champs.motDePasse }
              : {})}
          />
        )}

        <Bouton type="submit" taille="large" pleineLargeur disabled={enCours}>
          {enCours
            ? 'Un instant…'
            : oubli
              ? 'Envoyer le lien'
              : 'Se connecter'}
        </Bouton>
      </form>

      <Bouton
        variante="discret"
        onClick={() => {
          setEchec(null)
          setEtape(oubli ? 'connexion' : 'oubli')
        }}
      >
        {oubli ? 'Revenir à la connexion' : 'Mot de passe oublié ?'}
      </Bouton>
    </section>
  )
}
