'use client'

import { CalendarClock, CheckCircle2, CircleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { CaseACocher } from '@/components/ui/case-a-cocher'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { EtatVide } from '@/components/ui/etat-vide'
import { formaterPeriode } from '@/domain/core/dates'
import type { Echec } from '@/domain/core/result'
import {
  accepterDemandeSejour,
  contreProposerDemandeSejour,
  rejeterDemandeSejour,
  verifierDecisionSejour,
} from '@/server/actions/decisions-sejour'
import type {
  DemandeEnAttenteVue,
  VerdictDecisionVue,
} from '@/server/actions/decisions-sejour'

/**
 * `STAYDEC-B` — la file d'attente de Solenne (`STAYDEC-013`) et l'écran de
 * décision (`STAYDEC-002`/`003`/`004`/`007`/`008`).
 *
 * Le verdict de chaque demande n'est chargé qu'à l'ouverture (`verifierDecisionSejour`,
 * lecture seule) — inutile de rejouer `AVAIL` pour des demandes que Solenne ne
 * regarde pas. La décision réelle passe par l'écriture correspondante
 * (`accepterDemandeSejour`, `rejeterDemandeSejour`, `contreProposerDemandeSejour`),
 * qui revalide tout elle-même (SDEC-R2) : le verdict affiché ici n'est qu'un
 * aperçu, jamais une donnée que l'écriture réutilise.
 */

type Panneau = 'accepter' | 'refuser' | 'proposer' | null

export function FileAttenteDecisions({
  demandes,
}: {
  readonly demandes: readonly DemandeEnAttenteVue[]
}) {
  const router = useRouter()
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [verdicts, setVerdicts] = useState<Record<string, VerdictDecisionVue>>({})
  const [panneau, setPanneau] = useState<Panneau>(null)
  const [message, setMessage] = useState('')
  const [motif, setMotif] = useState('')
  const [confirme, setConfirme] = useState(false)
  const [nouvelleArrivee, setNouvelleArrivee] = useState('')
  const [nouveauDepart, setNouveauDepart] = useState('')
  const [echec, setEchec] = useState<Echec | null>(null)
  const [enCours, demarrer] = useTransition()

  function reinitialiserPanneau() {
    setPanneau(null)
    setEchec(null)
    setMessage('')
    setMotif('')
    setConfirme(false)
    setNouvelleArrivee('')
    setNouveauDepart('')
  }

  function ouvrir(id: string) {
    if (ouverte === id) {
      setOuverte(null)
      return
    }
    setOuverte(id)
    reinitialiserPanneau()
    if (!verdicts[id]) {
      void verifierDecisionSejour({ id }).then((resultat) => {
        if (resultat.ok) setVerdicts((actuels) => ({ ...actuels, [id]: resultat.data }))
      })
    }
  }

  function accepter(id: string) {
    setEchec(null)
    demarrer(async () => {
      const resultat = await accepterDemandeSejour({
        id,
        message: message || undefined,
        ...(confirme ? { confirme: true } : {}),
      })
      if (!resultat.ok) {
        setEchec(resultat)
        return
      }
      setOuverte(null)
      router.refresh()
    })
  }

  function refuser(id: string) {
    setEchec(null)
    demarrer(async () => {
      const resultat = await rejeterDemandeSejour({ id, motif })
      if (!resultat.ok) {
        setEchec(resultat)
        return
      }
      setOuverte(null)
      router.refresh()
    })
  }

  function proposer(id: string) {
    setEchec(null)
    demarrer(async () => {
      const resultat = await contreProposerDemandeSejour({
        id,
        arrivee: nouvelleArrivee,
        depart: nouveauDepart,
        message: message || undefined,
      })
      if (!resultat.ok) {
        setEchec(resultat)
        return
      }
      setOuverte(null)
      router.refresh()
    })
  }

  if (demandes.length === 0) {
    return (
      <EtatVide
        titre="Aucune demande en attente"
        texte="Les nouvelles demandes de séjour apparaîtront ici."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {demandes.map((demande) => {
        const estOuverte = ouverte === demande.id
        const verdict = verdicts[demande.id]
        const personnes = demande.adultes + demande.enfants

        return (
          <li
            key={demande.id}
            className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-white p-4 shadow-doux"
          >
            <button
              type="button"
              onClick={() => ouvrir(demande.id)}
              className="cible-tactile flex w-full flex-wrap items-center justify-between gap-2 text-left"
              aria-expanded={estOuverte}
            >
              <div>
                <p className="font-titre text-lg text-encre">
                  {demande.requesterPrenom} ·{' '}
                  {formaterPeriode(demande.arrivee, demande.depart)}
                </p>
                <p className="text-sm text-encre-doux">
                  {personnes} personne{personnes > 1 ? 's' : ''}
                  {demande.exclusif ? ' · maison privatisée' : ''}
                </p>
              </div>
              <CalendarClock aria-hidden="true" className="size-5 shrink-0 text-bois" />
            </button>

            {estOuverte && (
              <div className="flex flex-col gap-4 border-t border-lin-profond pt-3">
                {echec && <BandeauErreur message={echec.message} />}

                {!verdict ? (
                  <p className="text-sm text-encre-doux">Vérification en cours…</p>
                ) : (
                  <div
                    role="status"
                    className={
                      verdict.compatible
                        ? 'flex items-start gap-3 rounded-[var(--radius-champ)] border border-olive/40 bg-lin-fonce px-4 py-3 text-encre'
                        : 'flex items-start gap-3 rounded-[var(--radius-champ)] border border-terracotta/40 bg-lin-fonce px-4 py-3 text-terracotta-fonce'
                    }
                  >
                    {verdict.compatible ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-5 shrink-0 text-olive-fonce"
                      />
                    ) : (
                      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                    )}
                    <div className="flex flex-col gap-1 text-sm">
                      {verdict.compatible ? (
                        <p className="font-medium">
                          Compatible — {verdict.occupationAvecDemande} personnes sur{' '}
                          {verdict.capacite}
                        </p>
                      ) : (
                        verdict.conflits.map((conflit) => (
                          <p key={conflit.code} className="font-medium">
                            {conflit.message}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {panneau === null && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Bouton pleineLargeur onClick={() => setPanneau('accepter')}>
                      Accepter
                    </Bouton>
                    <Bouton
                      variante="secondaire"
                      pleineLargeur
                      onClick={() => setPanneau('proposer')}
                    >
                      Proposer d’autres dates
                    </Bouton>
                    <Bouton
                      variante="destructeur"
                      pleineLargeur
                      onClick={() => setPanneau('refuser')}
                    >
                      Refuser
                    </Bouton>
                  </div>
                )}

                {panneau === 'accepter' && (
                  <div className="flex flex-col gap-3">
                    <ZoneTexte
                      etiquette="Mot d’accueil (facultatif)"
                      nom={`message-${demande.id}`}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    {verdict && !verdict.compatible && verdict.confirmationSuffirait && (
                      <CaseACocher
                        nom={`confirme-${demande.id}`}
                        coche={confirme}
                        titre="J’accepte malgré ce conflit"
                        onChanger={setConfirme}
                      />
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Bouton
                        pleineLargeur
                        disabled={
                          enCours ||
                          (!!verdict &&
                            !verdict.compatible &&
                            verdict.confirmationSuffirait &&
                            !confirme)
                        }
                        onClick={() => accepter(demande.id)}
                      >
                        {enCours ? 'Envoi…' : 'Confirmer l’acceptation'}
                      </Bouton>
                      <Bouton
                        variante="secondaire"
                        pleineLargeur
                        disabled={enCours}
                        onClick={reinitialiserPanneau}
                      >
                        Précédent
                      </Bouton>
                    </div>
                  </div>
                )}

                {panneau === 'refuser' && (
                  <div className="flex flex-col gap-3">
                    <ZoneTexte
                      etiquette="Motif du refus"
                      nom={`motif-${demande.id}`}
                      required
                      value={motif}
                      onChange={(e) => setMotif(e.target.value)}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Bouton
                        variante="destructeur"
                        pleineLargeur
                        disabled={enCours || motif.trim().length === 0}
                        onClick={() => refuser(demande.id)}
                      >
                        {enCours ? 'Envoi…' : 'Confirmer le refus'}
                      </Bouton>
                      <Bouton
                        variante="secondaire"
                        pleineLargeur
                        disabled={enCours}
                        onClick={reinitialiserPanneau}
                      >
                        Précédent
                      </Bouton>
                    </div>
                  </div>
                )}

                {panneau === 'proposer' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="flex-1">
                        <Champ
                          etiquette="Nouvelle arrivée"
                          nom={`arrivee-${demande.id}`}
                          type="date"
                          value={nouvelleArrivee}
                          onChange={(e) => setNouvelleArrivee(e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <Champ
                          etiquette="Nouveau départ"
                          nom={`depart-${demande.id}`}
                          type="date"
                          value={nouveauDepart}
                          onChange={(e) => setNouveauDepart(e.target.value)}
                        />
                      </div>
                    </div>
                    <ZoneTexte
                      etiquette="Un mot pour expliquer (facultatif)"
                      nom={`message-proposition-${demande.id}`}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Bouton
                        pleineLargeur
                        disabled={enCours || !nouvelleArrivee || !nouveauDepart}
                        onClick={() => proposer(demande.id)}
                      >
                        {enCours ? 'Envoi…' : 'Envoyer la proposition'}
                      </Bouton>
                      <Bouton
                        variante="secondaire"
                        pleineLargeur
                        disabled={enCours}
                        onClick={reinitialiserPanneau}
                      >
                        Précédent
                      </Bouton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
