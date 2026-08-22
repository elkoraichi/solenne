import 'server-only'

import type { ReglagesReservation } from '@/domain/policy/reglages'
import type { PrismaClient } from '@/generated/prisma/client'
import { db } from '@/server/db'

/**
 * Traduction base ↔ domaine des réglages de réservation (`POLICY`). Sorti de
 * `src/server/actions/reglages-reservation.ts` pour que `STAYREQ`, second
 * lecteur, n'ait pas sa propre copie — même principe que
 * `src/server/occupation.ts` et `src/server/blocages.ts`. N'exporte que des
 * fonctions non gardées : rien ici n'est une Server Action (`PERM-012` ne
 * scanne que `src/server/actions/`).
 */

type Client =
  | PrismaClient
  | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export const REGLAGES_PAR_DEFAUT: ReglagesReservation = {
  dureeMaxNuits: null,
  delaiMinHeures: null,
  horizonMaxJours: null,
  joursArriveeInterdits: [],
  maxPersonnesParDemande: null,
  cohabitationAutorisee: true,
}

export type ColonnesReglages = {
  readonly maxGuests: number | null
  readonly maxStayNights: number | null
  readonly minLeadTimeHours: number | null
  readonly maxAdvanceDays: number | null
  readonly blockedWeekdays: number[]
  readonly allowCoOccupancy: boolean
}

export function versReglages(colonnes: ColonnesReglages): ReglagesReservation {
  return {
    dureeMaxNuits: colonnes.maxStayNights,
    delaiMinHeures: colonnes.minLeadTimeHours,
    horizonMaxJours: colonnes.maxAdvanceDays,
    joursArriveeInterdits: colonnes.blockedWeekdays,
    maxPersonnesParDemande: colonnes.maxGuests,
    cohabitationAutorisee: colonnes.allowCoOccupancy,
  }
}

export function versColonnes(reglages: ReglagesReservation): ColonnesReglages {
  return {
    maxGuests: reglages.maxPersonnesParDemande,
    maxStayNights: reglages.dureeMaxNuits,
    minLeadTimeHours: reglages.delaiMinHeures,
    maxAdvanceDays: reglages.horizonMaxJours,
    // Triés et dédupliqués : deux enregistrements successifs du même formulaire
    // ne doivent pas produire de diff d'audit qui ne change rien au fond.
    blockedWeekdays: [...new Set(reglages.joursArriveeInterdits)].sort((a, b) => a - b),
    allowCoOccupancy: reglages.cohabitationAutorisee,
  }
}

/**
 * Les réglages actuels, réglages par défaut si rien n'a encore été enregistré
 * (POL-R2 : aucune ligne ne vaut aucune règle active).
 */
export async function reglagesActuelsDeLaMaison(
  maisonId: string,
  client: Client = db,
): Promise<ReglagesReservation> {
  const parametres = await client.bookingSettings.findUnique({
    where: { houseId: maisonId },
  })
  return parametres ? versReglages(parametres) : REGLAGES_PAR_DEFAUT
}
