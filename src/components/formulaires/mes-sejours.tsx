'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { DialogueConfirmation } from '@/components/ui/dialogue-confirmation'
import { EtatVide } from '@/components/ui/etat-vide'
import { formaterPeriode } from '@/domain/core/dates'
import type { Echec } from '@/domain/core/result'
import { annulerSejour, type SejourVue } from '@/server/actions/sejours'

/**
 * `STAY-001` / `STAY-003` / `STAY-009` — les séjours confirmés de l'ami
 * connecté, tous statuts confondus : l'historique (`STAY-009`) n'est pas un
 * autre écran, seulement les lignes que `CONFIRMED` ne couvre pas.
 *
 * Même squelette que `MesDemandesSejour` (`STAYREQ`) : la liste, la
 * confirmation avant l'annulation, le rafraîchissement serveur après.
 */

const LIBELLES_STATUT: Record<SejourVue['statut'], string> = {
  CONFIRMED: 'Confirmé',
  CANCELLED: 'Annulé',
  COMPLETED: 'Terminé',
}

const TONS_STATUT: Record<SejourVue['statut'], 'neutre' | 'olive' | 'terracotta' | 'bois'> = {
  CONFIRMED: 'olive',
  CANCELLED: 'terracotta',
  COMPLETED: 'neutre',
}

export function MesSejours({ sejours }: { readonly sejours: readonly SejourVue[] }) {
  const router = useRouter()
  const [echec, setEchec] = useState<Echec | null>(null)
  const [aAnnuler, setAAnnuler] = useState<SejourVue | null>(null)
  const [enCours, demarrer] = useTransition()

  function confirmerAnnulation() {
    const cible = aAnnuler
    if (!cible) return
    setAAnnuler(null)
    setEchec(null)
    demarrer(async () => {
      const resultat = await annulerSejour({ id: cible.id })
      if (!resultat.ok) {
        setEchec(resultat)
        return
      }
      router.refresh()
    })
  }

  if (sejours.length === 0) {
    return (
      <EtatVide
        titre="Aucun séjour confirmé"
        texte="Une fois votre demande acceptée, elle apparaît ici."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {echec && <BandeauErreur message={echec.message} />}

      <ul className="flex flex-col gap-3">
        {sejours.map((sejour) => (
          <li
            key={sejour.id}
            className="flex flex-col gap-2 rounded-[var(--radius-carte)] border border-lin-profond bg-white p-4 shadow-doux"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-titre text-lg text-encre">
                {formaterPeriode(sejour.arrivee, sejour.depart)}
              </p>
              <Badge ton={TONS_STATUT[sejour.statut]}>{LIBELLES_STATUT[sejour.statut]}</Badge>
            </div>
            <p className="text-sm text-encre-doux">
              {sejour.adultes + sejour.enfants} personne
              {sejour.adultes + sejour.enfants > 1 ? 's' : ''}
              {sejour.exclusif ? ' · maison privatisée' : ''}
            </p>
            {sejour.cancelReason && (
              <p className="text-sm text-encre-doux">{sejour.cancelReason}</p>
            )}
            {sejour.statut === 'CONFIRMED' && (
              <Bouton
                variante="secondaire"
                disabled={enCours}
                onClick={() => setAAnnuler(sejour)}
              >
                Annuler ce séjour
              </Bouton>
            )}
          </li>
        ))}
      </ul>

      <DialogueConfirmation
        ouvert={aAnnuler !== null}
        onOuvertureChange={(ouvert) => !ouvert && setAAnnuler(null)}
        titre="Annuler ce séjour ?"
        objet={aAnnuler ? formaterPeriode(aAnnuler.arrivee, aAnnuler.depart) : ''}
        consequence="Solenne sera prévenue de l’annulation"
        libelleConfirmer="Annuler le séjour"
        enCours={enCours}
        onConfirmer={confirmerAnnulation}
      />
    </div>
  )
}
