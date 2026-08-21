import 'server-only'

import { headers } from 'next/headers'

import type { PrismaClient } from '@/generated/prisma/client'
import { db } from '@/server/db'
import { relancerSiControleDeFluxNext } from '@/server/flux-next'
import { journal } from '@/server/logging/logger'
import { masquerSecrets } from '@/server/logging/redaction'

/**
 * Journal d'audit (PERM-R5, règle non négociable n°8).
 *
 * Écriture seule, garantie par des déclencheurs PostgreSQL posés au lot 0.
 * Ce module ne fournit **aucune** fonction de modification ou de suppression :
 * l'absence est intentionnelle.
 */

type ClientOuTransaction = PrismaClient | Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0]

export interface EntreeAudit {
  readonly acteurId: string | null
  readonly action: string
  readonly entite?: string | null
  readonly entiteId?: string | null
  readonly avant?: unknown
  readonly apres?: unknown
  readonly details?: Record<string, unknown>
}

export async function adresseIp(): Promise<string | null> {
  try {
    const entetes = await headers()
    return (
      entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      entetes.get('x-real-ip') ??
      null
    )
  } catch (erreur) {
    relancerSiControleDeFluxNext(erreur)
    return null
  }
}

function differentiel(entree: EntreeAudit): Record<string, unknown> {
  const diff: Record<string, unknown> = {}
  if (entree.avant !== undefined) diff.avant = masquerSecrets(entree.avant)
  if (entree.apres !== undefined) diff.apres = masquerSecrets(entree.apres)
  if (entree.details) diff.details = masquerSecrets(entree.details)
  return diff
}

/**
 * Écrit une entrée d'audit.
 *
 * Passer le client de transaction en second argument quand l'action est
 * transactionnelle : la trace est alors écrite **avant** que l'action soit
 * considérée comme réussie, et disparaît avec elle en cas d'annulation.
 */
export async function journaliserAudit(
  entree: EntreeAudit,
  client: ClientOuTransaction = db,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: entree.acteurId,
      action: entree.action,
      entityType: entree.entite ?? null,
      entityId: entree.entiteId ?? null,
      diff: differentiel(entree) as never,
      ip: await adresseIp(),
    },
  })
}

/**
 * Trace un refus de permission.
 *
 * PERM-S12 : une rafale d'appels refusés ne doit pas noyer le journal. On
 * n'écrit qu'une entrée par acteur et par action sur une minute glissante ;
 * les suivantes sont comptées dans les journaux techniques, pas dans l'audit.
 */
const FENETRE_ANTI_SATURATION_MS = 60_000
const dernieresTraces = new Map<string, number>()

export async function journaliserRefus(entree: {
  readonly acteurId: string | null
  readonly action: string
  readonly raison: string
}): Promise<void> {
  const cle = `${entree.acteurId ?? 'anonyme'}::${entree.action}`
  const maintenant = Date.now()
  const derniere = dernieresTraces.get(cle) ?? 0

  journal.warn('Refus de permission', {
    action: entree.action,
    utilisateurId: entree.acteurId,
    detail: { raison: entree.raison },
  })

  if (maintenant - derniere < FENETRE_ANTI_SATURATION_MS) return
  dernieresTraces.set(cle, maintenant)

  // L'audit ne doit jamais faire échouer l'action qu'il observe.
  await journaliserAudit({
    acteurId: entree.acteurId,
    action: `refus.${entree.action}`,
    details: { raison: entree.raison },
  }).catch((erreur) => {
    journal.error('Écriture d’audit impossible', {
      action: entree.action,
      detail: erreur,
    })
  })
}

/** Remet à zéro l'anti-saturation. Réservé aux tests. */
export function reinitialiserAntiSaturation(): void {
  dernieresTraces.clear()
}
