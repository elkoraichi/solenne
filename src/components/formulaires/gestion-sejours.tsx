'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { CaseACocher } from '@/components/ui/case-a-cocher'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { EtatVide } from '@/components/ui/etat-vide'
import { CAPACITE_MAX } from '@/domain/house/capacite'
import { formaterPeriode } from '@/domain/core/dates'
import type { Echec } from '@/domain/core/result'
import {
  annulerSejourParSolenne,
  creerSejourPersonnel,
  type SejourAdminVue,
  type SuggestionLiberationVue,
} from '@/server/actions/sejours'

/**
 * `STAY-002` / `STAY-005` / `STAY-006` / `STAY-010` — le pan admin, dans la
 * console `/gerer` (`DASH` est reporté en vague 2, comme `P9` l'a déjà
 * tranché pour les blocages).
 */

const LIBELLES_STATUT: Record<SejourAdminVue['statut'], string> = {
  CONFIRMED: 'Confirmé',
  CANCELLED: 'Annulé',
  COMPLETED: 'Terminé',
}

const TONS_STATUT: Record<
  SejourAdminVue['statut'],
  'neutre' | 'olive' | 'terracotta' | 'bois'
> = {
  CONFIRMED: 'olive',
  CANCELLED: 'terracotta',
  COMPLETED: 'neutre',
}

interface EtatCreation {
  readonly arrivee: string
  readonly depart: string
  readonly adultes: number
  readonly enfants: number
  readonly exclusif: boolean
}

const VALEURS_INITIALES: EtatCreation = {
  arrivee: '',
  depart: '',
  adultes: 1,
  enfants: 0,
  exclusif: false,
}

export function GestionSejours({
  sejours,
  suggestions,
}: {
  readonly sejours: readonly SejourAdminVue[]
  readonly suggestions: readonly SuggestionLiberationVue[]
}) {
  const router = useRouter()
  const [valeurs, setValeurs] = useState<EtatCreation>(VALEURS_INITIALES)
  const [echecCreation, setEchecCreation] = useState<Echec | null>(null)
  const [enCoursCreation, demarrerCreation] = useTransition()

  const [aAnnuler, setAAnnuler] = useState<string | null>(null)
  const [motif, setMotif] = useState('')
  const [echecAnnulation, setEchecAnnulation] = useState<Echec | null>(null)
  const [enCoursAnnulation, demarrerAnnulation] = useTransition()

  function definir<K extends keyof EtatCreation>(champ: K, valeur: EtatCreation[K]) {
    setValeurs((precedent) => ({ ...precedent, [champ]: valeur }))
  }

  function creer() {
    setEchecCreation(null)
    demarrerCreation(async () => {
      const resultat = await creerSejourPersonnel(valeurs)
      if (!resultat.ok) {
        setEchecCreation(resultat)
        return
      }
      setValeurs(VALEURS_INITIALES)
      router.refresh()
    })
  }

  function ouvrirAnnulation(id: string) {
    setAAnnuler(id)
    setMotif('')
    setEchecAnnulation(null)
  }

  function confirmerAnnulation() {
    const id = aAnnuler
    if (!id) return
    demarrerAnnulation(async () => {
      const resultat = await annulerSejourParSolenne({ id, motif })
      if (!resultat.ok) {
        setEchecAnnulation(resultat)
        return
      }
      setAAnnuler(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-white p-4 shadow-doux">
        <h3 className="font-titre text-xl text-encre">Créer un séjour</h3>
        {echecCreation && <BandeauErreur message={echecCreation.message} />}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Champ
              etiquette="Arrivée"
              nom="arrivee-personnel"
              type="date"
              required
              value={valeurs.arrivee}
              onChange={(e) => definir('arrivee', e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Champ
              etiquette="Départ"
              nom="depart-personnel"
              type="date"
              required
              value={valeurs.depart}
              onChange={(e) => definir('depart', e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Champ
              etiquette="Adultes"
              nom="adultes-personnel"
              type="number"
              inputMode="numeric"
              min={1}
              max={CAPACITE_MAX}
              step={1}
              value={valeurs.adultes}
              onChange={(e) => definir('adultes', Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <Champ
              etiquette="Enfants"
              nom="enfants-personnel"
              type="number"
              inputMode="numeric"
              min={0}
              max={CAPACITE_MAX}
              step={1}
              value={valeurs.enfants}
              onChange={(e) => definir('enfants', Number(e.target.value))}
            />
          </div>
        </div>
        <CaseACocher
          nom="exclusif-personnel"
          coche={valeurs.exclusif}
          titre="Privatiser la maison sur ces dates"
          onChanger={(coche) => definir('exclusif', coche)}
        />
        <Bouton
          pleineLargeur
          disabled={enCoursCreation || !valeurs.arrivee || !valeurs.depart}
          onClick={creer}
        >
          {enCoursCreation ? 'Création…' : 'Créer ce séjour'}
        </Bouton>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-carte)] border border-olive bg-lin-fonce p-4">
          <h3 className="font-titre text-xl text-encre">Ces dates se libèrent</h3>
          <ul className="flex flex-col gap-1">
            {suggestions.map((suggestion) => (
              <li key={suggestion.requestId} className="text-sm text-encre-doux">
                {formaterPeriode(suggestion.arrivee, suggestion.depart)} — prévenir{' '}
                {suggestion.requesterPrenom} ?
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-titre text-xl text-encre">Séjours à venir</h3>
        {sejours.length === 0 ? (
          <EtatVide titre="Aucun séjour" texte="Les séjours confirmés apparaîtront ici." />
        ) : (
          <ul className="flex flex-col gap-3">
            {sejours.map((sejour) => (
              <li
                key={sejour.id}
                className="flex flex-col gap-2 rounded-[var(--radius-carte)] border border-lin-profond bg-white p-4 shadow-doux"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-titre text-lg text-encre">
                    {sejour.proprietairePrenom} · {formaterPeriode(sejour.arrivee, sejour.depart)}
                  </p>
                  <Badge ton={TONS_STATUT[sejour.statut]}>{LIBELLES_STATUT[sejour.statut]}</Badge>
                </div>
                <p className="text-sm text-encre-doux">
                  {sejour.adultes + sejour.enfants} personne
                  {sejour.adultes + sejour.enfants > 1 ? 's' : ''}
                  {sejour.exclusif ? ' · maison privatisée' : ''}
                </p>

                {sejour.statut === 'CONFIRMED' && aAnnuler !== sejour.id && (
                  <Bouton
                    variante="secondaire"
                    disabled={enCoursAnnulation}
                    onClick={() => ouvrirAnnulation(sejour.id)}
                  >
                    Annuler ce séjour
                  </Bouton>
                )}

                {aAnnuler === sejour.id && (
                  <div className="flex flex-col gap-3">
                    {echecAnnulation && <BandeauErreur message={echecAnnulation.message} />}
                    <ZoneTexte
                      etiquette="Motif de l’annulation"
                      nom={`motif-${sejour.id}`}
                      required
                      value={motif}
                      onChange={(e) => setMotif(e.target.value)}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Bouton
                        variante="destructeur"
                        pleineLargeur
                        disabled={enCoursAnnulation || motif.trim().length === 0}
                        onClick={confirmerAnnulation}
                      >
                        {enCoursAnnulation ? 'Envoi…' : 'Confirmer l’annulation'}
                      </Bouton>
                      <Bouton
                        variante="secondaire"
                        pleineLargeur
                        disabled={enCoursAnnulation}
                        onClick={() => setAAnnuler(null)}
                      >
                        Précédent
                      </Bouton>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
