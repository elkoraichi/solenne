'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { LONGUEUR_MINIMALE } from '@/domain/core/mot-de-passe'
import type { Echec } from '@/domain/core/result'
import { reinitialiserMotDePasse } from '@/server/actions/mot-de-passe'

export function FormulaireNouveauMotDePasse({ jeton }: { jeton: string }) {
  const router = useRouter()
  const [motDePasse, setMotDePasse] = useState('')
  const [echec, setEchec] = useState<Echec | null>(null)
  const [fait, setFait] = useState(false)
  const [enCours, demarrer] = useTransition()

  function envoyer(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    demarrer(async () => {
      const resultat = await reinitialiserMotDePasse({ jeton, motDePasse })
      if (resultat.ok) {
        setFait(true)
        router.refresh()
      } else {
        setEchec(resultat)
      }
    })
  }

  if (fait) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="font-titre text-3xl">Mot de passe changé</h1>
        <p className="text-encre-doux">
          Pour votre sécurité, vos autres appareils ont été déconnectés.
        </p>
        <Bouton asChild taille="large" pleineLargeur>
          <Link href="/connexion">Se connecter</Link>
        </Bouton>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl leading-tight">
          Choisir un nouveau mot de passe
        </h1>
        <p className="text-encre-doux">
          Au moins {LONGUEUR_MINIMALE} caractères. Une phrase que vous seule
          connaissez vaut mieux qu’un mot compliqué.
        </p>
      </header>

      {echec && (
        <BandeauErreur
          message={echec.message}
          action={
            echec.code === 'RESET_LINK_EXPIRED' || echec.code === 'INVALID_TOKEN' ? (
              <Bouton variante="secondaire" asChild>
                <Link href="/connexion">Recommencer la demande</Link>
              </Bouton>
            ) : null
          }
        />
      )}

      <form onSubmit={envoyer} className="flex flex-col gap-4" noValidate>
        <Champ
          etiquette="Nouveau mot de passe"
          nom="motDePasse"
          type="password"
          autoComplete="new-password"
          required
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
          {...(echec?.champs?.motDePasse
            ? { erreur: echec.champs.motDePasse }
            : {})}
        />
        <Bouton type="submit" taille="large" pleineLargeur disabled={enCours}>
          {enCours ? 'Un instant…' : 'Enregistrer'}
        </Bouton>
      </form>
    </section>
  )
}
