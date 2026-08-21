import 'server-only'

import { ErreurMetier } from '@/domain/core/result'
import { db } from '@/server/db'

/**
 * Limitation de débit (AUTH-R5, S12).
 *
 * Les tentatives sont comptées **en base**, sur une fenêtre glissante. Un
 * compteur en mémoire ne protégerait rien sur un hébergement sans état : deux
 * instances, deux compteurs, deux fois plus de tentatives.
 */

export interface Politique {
  /** Nombre de tentatives tolérées sur la fenêtre. */
  readonly limite: number
  readonly fenetreMs: number
}

const MINUTE = 60_000

export const POLITIQUES = {
  /** 5 échecs de connexion en 15 minutes, **par compte** (AUTH-R5). */
  connexion: { limite: 5, fenetreMs: 15 * MINUTE },
  /**
   * Garde-fou plus large par adresse IP, contre le balayage de comptes.
   * Volontairement lâche : bloquer un compte ne doit pas bloquer les autres
   * personnes derrière la même connexion (AUTH-014).
   */
  connexionIp: { limite: 40, fenetreMs: 15 * MINUTE },
  /** Demandes de réinitialisation : 3 par quart d'heure (PWD-016). */
  reinitialisation: { limite: 3, fenetreMs: 15 * MINUTE },
  /** Tentatives d'activation d'invitation : contre la devinette (INVITE-S12). */
  activation: { limite: 10, fenetreMs: 15 * MINUTE },
  /** Appels refusés faute de droits (PERM-S12). */
  refus: { limite: 30, fenetreMs: 5 * MINUTE },
} as const satisfies Record<string, Politique>

export type NomPolitique = keyof typeof POLITIQUES

export interface Verdict {
  readonly autorise: boolean
  /** Temps restant avant de pouvoir réessayer, en minutes arrondies au plus. */
  readonly minutesAvantReprise: number
}

function cleComplete(politique: NomPolitique, sujet: string): string {
  return `${politique}::${sujet.toLowerCase()}`
}

/**
 * Enregistre une tentative et dit si elle est tolérée.
 *
 * Appelée **après** un échec, jamais avant : une connexion réussie ne consomme
 * pas de crédit.
 */
export async function enregistrerTentative(
  politique: NomPolitique,
  sujet: string,
): Promise<Verdict> {
  const { limite, fenetreMs } = POLITIQUES[politique]
  const cle = cleComplete(politique, sujet)
  const depuis = new Date(Date.now() - fenetreMs)

  await db.rateLimitHit.deleteMany({
    where: { cle, createdAt: { lt: depuis } },
  })
  await db.rateLimitHit.create({ data: { cle } })

  const tentatives = await db.rateLimitHit.findMany({
    where: { cle, createdAt: { gte: depuis } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })

  if (tentatives.length < limite) {
    return { autorise: true, minutesAvantReprise: 0 }
  }

  const plusAncienne = tentatives[0]?.createdAt ?? new Date()
  const reste = plusAncienne.getTime() + fenetreMs - Date.now()
  return {
    autorise: false,
    minutesAvantReprise: Math.max(1, Math.ceil(reste / MINUTE)),
  }
}

/** Vrai si le sujet est déjà bloqué, sans consommer de tentative. */
export async function estBloque(
  politique: NomPolitique,
  sujet: string,
): Promise<Verdict> {
  const { limite, fenetreMs } = POLITIQUES[politique]
  const cle = cleComplete(politique, sujet)
  const depuis = new Date(Date.now() - fenetreMs)

  const tentatives = await db.rateLimitHit.findMany({
    where: { cle, createdAt: { gte: depuis } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })

  if (tentatives.length < limite) {
    return { autorise: true, minutesAvantReprise: 0 }
  }

  const plusAncienne = tentatives[0]?.createdAt ?? new Date()
  const reste = plusAncienne.getTime() + fenetreMs - Date.now()
  return {
    autorise: false,
    minutesAvantReprise: Math.max(1, Math.ceil(reste / MINUTE)),
  }
}

/** Lève un refus si le sujet est bloqué. */
export async function exigerCredit(
  politique: NomPolitique,
  sujet: string,
): Promise<void> {
  const verdict = await estBloque(politique, sujet)
  if (!verdict.autorise) throw new ErreurMetier('RATE_LIMITED')
}

/** Efface le compteur d'un sujet — après une réussite, par exemple. */
export async function oublierTentatives(
  politique: NomPolitique,
  sujet: string,
): Promise<void> {
  await db.rateLimitHit.deleteMany({
    where: { cle: cleComplete(politique, sujet) },
  })
}
