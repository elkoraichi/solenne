import 'server-only'

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { env } from '@/env'
import { journal } from '@/server/logging/logger'

/**
 * Envoi de courriers électroniques.
 *
 * L'envoi réel arrive au lot 6 (`MAIL`), quand le domaine sera arrêté et validé
 * (D6, limite L1). D'ici là, un émetteur local écrit chaque message dans
 * `.courriers/` : les parcours d'invitation et de réinitialisation sont
 * entièrement jouables sans dépendance externe.
 *
 * CORE-R4 / PWD-018 : le journal ne reçoit que le destinataire et l'objet.
 * **Jamais le lien**, qui contient un jeton.
 */

export interface Courrier {
  readonly destinataire: string
  readonly sujet: string
  readonly texte: string
  /** Lien à usage unique, s'il y en a un. Ne doit jamais être journalisé. */
  readonly lien?: string
}

export type Emetteur = (courrier: Courrier) => Promise<void>

const DOSSIER_COURRIERS = '.courriers'

const emetteurLocal: Emetteur = async (courrier) => {
  await mkdir(DOSSIER_COURRIERS, { recursive: true })
  const nom = `${new Date().toISOString().replace(/[:.]/g, '-')}-${courrier.destinataire.replace(/[^\w.@-]/g, '_')}.txt`
  const contenu = [
    `À : ${courrier.destinataire}`,
    `Objet : ${courrier.sujet}`,
    '',
    courrier.texte,
    ...(courrier.lien ? ['', `Lien : ${courrier.lien}`] : []),
  ].join('\n')

  await writeFile(join(DOSSIER_COURRIERS, nom), contenu, 'utf8')
}

const emetteurNonConfigure: Emetteur = async (courrier) => {
  throw new Error(
    `Aucun émetteur d'email configuré en production (destinataire : ${courrier.destinataire})`,
  )
}

let emetteur: Emetteur =
  env.NODE_ENV === 'production' ? emetteurNonConfigure : emetteurLocal

/** Remplace l'émetteur. Prévu pour les tests et pour le lot 6. */
export function configurerEmetteur(nouveau: Emetteur): () => void {
  const precedent = emetteur
  emetteur = nouveau
  return () => {
    emetteur = precedent
  }
}

export async function envoyerCourrier(courrier: Courrier): Promise<void> {
  await emetteur(courrier)

  journal.info('Courrier émis', {
    action: 'courrier.envoi',
    detail: { destinataire: courrier.destinataire, sujet: courrier.sujet },
  })
}

/** Construit une URL absolue à partir de `APP_URL` — jamais de domaine en dur (D6). */
export function lienAbsolu(chemin: string): string {
  return new URL(chemin, env.APP_URL).toString()
}
