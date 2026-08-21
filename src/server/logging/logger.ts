import { masquerSecrets } from './redaction'

/**
 * Journalisation structurée.
 *
 * CORE-R3 : toute erreur est journalisée avec son détail technique complet.
 * CORE-R4 : aucun secret n'y figure — le masquage est appliqué systématiquement,
 * pas à la discrétion de l'appelant.
 * CORE-004 : niveau, horodatage, utilisateur, action et détail sont présents.
 */

export type NiveauJournal = 'debug' | 'info' | 'warn' | 'error'

export interface EntreeJournal {
  readonly niveau: NiveauJournal
  readonly horodatage: string
  readonly message: string
  readonly utilisateurId: string | null
  readonly action: string | null
  readonly detail: unknown
}

export interface ContexteJournal {
  readonly utilisateurId?: string | null
  readonly action?: string | null
  readonly detail?: unknown
}

export type SortieJournal = (entree: EntreeJournal) => void

const sortieConsole: SortieJournal = (entree) => {
  const ligne = JSON.stringify(entree)
  if (entree.niveau === 'error') console.error(ligne)
  else if (entree.niveau === 'warn') console.warn(ligne)
  else console.log(ligne)
}

let sortie: SortieJournal = sortieConsole

/** Remplace la destination du journal. Prévu pour les tests et l'observabilité. */
export function configurerSortieJournal(nouvelle: SortieJournal): () => void {
  const precedente = sortie
  sortie = nouvelle
  return () => {
    sortie = precedente
  }
}

export function retablirSortieJournalParDefaut(): void {
  sortie = sortieConsole
}

function ecrire(
  niveau: NiveauJournal,
  message: string,
  contexte?: ContexteJournal,
): EntreeJournal {
  const entree: EntreeJournal = {
    niveau,
    horodatage: new Date().toISOString(),
    message,
    utilisateurId: contexte?.utilisateurId ?? null,
    action: contexte?.action ?? null,
    detail:
      contexte?.detail === undefined ? null : masquerSecrets(contexte.detail),
  }
  sortie(entree)
  return entree
}

export const journal = {
  debug: (message: string, contexte?: ContexteJournal) =>
    ecrire('debug', message, contexte),
  info: (message: string, contexte?: ContexteJournal) =>
    ecrire('info', message, contexte),
  warn: (message: string, contexte?: ContexteJournal) =>
    ecrire('warn', message, contexte),
  error: (message: string, contexte?: ContexteJournal) =>
    ecrire('error', message, contexte),
}
