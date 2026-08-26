import { z } from 'zod'

/**
 * Contrat des variables d'environnement.
 *
 * Règle SETUP : l'application refuse de démarrer si une variable obligatoire
 * manque, avec un message qui nomme la variable (SETUP-004).
 *
 * Ce module est volontairement pur : il ne lit pas `process.env` lui-même, ce
 * qui le rend testable sans polluer l'environnement du processus de test.
 */

const nonEmpty = (nom: string) =>
  z
    .string({ error: `Variable manquante : ${nom}` })
    .trim()
    .min(1, { error: `Variable manquante : ${nom}` })

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    DATABASE_URL: nonEmpty('DATABASE_URL').refine(
      (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
      { error: 'Variable invalide : DATABASE_URL doit être une URL PostgreSQL' },
    ),

    TEST_DATABASE_URL: z.string().trim().optional(),

    AUTH_SECRET: nonEmpty('AUTH_SECRET').min(32, {
      error: 'Variable invalide : AUTH_SECRET doit faire au moins 32 caractères',
    }),

    // D6 — le domaine n'est pas arrêté : il vit ici, jamais en dur dans le code.
    APP_URL: nonEmpty('APP_URL').refine((v) => URL.canParse(v), {
      error: 'Variable invalide : APP_URL doit être une URL absolue',
    }),

    RESEND_API_KEY: z.string().trim().optional().default(''),
    EMAIL_FROM: z.string().trim().optional().default(''),
  })
  .superRefine((valeurs, ctx) => {
    // En production seulement, l'envoi d'emails doit être réellement configuré.
    if (valeurs.NODE_ENV !== 'production') return

    if (!valeurs.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Variable manquante : RESEND_API_KEY',
      })
    }
    if (!valeurs.EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'Variable manquante : EMAIL_FROM',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

/**
 * La base Netlify DB (Neon en coulisses) injecte sa chaîne de connexion sous
 * `NETLIFY_DB_URL` (documentation Netlify, août 2026), jamais sous
 * `DATABASE_URL` — c'est elle qui gère le nom, pas nous. `NETLIFY_DATABASE_URL`
 * est tolérée en plus par prudence, au cas où la variable serait renommée.
 * Repli transparent : `DATABASE_URL` reste la seule variable que Prisma et le
 * reste du code connaissent.
 */
export function resoudreSourceEnv(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  if (source.DATABASE_URL) return source
  const repli = source.NETLIFY_DB_URL ?? source.NETLIFY_DATABASE_URL
  if (!repli) return source
  return { ...source, DATABASE_URL: repli }
}

/** Nom des variables sans lesquelles l'application ne démarre pas. */
export const VARIABLES_OBLIGATOIRES = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'APP_URL',
] as const

export class EnvInvalideError extends Error {
  readonly problemes: readonly string[]

  constructor(problemes: readonly string[]) {
    super(
      [
        "Configuration incomplète : l'application ne peut pas démarrer.",
        ...problemes.map((p) => `  · ${p}`),
        '',
        'Renseignez ces variables dans `.env` (modèle : `.env.example`).',
      ].join('\n'),
    )
    this.name = 'EnvInvalideError'
    this.problemes = problemes
  }
}

/**
 * Valide un jeu de variables. Lève `EnvInvalideError` au premier défaut,
 * en listant **tous** les problèmes d'un coup plutôt qu'un seul.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const resultat = envSchema.safeParse(source)
  if (resultat.success) return resultat.data

  const problemes = resultat.error.issues.map((issue) => {
    const champ = issue.path[0]
    // Zod remplace un message personnalisé par le sien quand la clé est absente
    // du tout : on reconstruit alors le message attendu.
    if (issue.code === 'invalid_type' && typeof champ === 'string') {
      return `Variable manquante : ${champ}`
    }
    return issue.message
  })

  throw new EnvInvalideError([...new Set(problemes)])
}
