'use client'

import { CalendarCheck, CircleAlert, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { CaseACocher } from '@/components/ui/case-a-cocher'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import type { ResultatDisponibilite } from '@/domain/availability/conflits'
import { formaterPeriode, jour } from '@/domain/core/dates'
import type { Echec } from '@/domain/core/result'
import { CAPACITE_MAX } from '@/domain/house/capacite'
import {
  creerDemandeSejour,
  verifierDisponibiliteSejour,
} from '@/server/actions/demandes-sejour'
import type { RegleDeLaMaison } from '@/server/actions/regles'

/**
 * `STAYREQ-B` — l'assistant en 3 étapes (dates → participants → informations).
 *
 * `STAYREQ-010` : la disponibilité se revérifie à chaque changement de dates
 * ou de personnes (débattu, 500 ms), sans jamais rien écrire — c'est
 * `verifierDisponibiliteSejour` qui tranche, jamais ce composant (règle non
 * négociable n°3 : un seul endroit additionne des personnes, et ce n'est pas
 * ici).
 * `STAYREQ-011` : un avertissement n'empêche pas l'envoi — « Envoyer quand
 * même » relance avec `force: true`, exactement comme SREQ-R4 le permet.
 * `STAYREQ-013` : la mention d'usage reste affichée en permanence à l'étape 3,
 * juste au-dessus du bouton d'envoi — jamais conditionnelle.
 */

const DELAI_VERIFICATION_MS = 500

type Etape = 1 | 2 | 3

interface EtatFormulaire {
  arrivee: string
  depart: string
  adultes: number
  enfants: number
  invites: string[]
  exclusif: boolean
  motif: string
  commentaire: string
  besoins: string
  accepteRegles: boolean
}

const VALEURS_INITIALES: EtatFormulaire = {
  arrivee: '',
  depart: '',
  adultes: 1,
  enfants: 0,
  invites: [],
  exclusif: false,
  motif: '',
  commentaire: '',
  besoins: '',
  accepteRegles: false,
}

function datesValides(arrivee: string, depart: string): boolean {
  if (!arrivee || !depart) return false
  try {
    return jour(depart).getTime() > jour(arrivee).getTime()
  } catch {
    return false
  }
}

export function AssistantDemandeSejour({
  regles,
}: {
  readonly regles: readonly RegleDeLaMaison[]
}) {
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [etape, setEtape] = useState<Etape>(1)
  const [valeurs, setValeurs] = useState<EtatFormulaire>(VALEURS_INITIALES)
  const [echec, setEchec] = useState<Echec | null>(null)
  const [disponibilite, setDisponibilite] = useState<ResultatDisponibilite | null>(
    null,
  )
  const [envoyee, setEnvoyee] = useState(false)
  const [enCours, demarrer] = useTransition()
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reglesObligatoires = regles.filter((regle) => regle.acceptationObligatoire)
  const personnes = valeurs.adultes + valeurs.enfants

  function definir<K extends keyof EtatFormulaire>(
    champ: K,
    valeur: EtatFormulaire[K],
  ) {
    setValeurs((actuelles) => ({ ...actuelles, [champ]: valeur }))
  }

  // STAYREQ-010 : disponibilité en direct, dès que dates et personnes ont un sens.
  useEffect(() => {
    if (minuteur.current) clearTimeout(minuteur.current)
    if (!datesValides(valeurs.arrivee, valeurs.depart) || personnes < 1) {
      setDisponibilite(null)
      return
    }
    minuteur.current = setTimeout(() => {
      void verifierDisponibiliteSejour({
        arrivee: valeurs.arrivee,
        depart: valeurs.depart,
        adultes: valeurs.adultes,
        enfants: valeurs.enfants,
        exclusif: valeurs.exclusif,
      }).then((resultat) => {
        if (resultat.ok) setDisponibilite(resultat.data)
      })
    }, DELAI_VERIFICATION_MS)
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current)
    }
  }, [valeurs.arrivee, valeurs.depart, valeurs.adultes, valeurs.enfants, valeurs.exclusif, personnes])

  function ajouterInvite() {
    if (valeurs.invites.length >= personnes) return
    definir('invites', [...valeurs.invites, ''])
  }

  function modifierInvite(index: number, nom: string) {
    definir(
      'invites',
      valeurs.invites.map((valeur, i) => (i === index ? nom : valeur)),
    )
  }

  function retirerInvite(index: number) {
    definir(
      'invites',
      valeurs.invites.filter((_, i) => i !== index),
    )
  }

  function envoyer(force: boolean) {
    setEchec(null)
    demarrer(async () => {
      const invitesNommes = valeurs.invites
        .map((nom) => nom.trim())
        .filter((nom) => nom.length > 0)
        .map((nom) => ({ nom }))

      const resultat = await creerDemandeSejour({
        arrivee: valeurs.arrivee,
        depart: valeurs.depart,
        adultes: valeurs.adultes,
        enfants: valeurs.enfants,
        invites: invitesNommes,
        exclusif: valeurs.exclusif,
        motif: valeurs.motif || undefined,
        commentaire: valeurs.commentaire || undefined,
        besoins: valeurs.besoins || undefined,
        accepteRegles: valeurs.accepteRegles,
        force,
      })

      if (!resultat.ok) {
        setEchec(resultat)
        return
      }

      setEnvoyee(true)
      router.refresh()
    })
  }

  function recommencer() {
    setValeurs(VALEURS_INITIALES)
    setDisponibilite(null)
    setEchec(null)
    setEnvoyee(false)
    setEtape(1)
    setOuvert(false)
  }

  if (envoyee) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-carte)] border border-olive/30 bg-lin-fonce px-6 py-8 text-center">
        <CalendarCheck aria-hidden="true" className="size-8 text-olive-fonce" />
        <p role="status" className="font-titre text-xl text-encre">
          Votre demande est envoyée
        </p>
        <p className="max-w-prose text-balance text-encre-doux">
          Elle apparaît « En attente » ci-dessus. Solenne vous préviendra de sa
          décision.
        </p>
        <Bouton variante="secondaire" onClick={recommencer}>
          Faire une autre demande
        </Bouton>
      </div>
    )
  }

  if (!ouvert) {
    return (
      <Bouton pleineLargeur onClick={() => setOuvert(true)}>
        <Plus aria-hidden="true" />
        Faire une demande de séjour
      </Bouton>
    )
  }

  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-carte)] border border-lin-profond bg-white p-4 shadow-doux sm:p-6">
      <ol
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-encre-doux"
        aria-label="Étapes"
      >
        {(['Dates', 'Participants', 'Informations'] as const).map((titre, i) => {
          const numero = (i + 1) as Etape
          return (
            <li
              key={titre}
              aria-current={etape === numero ? 'step' : undefined}
              className={
                etape === numero
                  ? 'flex items-center gap-1.5 font-semibold text-encre'
                  : 'flex items-center gap-1.5'
              }
            >
              <span
                className={
                  etape >= numero
                    ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-olive text-xs text-white'
                    : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-lin-profond text-xs'
                }
              >
                {numero}
              </span>
              <span className={etape === numero ? 'inline' : 'hidden sm:inline'}>
                {titre}
              </span>
            </li>
          )
        })}
      </ol>

      {echec && <BandeauErreur message={echec.message} />}

      {etape === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Champ
                etiquette="Arrivée"
                nom="arrivee"
                type="date"
                required
                value={valeurs.arrivee}
                onChange={(e) => definir('arrivee', e.target.value)}
                {...(echec?.champs?.arrivee ? { erreur: echec.champs.arrivee } : {})}
              />
            </div>
            <div className="flex-1">
              <Champ
                etiquette="Départ"
                nom="depart"
                type="date"
                required
                aide="Le jour de départ reste disponible pour d’autres."
                value={valeurs.depart}
                onChange={(e) => definir('depart', e.target.value)}
                {...(echec?.champs?.depart ? { erreur: echec.champs.depart } : {})}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Bouton
              pleineLargeur
              disabled={!datesValides(valeurs.arrivee, valeurs.depart)}
              onClick={() => setEtape(2)}
            >
              Suivant
            </Bouton>
            <Bouton variante="secondaire" pleineLargeur onClick={() => setOuvert(false)}>
              Annuler
            </Bouton>
          </div>
        </div>
      )}

      {etape === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Champ
                etiquette="Adultes"
                nom="adultes"
                type="number"
                inputMode="numeric"
                min={0}
                max={CAPACITE_MAX}
                step={1}
                value={valeurs.adultes}
                onChange={(e) => definir('adultes', Number(e.target.value))}
              />
            </div>
            <div className="flex-1">
              <Champ
                etiquette="Enfants"
                nom="enfants"
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
            nom="exclusif"
            coche={valeurs.exclusif}
            titre="Privatiser la maison"
            description="Aucun autre séjour ni événement sur ces dates."
            onChanger={(coche) => definir('exclusif', coche)}
          />

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-encre">
              Invités nommés (facultatif)
            </p>
            {valeurs.invites.map((nom, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label={`Nom de l’invité ${index + 1}`}
                  className="min-h-11 w-full rounded-[var(--radius-champ)] border border-lin-profond bg-white px-4 text-base text-encre"
                  value={nom}
                  onChange={(e) => modifierInvite(index, e.target.value)}
                />
                <Bouton
                  type="button"
                  variante="discret"
                  taille="icone"
                  aria-label={`Retirer l’invité ${index + 1}`}
                  onClick={() => retirerInvite(index)}
                >
                  <Trash2 aria-hidden="true" />
                </Bouton>
              </div>
            ))}
            <Bouton
              type="button"
              variante="secondaire"
              disabled={valeurs.invites.length >= personnes}
              onClick={ajouterInvite}
            >
              <Plus aria-hidden="true" />
              Ajouter un invité
            </Bouton>
          </div>

          {disponibilite && !disponibilite.compatible && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-[var(--radius-champ)] border border-terracotta/40 bg-lin-fonce px-4 py-3 text-terracotta-fonce"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="flex flex-col gap-1 text-sm">
                {disponibilite.conflits.map((conflit) => (
                  <p key={conflit.code} className="font-medium">
                    {conflit.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Bouton
              pleineLargeur
              disabled={personnes < 1}
              onClick={() => setEtape(3)}
            >
              Suivant
            </Bouton>
            <Bouton variante="secondaire" pleineLargeur onClick={() => setEtape(1)}>
              Précédent
            </Bouton>
          </div>
        </div>
      )}

      {etape === 3 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-champ)] border border-lin-profond bg-lin-fonce px-4 py-3 text-sm text-encre">
            <p className="font-medium">
              {formaterPeriode(jour(valeurs.arrivee), jour(valeurs.depart))}
            </p>
            <p className="text-encre-doux">
              {personnes} personne{personnes > 1 ? 's' : ''}
              {valeurs.exclusif ? ' · maison privatisée' : ''}
            </p>
          </div>

          <ZoneTexte
            etiquette="Motif du séjour (facultatif)"
            nom="motif"
            value={valeurs.motif}
            onChange={(e) => definir('motif', e.target.value)}
          />
          <ZoneTexte
            etiquette="Besoins particuliers (facultatif)"
            nom="besoins"
            value={valeurs.besoins}
            onChange={(e) => definir('besoins', e.target.value)}
          />
          <ZoneTexte
            etiquette="Un mot pour Solenne (facultatif)"
            nom="commentaire"
            value={valeurs.commentaire}
            onChange={(e) => definir('commentaire', e.target.value)}
          />

          {reglesObligatoires.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-champ)] border border-lin-profond p-4">
              <p className="font-medium text-encre">Règles de la maison</p>
              {reglesObligatoires.map((regle) => (
                <div key={regle.id} className="text-sm text-encre-doux">
                  <p className="font-medium text-encre">{regle.titre}</p>
                  <p className="whitespace-pre-line">{regle.texte}</p>
                </div>
              ))}
              <CaseACocher
                nom="accepteRegles"
                coche={valeurs.accepteRegles}
                titre="J’ai lu et j’accepte ces règles"
                onChanger={(coche) => definir('accepteRegles', coche)}
              />
            </div>
          )}

          {disponibilite && !disponibilite.compatible && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-[var(--radius-champ)] border border-terracotta/40 bg-lin-fonce px-4 py-3 text-terracotta-fonce"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="flex flex-col gap-1 text-sm">
                {disponibilite.conflits.map((conflit) => (
                  <p key={conflit.code} className="font-medium">
                    {conflit.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm font-medium text-encre">
            Votre demande sera envoyée à Solenne et ne sera confirmée qu’après
            son accord.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            {disponibilite && !disponibilite.compatible ? (
              <Bouton
                pleineLargeur
                variante="destructeur"
                disabled={enCours}
                onClick={() => envoyer(true)}
              >
                {enCours ? 'Envoi…' : 'Envoyer quand même'}
              </Bouton>
            ) : (
              <Bouton pleineLargeur disabled={enCours} onClick={() => envoyer(false)}>
                {enCours ? 'Envoi…' : 'Envoyer la demande'}
              </Bouton>
            )}
            <Bouton
              variante="secondaire"
              pleineLargeur
              disabled={enCours}
              onClick={() => setEtape(2)}
            >
              Précédent
            </Bouton>
          </div>
        </div>
      )}
    </div>
  )
}
