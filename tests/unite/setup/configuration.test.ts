import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { EnvInvalideError, parseEnv } from '@/env/schema'

const racine = process.cwd()
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf8')

describe('SETUP-003 — TypeScript en mode strict', () => {
  const tsconfig = JSON.parse(lire('tsconfig.json')) as {
    compilerOptions: Record<string, unknown>
  }

  it('active `strict`', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true)
  })

  it('active `noUncheckedIndexedAccess`', () => {
    expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true)
  })

  it('n’autorise pas de JavaScript non typé', () => {
    expect(tsconfig.compilerOptions.allowJs).toBe(false)
  })

  it('n’ignore pas les erreurs de type au build', () => {
    const config = lire('next.config.ts')
    expect(config).toContain('ignoreBuildErrors: false')
    expect(config).toContain('ignoreDuringBuilds: false')
  })
})

describe('SETUP-004 — variable d’environnement manquante', () => {
  const complet = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u@localhost:5432/solenne',
    AUTH_SECRET: 'x'.repeat(32),
    APP_URL: 'http://localhost:3000',
  }

  it('nomme la variable absente', () => {
    const { DATABASE_URL: _absente, ...sansBase } = complet
    expect(() => parseEnv(sansBase)).toThrow(EnvInvalideError)
    try {
      parseEnv(sansBase)
    } catch (erreur) {
      expect((erreur as EnvInvalideError).problemes).toContain(
        'Variable manquante : DATABASE_URL',
      )
      expect((erreur as Error).message).toContain(
        'Variable manquante : DATABASE_URL',
      )
    }
  })

  it('traite une variable vide comme absente', () => {
    expect(() => parseEnv({ ...complet, AUTH_SECRET: '   ' })).toThrow(
      /Variable manquante : AUTH_SECRET/,
    )
  })

  it('signale toutes les variables manquantes d’un coup', () => {
    try {
      parseEnv({ NODE_ENV: 'development' })
      throw new Error('la validation aurait dû échouer')
    } catch (erreur) {
      const problemes = (erreur as EnvInvalideError).problemes
      expect(problemes).toContain('Variable manquante : DATABASE_URL')
      expect(problemes).toContain('Variable manquante : AUTH_SECRET')
      expect(problemes).toContain('Variable manquante : APP_URL')
    }
  })

  it('refuse une URL de base qui n’est pas PostgreSQL', () => {
    expect(() =>
      parseEnv({ ...complet, DATABASE_URL: 'mysql://u@localhost/solenne' }),
    ).toThrow(/DATABASE_URL/)
  })

  it('refuse un secret d’authentification trop court', () => {
    expect(() => parseEnv({ ...complet, AUTH_SECRET: 'court' })).toThrow(
      /AUTH_SECRET/,
    )
  })

  it('exige la configuration d’envoi d’emails en production seulement', () => {
    expect(() => parseEnv({ ...complet, NODE_ENV: 'production' })).toThrow(
      /RESEND_API_KEY/,
    )
    expect(() =>
      parseEnv({
        ...complet,
        NODE_ENV: 'production',
        RESEND_API_KEY: 'cle',
        EMAIL_FROM: 'La maison <bonjour@exemple.test>',
      }),
    ).not.toThrow()
  })

  it('accepte un environnement complet et applique les valeurs par défaut', () => {
    const env = parseEnv(complet)
    expect(env.NODE_ENV).toBe('development')
    expect(env.RESEND_API_KEY).toBe('')
  })

  it('n’écrit jamais le domaine en dur : il vient de APP_URL (D6)', () => {
    const env = parseEnv({ ...complet, APP_URL: 'https://chezsolenne.fr' })
    expect(env.APP_URL).toBe('https://chezsolenne.fr')

    // Aucun fichier source ne doit contenir les domaines candidats.
    const sources = ['src/env/schema.ts', 'src/app/layout.tsx', 'prisma/seed.ts']
    for (const chemin of sources) {
      const contenu = lire(chemin)
      expect(contenu, chemin).not.toContain('chezsolenne.fr')
      expect(contenu, chemin).not.toContain('mamasolenne.fr')
    }
  })

  it('déclenche la vérification au chargement de la configuration Next', () => {
    const config = lire('next.config.ts')
    expect(config).toContain('verifierEnvironnementAuDemarrage()')
  })
})

describe('SETUP-011 — l’intégration continue bloque au rouge', () => {
  const ci = lire('.github/workflows/ci.yml')

  it('exécute types, style, tests et build', () => {
    for (const commande of [
      'npm run typecheck',
      'npm run lint',
      'npm test',
      'npm run build',
    ]) {
      expect(ci).toContain(commande)
    }
  })

  it('ne neutralise aucune étape', () => {
    expect(ci).not.toContain('continue-on-error')
    expect(ci).not.toMatch(/if:\s*always\(\)/)
  })

  it('se déclenche sur les demandes de fusion vers `main`', () => {
    expect(ci).toMatch(/pull_request:\s*\n\s*branches:\s*\[main\]/)
  })

  it('fait dépendre les parcours end-to-end de la vérification', () => {
    expect(ci).toContain('needs: verification')
  })
})

describe('Scripts du projet', () => {
  const paquet = JSON.parse(lire('package.json')) as {
    scripts: Record<string, string>
  }

  it('expose les commandes attendues par la fiche SETUP', () => {
    for (const script of [
      'dev',
      'build',
      'test',
      'test:e2e',
      'db:migrate',
      'db:seed',
      'db:reset',
    ]) {
      expect(paquet.scripts, script).toHaveProperty(script)
    }
  })
})
