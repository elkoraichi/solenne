/**
 * Faux `next/headers` pour les tests.
 *
 * Les Server Actions lisent le cookie de session et les en-têtes de la requête.
 * Hors serveur Next, ces API lèvent. On les remplace par un pot à cookies en
 * mémoire, partagé via `globalThis` pour que le module moqué et le test voient
 * exactement le même état.
 */

export interface CookiePose {
  value: string
  options?: Record<string, unknown>
}

interface Bocal {
  cookies: Map<string, CookiePose>
  entetes: Map<string, string>
}

const cle = Symbol.for('solenne.tests.bocal')

function bocal(): Bocal {
  const global = globalThis as unknown as Record<symbol, Bocal | undefined>
  global[cle] ??= { cookies: new Map(), entetes: new Map() }
  return global[cle] as Bocal
}

// --- API exposée aux tests ---------------------------------------------------

export function reinitialiserRequete(): void {
  const b = bocal()
  b.cookies.clear()
  b.entetes.clear()
  b.entetes.set('x-forwarded-for', '203.0.113.7')
  b.entetes.set('user-agent', 'Tests/1.0')
}

export function cookieCourant(nom: string): CookiePose | undefined {
  return bocal().cookies.get(nom)
}

export function poserCookie(nom: string, valeur: string): void {
  bocal().cookies.set(nom, { value: valeur })
}

export function retirerCookie(nom: string): void {
  bocal().cookies.delete(nom)
}

export function definirEntete(nom: string, valeur: string): void {
  bocal().entetes.set(nom.toLowerCase(), valeur)
}

/** Isole une exécution : chaque « requête » simulée a son propre contexte. */
export async function dansUneRequete<T>(
  traitement: () => Promise<T>,
  options?: { readonly cookies?: Record<string, string>; readonly ip?: string },
): Promise<T> {
  reinitialiserRequete()
  if (options?.ip) definirEntete('x-forwarded-for', options.ip)
  for (const [nom, valeur] of Object.entries(options?.cookies ?? {})) {
    poserCookie(nom, valeur)
  }
  return traitement()
}

// --- Ce que voit le code applicatif -----------------------------------------

export async function cookies() {
  const b = bocal()
  return {
    get(nom: string) {
      const pose = b.cookies.get(nom)
      return pose ? { name: nom, value: pose.value } : undefined
    },
    set(nom: string, valeur: string, options?: Record<string, unknown>) {
      b.cookies.set(nom, { value: valeur, ...(options ? { options } : {}) })
    },
    delete(nom: string) {
      b.cookies.delete(nom)
    },
    getAll() {
      return [...b.cookies.entries()].map(([name, pose]) => ({
        name,
        value: pose.value,
      }))
    },
  }
}

export async function headers() {
  const b = bocal()
  return {
    get(nom: string) {
      return b.entetes.get(nom.toLowerCase()) ?? null
    },
    has(nom: string) {
      return b.entetes.has(nom.toLowerCase())
    },
  }
}
