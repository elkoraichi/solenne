/**
 * Masquage des secrets avant journalisation (CORE-R4, CORE-006).
 *
 * Le principe est volontairement pessimiste : on masque sur la **forme du nom
 * de champ**, pas sur une liste exhaustive de champs connus. Un champ ajouté
 * demain et nommé `resetToken` sera masqué sans qu'on ait à y penser.
 */

export const MARQUEUR_MASQUE = '[masqué]'

const FRAGMENTS_SENSIBLES = [
  'password',
  'motdepasse',
  'passe',
  'token',
  'secret',
  'hash',
  'authorization',
  'cookie',
  'apikey',
  'credential',
  'jeton',
] as const

const PROFONDEUR_MAX = 6
const LONGUEUR_TEXTE_MAX = 2_000

export function estChampSensible(nom: string): boolean {
  const normalise = nom.toLowerCase().replace(/[^a-z]/g, '')
  return FRAGMENTS_SENSIBLES.some((fragment) => normalise.includes(fragment))
}

/**
 * Renvoie une copie de la valeur, secrets masqués, cycles coupés et textes
 * démesurés tronqués. Ne modifie jamais l'original.
 */
export function masquerSecrets(valeur: unknown): unknown {
  return parcourir(valeur, 0, new WeakSet())
}

function parcourir(
  valeur: unknown,
  profondeur: number,
  vus: WeakSet<object>,
): unknown {
  if (valeur === null || valeur === undefined) return valeur

  if (typeof valeur === 'string') {
    return valeur.length > LONGUEUR_TEXTE_MAX
      ? `${valeur.slice(0, LONGUEUR_TEXTE_MAX)}… (${valeur.length} caractères)`
      : valeur
  }

  if (
    typeof valeur === 'number' ||
    typeof valeur === 'boolean' ||
    typeof valeur === 'bigint'
  ) {
    return typeof valeur === 'bigint' ? valeur.toString() : valeur
  }

  if (typeof valeur === 'function' || typeof valeur === 'symbol') {
    return `[${typeof valeur}]`
  }

  if (valeur instanceof Date) return valeur.toISOString()

  if (valeur instanceof Error) {
    return {
      nom: valeur.name,
      message: valeur.message,
      pile: valeur.stack ?? null,
      ...(valeur.cause !== undefined
        ? { cause: parcourir(valeur.cause, profondeur + 1, vus) }
        : {}),
    }
  }

  if (profondeur >= PROFONDEUR_MAX) return '[profondeur maximale atteinte]'

  if (typeof valeur === 'object') {
    if (vus.has(valeur)) return '[référence circulaire]'
    vus.add(valeur)

    if (Array.isArray(valeur)) {
      return valeur.map((element) => parcourir(element, profondeur + 1, vus))
    }

    const sortie: Record<string, unknown> = {}
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      sortie[cle] = estChampSensible(cle)
        ? MARQUEUR_MASQUE
        : parcourir(v, profondeur + 1, vus)
    }
    return sortie
  }

  return String(valeur)
}
