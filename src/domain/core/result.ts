import type { CodeErreur } from './error-codes'
import { messagePour, type ParametresMessage } from './messages'

/**
 * Type de résultat unique à toute l'application.
 *
 * CORE-R1 / CORE-005 : aucune exception ne traverse la frontière serveur.
 * Une Server Action renvoie toujours `Succes<T>` ou `Echec`, jamais une erreur
 * levée, jamais un objet libre.
 */
export type Succes<T> = { readonly ok: true; readonly data: T }

export type Echec = {
  readonly ok: false
  readonly code: CodeErreur
  readonly message: string
  /** Messages par champ, pour un formulaire. Absent hors validation. */
  readonly champs?: Readonly<Record<string, string>>
}

export type Resultat<T> = Succes<T> | Echec

export function succes(): Succes<null>
export function succes<T>(data: T): Succes<T>
export function succes<T>(data?: T): Succes<T | null> {
  return { ok: true, data: data === undefined ? null : data }
}

export function echec(
  code: CodeErreur,
  options?: {
    readonly parametres?: ParametresMessage
    readonly champs?: Readonly<Record<string, string>>
  },
): Echec {
  const base = {
    ok: false as const,
    code,
    message: messagePour(code, options?.parametres),
  }
  return options?.champs ? { ...base, champs: options.champs } : base
}

export function estSucces<T>(resultat: Resultat<T>): resultat is Succes<T> {
  return resultat.ok
}

export function estEchec<T>(resultat: Resultat<T>): resultat is Echec {
  return !resultat.ok
}

/**
 * Erreur métier levée depuis le domaine et convertie en `Echec` à la frontière.
 * Elle ne porte aucun détail technique : son message vient du catalogue.
 */
export class ErreurMetier extends Error {
  readonly code: CodeErreur
  readonly parametres?: ParametresMessage
  readonly champs?: Readonly<Record<string, string>>

  constructor(
    code: CodeErreur,
    options?: {
      readonly parametres?: ParametresMessage
      readonly champs?: Readonly<Record<string, string>>
    },
  ) {
    super(messagePour(code, options?.parametres))
    this.name = 'ErreurMetier'
    this.code = code
    if (options?.parametres) this.parametres = options.parametres
    if (options?.champs) this.champs = options.champs
  }

  versEchec(): Echec {
    return echec(this.code, {
      ...(this.parametres ? { parametres: this.parametres } : {}),
      ...(this.champs ? { champs: this.champs } : {}),
    })
  }
}
