'use client'

import { CalendarOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type PointerEvent } from 'react'

import { VueMois } from '@/components/agenda/vue-mois'
import { FormulaireBlocage } from '@/components/formulaires/blocages-maison'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import type { GrilleMois } from '@/domain/calendar/grille'
import {
  ajouterJours,
  formaterPeriode,
  jour,
  versTexteJour,
} from '@/domain/core/dates'
import type { Echec } from '@/domain/core/result'
import {
  creerBlocage,
  impactBlocage,
  type PeriodeConcernee,
} from '@/server/actions/blocages'

/**
 * `BLOCK-011` — fermer des dates à même l'agenda.
 *
 * Le geste est un **raccourci, pas un passage obligé** : le même blocage se
 * pose au clavier depuis la console (`/gerer/maison`), et le formulaire ouvert
 * ici est celui de la console, dates préremplies. Une fonction qui n'existerait
 * qu'au bout d'un glissement de souris serait inaccessible à qui n'en a pas.
 *
 * Le mode de sélection est **explicite** : tant qu'il n'est pas armé, la grille
 * défile normalement au doigt. Un agenda qui capte le glissement en permanence
 * devient impossible à faire défiler sur un téléphone.
 *
 * Convention `[du, au[` : glisser du 10 au 12 ferme les 10, 11 et 12, donc la
 * borne envoyée est le 13. Un clic sur un seul jour ferme une nuit (BLOCK-002).
 */
export function SelectionBlocage({ grille }: { readonly grille: GrilleMois }) {
  const router = useRouter()
  const [arme, setArme] = useState(false)
  const [ancre, setAncre] = useState<string | null>(null)
  const [survol, setSurvol] = useState<string | null>(null)
  const [periode, setPeriode] = useState<{
    readonly du: string
    readonly au: string
  } | null>(null)
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [sejoursEnCause, setSejoursEnCause] = useState<
    readonly PeriodeConcernee[]
  >([])
  const [enCours, demarrer] = useTransition()

  /** Ce que la sélection en cours recouvre, bornes remises dans l'ordre. */
  const enCoursDeTrace =
    ancre && survol
      ? {
          du: jour(ancre <= survol ? ancre : survol),
          au: ajouterJours(jour(ancre <= survol ? survol : ancre), 1),
        }
      : null

  const selection = enCoursDeTrace
    ? enCoursDeTrace
    : periode
      ? { du: jour(periode.du), au: jour(periode.au) }
      : null

  function jourSous(evenement: PointerEvent<HTMLDivElement>): string | null {
    const cible = document
      .elementFromPoint(evenement.clientX, evenement.clientY)
      ?.closest('[data-jour]')
    return cible?.getAttribute('data-jour') ?? null
  }

  function tout(remise: { readonly ferme?: boolean } = {}) {
    setAncre(null)
    setSurvol(null)
    setEchec(null)
    setSejoursEnCause([])
    if (remise.ferme) {
      setPeriode(null)
      setArme(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Bouton
          variante={arme ? 'secondaire' : 'principal'}
          disabled={enCours}
          onClick={() => {
            tout({ ferme: arme })
            setArme((etait) => !etait)
            setAnnonce(null)
          }}
        >
          <CalendarOff aria-hidden="true" />
          {arme ? 'Quitter la sélection' : 'Fermer des dates'}
        </Bouton>
        {arme ? (
          <p className="text-sm text-encre-doux">
            Faites glisser sur les jours à fermer, ou touchez-en un seul pour
            une nuit.
          </p>
        ) : null}
      </div>

      {annonce ? (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {annonce}
        </p>
      ) : null}

      <div
        className={arme ? 'touch-none select-none [&_[data-jour]]:cursor-crosshair' : undefined}
        onPointerDown={(evenement) => {
          if (!arme) return
          const cible = jourSous(evenement)
          if (!cible) return
          evenement.preventDefault()
          evenement.currentTarget.setPointerCapture(evenement.pointerId)
          setPeriode(null)
          setEchec(null)
          setSejoursEnCause([])
          setAncre(cible)
          setSurvol(cible)
        }}
        onPointerMove={(evenement) => {
          if (!arme || !ancre) return
          const cible = jourSous(evenement)
          if (cible) setSurvol(cible)
        }}
        onPointerUp={(evenement) => {
          if (!arme || !ancre || !survol) return
          evenement.currentTarget.releasePointerCapture(evenement.pointerId)
          const premier = ancre <= survol ? ancre : survol
          const dernier = ancre <= survol ? survol : ancre
          setPeriode({
            du: premier,
            au: versTexteJour(ajouterJours(jour(dernier), 1)),
          })
          setAncre(null)
          setSurvol(null)
        }}
      >
        <VueMois grille={grille} selection={selection} />
      </div>

      {arme ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4">
          <h4 className="font-titre text-base text-encre">
            {periode
              ? `Fermer ${formaterPeriode(jour(periode.du), jour(periode.au))}`
              : 'Fermer des dates'}
          </h4>

          {echec ? <BandeauErreur message={echec.message} /> : null}

          {sejoursEnCause.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-champ)] border border-terracotta/40 px-3 py-2">
              <p className="text-sm font-medium text-encre">
                Séjours confirmés à annuler d’abord :
              </p>
              <ul className="flex flex-col gap-1 text-sm text-encre-doux">
                {sejoursEnCause.map((sejour) => (
                  <li key={sejour.id}>
                    {sejour.qui} — {formaterPeriode(sejour.du, sejour.au)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <FormulaireBlocage
            key={periode ? `${periode.du}-${periode.au}` : 'vierge'}
            {...(periode ? { periodeInitiale: periode } : {})}
            enCours={enCours}
            echec={echec}
            onAnnuler={() => tout({ ferme: true })}
            onValider={(valeurs) => {
              setEchec(null)
              setAnnonce(null)
              setSejoursEnCause([])

              demarrer(async () => {
                const resultat = await creerBlocage(valeurs)

                if (resultat.ok) {
                  setAnnonce('La période est fermée.')
                  tout({ ferme: true })
                  router.refresh()
                  return
                }

                setEchec(resultat)

                // BLOCK-007 : dire non ne suffit pas, il faut dire quoi annuler.
                if (resultat.code === 'BLOCKED_OVER_STAY') {
                  const impact = await impactBlocage({
                    du: valeurs.du,
                    au: valeurs.au,
                  })
                  if (impact.ok) setSejoursEnCause(impact.data.sejoursEnCause)
                }
              })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
