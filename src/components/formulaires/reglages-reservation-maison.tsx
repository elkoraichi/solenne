'use client'

import { CalendarClock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { ChoixRadio } from '@/components/ui/choix-radio'
import { formaterPeriode } from '@/domain/core/dates'
import type { Echec } from '@/domain/core/result'
import type { ReglagesReservation } from '@/domain/policy/reglages'
import {
  mettreAJourReglagesReservation,
  type DemandeSignalee,
} from '@/server/actions/reglages-reservation'
import { cn } from '@/lib/utils'

/**
 * Console de Solenne — les réglages de réservation (`POLICY`).
 *
 * Un seul bouton « Enregistrer » pour les huit réglages : contrairement à la
 * confidentialité (un choix, un clic, un effet immédiat), ces réglages se
 * combinent — POL-R9 les refuse ensemble s'ils se contredisent. Les valider
 * un par un donnerait à Solenne des refus qui n'ont de sens qu'une fois tous
 * les champs remplis.
 *
 * Un champ numérique vidé veut dire « désactivée » (POL-R2) : pas de case à
 * cocher séparée, la valeur porte elle-même son état — même parti que le
 * domaine (`src/domain/policy/reglages.ts`).
 */

const JOURS: readonly { readonly valeur: number; readonly libelle: string }[] = [
  { valeur: 1, libelle: 'Lun' },
  { valeur: 2, libelle: 'Mar' },
  { valeur: 3, libelle: 'Mer' },
  { valeur: 4, libelle: 'Jeu' },
  { valeur: 5, libelle: 'Ven' },
  { valeur: 6, libelle: 'Sam' },
  { valeur: 7, libelle: 'Dim' },
]

function versTexte(valeur: number | null): string {
  return valeur === null ? '' : String(valeur)
}

/** Vide → désactivée (`null`) ; sinon le nombre saisi, tel quel. */
function versNombreOuNull(texte: string): number | null {
  const nettoye = texte.trim()
  if (nettoye === '') return null
  const nombre = Number(nettoye)
  return Number.isFinite(nombre) ? nombre : Number.NaN
}

export function ReglagesReservationMaison({
  reglages,
}: {
  readonly reglages: ReglagesReservation
}) {
  const router = useRouter()
  const [dureeMaxNuits, setDureeMaxNuits] = useState(versTexte(reglages.dureeMaxNuits))
  const [delaiMinHeures, setDelaiMinHeures] = useState(versTexte(reglages.delaiMinHeures))
  const [horizonMaxJours, setHorizonMaxJours] = useState(versTexte(reglages.horizonMaxJours))
  const [maxPersonnesParDemande, setMaxPersonnesParDemande] = useState(
    versTexte(reglages.maxPersonnesParDemande),
  )
  const [joursInterdits, setJoursInterdits] = useState<readonly number[]>(
    reglages.joursArriveeInterdits,
  )
  const [cohabitationAutorisee, setCohabitationAutorisee] = useState(
    reglages.cohabitationAutorisee,
  )
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [signalees, setSignalees] = useState<readonly DemandeSignalee[]>([])
  const [enCours, demarrer] = useTransition()

  function basculerJour(jour: number) {
    setJoursInterdits((actuels) =>
      actuels.includes(jour)
        ? actuels.filter((j) => j !== jour)
        : [...actuels, jour],
    )
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault()
    setEchec(null)
    setAnnonce(null)
    setSignalees([])

    demarrer(async () => {
      const resultat = await mettreAJourReglagesReservation({
        dureeMaxNuits: versNombreOuNull(dureeMaxNuits),
        delaiMinHeures: versNombreOuNull(delaiMinHeures),
        horizonMaxJours: versNombreOuNull(horizonMaxJours),
        joursArriveeInterdits: joursInterdits,
        maxPersonnesParDemande: versNombreOuNull(maxPersonnesParDemande),
        cohabitationAutorisee,
      })

      if (!resultat.ok) {
        setEchec(resultat)
        return
      }

      setAnnonce('Les réglages de réservation sont enregistrés.')
      setSignalees(resultat.data.demandesDevenuesIncompatibles)
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="titre-reglages-reservation" className="flex flex-col gap-4">
      <h3
        id="titre-reglages-reservation"
        className="flex items-center gap-2 font-titre text-xl"
      >
        <CalendarClock aria-hidden="true" className="size-5 text-olive" />
        Réglages de réservation
      </h3>
      <p className="text-sm text-encre-doux">
        Ces réglages s’appliquent à vos amis. Vos propres séjours n’y sont
        jamais soumis.
      </p>

      {echec && <BandeauErreur message={echec.message} />}
      {annonce && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {annonce}
        </p>
      )}

      {signalees.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-champ)] border border-bois-clair bg-lin-fonce px-4 py-3">
          <p className="text-sm font-medium text-encre">
            Ces demandes en attente ne respectent plus les nouveaux réglages :
          </p>
          <ul className="flex flex-col gap-1 text-sm text-encre-doux">
            {signalees.map((demande) => (
              <li key={demande.id}>
                {demande.qui} — {formaterPeriode(demande.du, demande.au)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
        <Champ
          etiquette="Durée maximale d’un séjour (nuits)"
          nom="dureeMaxNuits"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={dureeMaxNuits}
          onChange={(evenement) => setDureeMaxNuits(evenement.target.value)}
          aide="Laissez vide pour n’imposer aucune durée maximale."
          {...(echec?.champs?.dureeMaxNuits
            ? { erreur: echec.champs.dureeMaxNuits }
            : {})}
        />
        <Champ
          etiquette="Délai minimum avant l’arrivée (heures)"
          nom="delaiMinHeures"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={delaiMinHeures}
          onChange={(evenement) => setDelaiMinHeures(evenement.target.value)}
          aide="Laissez vide pour accepter une demande à tout moment."
          {...(echec?.champs?.delaiMinHeures
            ? { erreur: echec.champs.delaiMinHeures }
            : {})}
        />
        <Champ
          etiquette="Horizon maximum de réservation (jours)"
          nom="horizonMaxJours"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={horizonMaxJours}
          onChange={(evenement) => setHorizonMaxJours(evenement.target.value)}
          aide="Laissez vide pour ne fixer aucune limite dans le temps."
          {...(echec?.champs?.horizonMaxJours
            ? { erreur: echec.champs.horizonMaxJours }
            : {})}
        />
        <Champ
          etiquette="Personnes maximum par demande"
          nom="maxPersonnesParDemande"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={maxPersonnesParDemande}
          onChange={(evenement) => setMaxPersonnesParDemande(evenement.target.value)}
          aide="Laissez vide pour ne pas limiter l’effectif d’une demande."
          {...(echec?.champs?.maxPersonnesParDemande
            ? { erreur: echec.champs.maxPersonnesParDemande }
            : {})}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-encre">
            Jours d’arrivée interdits
          </legend>
          <p className="text-sm text-encre-doux">
            Sélectionnez les jours où une arrivée n’est pas possible.
          </p>
          <div className="flex flex-wrap gap-2">
            {JOURS.map((jour) => {
              const interdit = joursInterdits.includes(jour.valeur)
              return (
                <Bouton
                  key={jour.valeur}
                  variante={interdit ? 'secondaire' : 'discret'}
                  aria-pressed={interdit}
                  disabled={enCours}
                  className={cn(
                    'min-w-16 border',
                    interdit
                      ? 'border-olive font-semibold text-olive-fonce'
                      : 'border-lin-profond',
                  )}
                  onClick={() => basculerJour(jour.valeur)}
                >
                  {jour.libelle}
                </Bouton>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-encre">Cohabitation</legend>
          <ChoixRadio
            nom="cohabitation"
            coche={cohabitationAutorisee}
            titre="Autorisée"
            description="Plusieurs séjours peuvent partager la maison en même temps."
            disabled={enCours}
            onChoisir={() => setCohabitationAutorisee(true)}
          />
          <ChoixRadio
            nom="cohabitation"
            coche={!cohabitationAutorisee}
            titre="Désactivée"
            description="Chaque séjour accepté privatise la maison sur ses dates."
            disabled={enCours}
            onChoisir={() => setCohabitationAutorisee(false)}
          />
        </fieldset>

        <Bouton type="submit" pleineLargeur disabled={enCours}>
          {enCours ? 'Un instant…' : 'Enregistrer les réglages'}
        </Bouton>
      </form>
    </section>
  )
}
