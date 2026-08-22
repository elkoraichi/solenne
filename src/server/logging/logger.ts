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

const RANG: Readonly<Record<NiveauJournal, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * Seuil d'écriture sur la console — `JOURNAL_NIVEAU_MIN`, ou `silence`.
 *
 * En production et en développement, tout s'écrit : c'est le journal.
 * Pendant les tests, non. Les grilles S1→S12 provoquent des centaines de refus
 * **attendus**, chacun avec son détail technique et sa pile : ils noyaient la
 * sortie, où seuls les échecs doivent se lire. Le journal n'est pas désactivé
 * pour autant — les tests qui l'éprouvent (CORE-004) installent leur propre
 * destination par `configurerSortieJournal` et ne perdent rien.
 */
const SEUIL: number = (() => {
  const demande = process.env.JOURNAL_NIVEAU_MIN
  if (demande === 'silence') return Number.POSITIVE_INFINITY
  if (demande && demande in RANG) return RANG[demande as NiveauJournal]
  return process.env.VITEST ? Number.POSITIVE_INFINITY : 0
})()

const sortieConsole: SortieJournal = (entree) => {
  if (RANG[entree.niveau] < SEUIL) return
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
