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
import {
  annulerDemandeSejour,
  type DemandeSejourVue,
} from '@/server/actions/demandes-sejour'

/**
 * `STAYREQ-017` — la liste des demandes de l'ami connecté, avec leur statut.
 * `STAYREQ-015` — l'annulation, tant qu'une demande est `PENDING` (SREQ-R5).
 *
 * Pas de modification ici (SREQ-R5 le permet, mais aucun cas de test de
 * `STAYREQ-B` n'exige cet écran) : revenir sur ses dates se fait en annulant
 * puis en refaisant une demande depuis l'assistant.
 */

const LIBELLES_STATUT: Record<DemandeSejourVue['statut'], string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Confirmée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
}

const TONS_STATUT: Record<
  DemandeSejourVue['statut'],
  'neutre' | 'olive' | 'terracotta' | 'bois'
> = {
  PENDING: 'bois',
  ACCEPTED: 'olive',
  REJECTED: 'terracotta',
  CANCELLED: 'neutre',
}

export function MesDemandesSejour({
  demandes,
}: {
  readonly demandes: readonly DemandeSejourVue[]
}) {
  const router = useRouter()
  const [echec, setEchec] = useState<Echec | null>(null)
  const [aAnnuler, setAAnnuler] = useState<DemandeSejourVue | null>(null)
  const [enCours, demarrer] = useTransition()

  function confirmerAnnulation() {
    const cible = aAnnuler
    if (!cible) return
    setAAnnuler(null)
    setEchec(null)
    demarrer(async () => {
      const resultat = await annulerDemandeSejour({ id: cible.id })
      if (!resultat.ok) {
        setEchec(resultat)
        return
      }
      router.refresh()
    })
  }

  if (demandes.length === 0) {
    return (
      <EtatVide
        titre="Aucune demande pour l’instant"
        texte="Faites votre première demande de séjour ci-dessous."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {echec && <BandeauErreur message={echec.message} />}

      <ul className="flex flex-col gap-3">
        {demandes.map((demande) => (
          <li
            key={demande.id}
            className="flex flex-col gap-2 rounded-[var(--radius-carte)] border border-lin-profond bg-white p-4 shadow-doux"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-titre text-lg text-encre">
                {formaterPeriode(demande.arrivee, demande.depart)}
              </p>
              <Badge ton={TONS_STATUT[demande.statut]}>
                {LIBELLES_STATUT[demande.statut]}
              </Badge>
            </div>
            <p className="text-sm text-encre-doux">
              {demande.adultes + demande.enfants} personne
              {demande.adultes + demande.enfants > 1 ? 's' : ''}
              {demande.exclusif ? ' · maison privatisée' : ''}
            </p>
            {demande.decisionNote && (
              <p className="text-sm text-encre-doux">{demande.decisionNote}</p>
            )}
            {demande.statut === 'PENDING' && (
              <Bouton
                variante="secondaire"
                disabled={enCours}
                onClick={() => setAAnnuler(demande)}
              >
                Annuler cette demande
              </Bouton>
            )}
          </li>
        ))}
      </ul>

      <DialogueConfirmation
        ouvert={aAnnuler !== null}
        onOuvertureChange={(ouvert) => !ouvert && setAAnnuler(null)}
        titre="Annuler cette demande ?"
        objet={
          aAnnuler ? formaterPeriode(aAnnuler.arrivee, aAnnuler.depart) : ''
        }
        consequence="Solenne sera prévenue de l’annulation"
        libelleConfirmer="Annuler la demande"
        enCours={enCours}
        onConfirmer={confirmerAnnulation}
      />
    </div>
  )
}
