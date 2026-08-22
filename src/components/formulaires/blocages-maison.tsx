'use client'

import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue-confirmation'
import { EtatVide } from '@/components/ui/etat-vide'
import { formaterPeriode, versTexteJour } from '@/domain/core/dates'
import type { Echec, Resultat } from '@/domain/core/result'
import { LONGUEURS } from '@/domain/core/validation'
import {
  LIBELLE_TYPE,
  TYPES_BLOCAGE,
  type TypeBlocage,
} from '@/domain/house/blocages'
import {
  creerBlocage,
  impactBlocage,
  modifierBlocage,
  supprimerBlocage,
  type Blocage,
  type PeriodeConcernee,
} from '@/server/actions/blocages'

/**
 * Console de Solenne — les périodes pendant lesquelles la maison est fermée.
 *
 * Deux régimes opposés, qu'il ne faut surtout pas confondre :
 *   · un **séjour confirmé** sous le blocage → refus, avec la liste de ce qu'il
 *     faut annuler d'abord (BLK-R3) ;
 *   · une **demande en attente** sous le blocage → le blocage passe, et la
 *     demande est signalée en terracotta (BLK-R4).
 *
 * Le motif saisi ici n'est jamais envoyé aux amis : leur agenda ne reçoit que
 * des dates (BLOCK-S09).
 */
export function BlocagesMaison({
  blocages,
}: {
  readonly blocages: readonly Blocage[]
}) {
  const router = useRouter()
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [enEdition, setEnEdition] = useState<string | null>(null)
  const [nouvelle, setNouvelle] = useState(false)
  const [aSupprimer, setASupprimer] = useState<Blocage | null>(null)
  const [sejoursEnCause, setSejoursEnCause] = useState<
    readonly PeriodeConcernee[]
  >([])
  const [enCours, demarrer] = useTransition()

  function agir(
    appel: () => Promise<Resultat<unknown>>,
    message: string,
    periode?: { readonly du: string; readonly au: string },
  ) {
    setEchec(null)
    setAnnonce(null)
    setSejoursEnCause([])

    demarrer(async () => {
      const resultat = await appel()

      if (resultat.ok) {
        setAnnonce(message)
        setEnEdition(null)
        setNouvelle(false)
        router.refresh()
        return
      }

      setEchec(resultat)

      // BLOCK-007 : dire non ne suffit pas, il faut dire quoi annuler.
      if (resultat.code === 'BLOCKED_OVER_STAY' && periode) {
        const impact = await impactBlocage(periode)
        if (impact.ok) setSejoursEnCause(impact.data.sejoursEnCause)
      }
    })
  }

  return (
    <section aria-labelledby="titre-blocages" className="flex flex-col gap-4">
      <h3 id="titre-blocages" className="font-titre text-xl">
        Périodes bloquées
      </h3>
      <p className="text-sm text-encre-doux">
        Vos amis y liront « maison indisponible » — ni le libellé, ni le motif ne
        leur sont montrés.
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

      {sejoursEnCause.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-champ)] border border-terracotta/40 bg-lin-fonce px-4 py-3">
          <p className="text-sm font-medium text-encre">
            Séjours confirmés à annuler d’abord :
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

      {blocages.length === 0 && !nouvelle && (
        <EtatVide
          titre="Aucune période bloquée"
          texte="Bloquez des dates pour des travaux, un week-end en famille, ou toute autre raison qui vous appartient."
        />
      )}

      {blocages.length > 0 && (
        <ul className="flex flex-col gap-3">
          {blocages.map((blocage) => (
            <li
              key={blocage.id}
              className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4"
            >
              {enEdition === blocage.id ? (
                <FormulaireBlocage
                  blocage={blocage}
                  enCours={enCours}
                  echec={echec}
                  onAnnuler={() => setEnEdition(null)}
                  onValider={(valeurs) =>
                    agir(
                      () => modifierBlocage({ id: blocage.id, ...valeurs }),
                      'La période est enregistrée.',
                      { du: valeurs.du, au: valeurs.au },
                    )
                  }
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* En 320 px, un titre coincé à côté de son badge se coupe
                        en plein mot : il prend toute la ligne, les badges
                        passent dessous. */}
                    <h4 className="w-full break-words font-titre text-lg sm:w-auto sm:min-w-0 sm:flex-1">
                      {blocage.libelle}
                    </h4>
                    <Badge ton="contour">{LIBELLE_TYPE[blocage.type]}</Badge>
                    {blocage.revolue && <Badge ton="neutre">Passée</Badge>}
                  </div>

                  <p className="flex items-center gap-2 text-sm text-encre-doux">
                    <CalendarOff aria-hidden="true" className="size-4 shrink-0" />
                    {formaterPeriode(blocage.du, blocage.au)}
                  </p>

                  {blocage.motif && (
                    <p className="whitespace-pre-line break-words text-sm text-encre-doux">
                      {blocage.motif}
                    </p>
                  )}

                  {blocage.demandesSignalees.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-[var(--radius-champ)] border border-terracotta/40 px-3 py-2">
                      <p className="text-sm font-medium text-terracotta-fonce">
                        {blocage.demandesSignalees.length} demande
                        {blocage.demandesSignalees.length > 1 ? 's' : ''} en
                        attente sur ces dates
                      </p>
                      <ul className="flex flex-col gap-1 text-sm text-encre-doux">
                        {blocage.demandesSignalees.map((demande) => (
                          <li key={demande.id}>
                            {demande.qui} —{' '}
                            {formaterPeriode(demande.du, demande.au)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Modifier « ${blocage.libelle} »`}
                      disabled={enCours}
                      onClick={() => setEnEdition(blocage.id)}
                    >
                      <Pencil aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Lever « ${blocage.libelle} »`}
                      disabled={enCours}
                      onClick={() => setASupprimer(blocage)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Bouton>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {nouvelle ? (
        <div className="rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4">
          <FormulaireBlocage
            enCours={enCours}
            echec={echec}
            onAnnuler={() => setNouvelle(false)}
            onValider={(valeurs) =>
              agir(() => creerBlocage(valeurs), 'La période est bloquée.', {
                du: valeurs.du,
                au: valeurs.au,
              })
            }
          />
        </div>
      ) : (
        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={enCours}
          onClick={() => setNouvelle(true)}
        >
          <Plus aria-hidden="true" />
          Bloquer une période
        </Bouton>
      )}

      <DialogueConfirmation
        ouvert={aSupprimer !== null}
        onOuvertureChange={(ouvert) => !ouvert && setASupprimer(null)}
        titre="Lever cette période bloquée ?"
        objet={
          aSupprimer
            ? `« ${aSupprimer.libelle} », ${formaterPeriode(aSupprimer.du, aSupprimer.au)}`
            : ''
        }
        consequence="ces dates redeviendront disponibles"
        libelleConfirmer="Lever le blocage"
        enCours={enCours}
        onConfirmer={() => {
          const cible = aSupprimer
          setASupprimer(null)
          if (cible) {
            agir(
              () => supprimerBlocage({ id: cible.id }),
              'La période est de nouveau disponible.',
            )
          }
        }}
      />
    </section>
  )
}

interface ValeursBlocage {
  readonly du: string
  readonly au: string
  readonly libelle: string
  readonly motif: string
  readonly type: TypeBlocage
}

/**
 * Le même formulaire sert la console et l'agenda : le cliquer-glisser de
 * `BLOCK-011` remplit les dates, il n'invente pas un second formulaire. Deux
 * saisies pour un même blocage auraient fini par diverger sur le libellé
 * obligatoire ou sur la borne de fin.
 */
export function FormulaireBlocage({
  blocage,
  periodeInitiale,
  enCours,
  echec,
  onValider,
  onAnnuler,
}: {
  readonly blocage?: Blocage
  readonly periodeInitiale?: { readonly du: string; readonly au: string }
  readonly enCours: boolean
  readonly echec: Echec | null
  readonly onValider: (valeurs: ValeursBlocage) => void
  readonly onAnnuler: () => void
}) {
  const [du, setDu] = useState(
    blocage ? versTexteJour(blocage.du) : (periodeInitiale?.du ?? ''),
  )
  const [au, setAu] = useState(
    blocage ? versTexteJour(blocage.au) : (periodeInitiale?.au ?? ''),
  )
  const [libelle, setLibelle] = useState(blocage?.libelle ?? '')
  const [motif, setMotif] = useState(blocage?.motif ?? '')
  const [type, setType] = useState<TypeBlocage>(blocage?.type ?? 'MAINTENANCE')

  const identifiant = blocage?.id ?? 'nouvelle'

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(evenement) => {
        evenement.preventDefault()
        onValider({ du, au, libelle, motif, type })
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <Champ
            etiquette="Du"
            nom={`du-${identifiant}`}
            type="date"
            required
            value={du}
            onChange={(evenement) => setDu(evenement.target.value)}
            {...(echec?.champs?.du ? { erreur: echec.champs.du } : {})}
          />
        </div>
        <div className="flex-1">
          <Champ
            etiquette="Au (non compris)"
            nom={`au-${identifiant}`}
            type="date"
            required
            aide="Le jour de fin reste disponible."
            value={au}
            onChange={(evenement) => setAu(evenement.target.value)}
            {...(echec?.champs?.au ? { erreur: echec.champs.au } : {})}
          />
        </div>
      </div>

      <Champ
        etiquette="Libellé"
        nom={`libelle-${identifiant}`}
        required
        value={libelle}
        onChange={(evenement) => setLibelle(evenement.target.value)}
        {...(echec?.champs?.libelle ? { erreur: echec.champs.libelle } : {})}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-encre">
          Nature du blocage
        </legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {TYPES_BLOCAGE.map((choix) => (
            <label
              key={choix}
              className="flex min-h-11 flex-1 items-center gap-3 rounded-[var(--radius-champ)] border border-lin-profond px-3 text-sm text-encre"
            >
              <input
                type="radio"
                name={`type-${identifiant}`}
                className="size-5 accent-[var(--color-olive)]"
                checked={type === choix}
                onChange={() => setType(choix)}
              />
              {LIBELLE_TYPE[choix]}
            </label>
          ))}
        </div>
      </fieldset>

      <ZoneTexte
        etiquette="Motif (pour vous seule)"
        nom={`motif-${identifiant}`}
        rows={3}
        maxLength={LONGUEURS.moyenne}
        value={motif}
        onChange={(evenement) => setMotif(evenement.target.value)}
        {...(echec?.champs?.motif ? { erreur: echec.champs.motif } : {})}
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
