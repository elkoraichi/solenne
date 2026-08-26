import { debutDeJour } from '@/domain/core/dates'
import { messagePour } from '@/domain/core/messages'

/**
 * `STAY` — la vie d'un séjour confirmé, en domaine pur.
 *
 * STAY-R6 : « passé » se lit sur la **date de départ**, jamais sur le seul
 * champ `status`. Le traitement quotidien (`cloturerSejoursTerminees`) peut
 * ne pas être encore passé qu'une tentative d'annulation doit déjà être
 * refusée — convention `[arrivée, départ[` (règle non négociable n°7) : le
 * jour du départ n'est plus occupé, il n'est donc plus annulable non plus.
 */

export type StatutSejour = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

export interface RefusAnnulation {
  readonly code: 'STAY_NOT_CANCELLABLE'
  readonly message: string
}

/** Vrai dès que la date de départ est atteinte ou dépassée. */
export function sejourEstPasse(fin: Date, maintenant: Date): boolean {
  return debutDeJour(maintenant) >= debutDeJour(fin)
}

/**
 * STAY-R2 / R6 — un séjour ne s'annule que s'il est `CONFIRMED` et pas encore
 * terminé. Le même refus couvre les deux cas (déjà annulé, déjà terminé) :
 * aucun cas de test de la fiche ne distingue les deux messages.
 */
export function verifierAnnulable(
  statut: StatutSejour,
  fin: Date,
  maintenant: Date,
): RefusAnnulation | null {
  if (statut !== 'CONFIRMED' || sejourEstPasse(fin, maintenant)) {
    return { code: 'STAY_NOT_CANCELLABLE', message: messagePour('STAY_NOT_CANCELLABLE') }
  }
  return null
}
