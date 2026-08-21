import { ZodError } from 'zod'

import { echec, ErreurMetier, type Echec } from '@/domain/core/result'
import { champsDepuisZod } from '@/domain/core/validation'
import { journal } from '@/server/logging/logger'

/**
 * Frontière unique entre le monde technique et l'utilisateur.
 *
 * CORE-R1 / CORE-001 / CORE-002 : rien de ce qui entre ici — pile d'appels,
 * requête SQL, nom de fichier, code Prisma — ne ressort dans l'objet renvoyé.
 * Le détail complet part au journal (CORE-R3), le message part à l'écran.
 */

interface ContexteErreur {
  readonly action: string
  readonly utilisateurId?: string | null
}

/** Erreurs Prisma reconnues sans importer le client (évite un couplage inutile). */
interface ErreurPrismaLike {
  readonly code: string
  readonly meta?: Record<string, unknown>
}

function estErreurPrisma(valeur: unknown): valeur is ErreurPrismaLike & Error {
  if (!(valeur instanceof Error)) return false
  const code = (valeur as Error & { code?: unknown }).code
  return typeof code === 'string' && /^P\d{4}$/.test(code)
}

/**
 * Cherche le nom du champ en conflit.
 *
 * Prisma 7 avec adaptateur `pg` ne remplit plus `meta.target` : la liste des
 * champs est enfouie dans l'erreur du pilote. On regarde donc aux trois
 * endroits possibles, message compris, plutôt que de dépendre d'une forme.
 */
function conflitPorteSur(
  erreur: ErreurPrismaLike & Error,
  champ: string,
): boolean {
  // Bornes de mot : `email_change_requests_token_hash_key` ne doit pas passer
  // pour un conflit sur `email`.
  const motif = new RegExp(`\\b${champ}\\b`)
  const contient = (valeur: unknown): boolean => {
    if (typeof valeur === 'string') return motif.test(valeur)
    if (Array.isArray(valeur)) return valeur.some(contient)
    if (valeur && typeof valeur === 'object') {
      return Object.values(valeur).some(contient)
    }
    return false
  }
  return contient(erreur.meta) || motif.test(erreur.message)
}

/** Contraintes de base de données converties en refus métier explicites. */
const CONTRAINTES = {
  stays_sans_chevauchement_exclusif: 'EXCLUSIVE_CONFLICT',
  events_sans_chevauchement: 'EVENT_OVERLAP',
} as const

function contrainteViolee(erreur: Error): Echec | null {
  const texte = `${erreur.message}`
  for (const [nom, code] of Object.entries(CONTRAINTES)) {
    if (texte.includes(nom)) return echec(code)
  }
  return null
}

function classer(erreur: unknown): Echec {
  if (erreur instanceof ErreurMetier) return erreur.versEchec()

  if (erreur instanceof ZodError) {
    return echec('VALIDATION', { champs: champsDepuisZod(erreur) })
  }

  if (estErreurPrisma(erreur)) {
    switch (erreur.code) {
      case 'P2002':
        return conflitPorteSur(erreur, 'email')
          ? echec('DUPLICATE_EMAIL')
          : echec('CONFLICT')
      case 'P2025':
        return echec('NOT_FOUND')
      case 'P2003':
      case 'P2014':
        return echec('CONFLICT')
      default:
        return echec('INTERNAL')
    }
  }

  if (erreur instanceof Error) {
    // Contrainte d'exclusion PostgreSQL remontée par une requête brute.
    const surContrainte = contrainteViolee(erreur)
    if (surContrainte) return surContrainte
  }

  return echec('INTERNAL')
}

/**
 * Convertit n'importe quelle erreur en `Echec` présentable, et journalise le
 * détail technique complet.
 */
export function versEchec(erreur: unknown, contexte: ContexteErreur): Echec {
  const resultat = classer(erreur)

  const niveau =
    resultat.code === 'INTERNAL' || resultat.code === 'CONFLICT'
      ? 'error'
      : 'warn'

  journal[niveau](`Action refusée : ${resultat.code}`, {
    action: contexte.action,
    utilisateurId: contexte.utilisateurId ?? null,
    detail: erreur,
  })

  return resultat
}
