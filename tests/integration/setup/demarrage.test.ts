import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { urlBaseDeTest } from '../aide-base'

const executer = promisify(execFile)

function portLibre(): Promise<number> {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer()
    serveur.once('error', rejeter)
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address()
      const port = typeof adresse === 'object' && adresse ? adresse.port : 0
      serveur.close(() => resoudre(port))
    })
  })
}

async function attendreReponse(
  url: string,
  limiteMs: number,
): Promise<Response> {
  const echeance = Date.now() + limiteMs
  let derniereErreur: unknown
  while (Date.now() < echeance) {
    try {
      const reponse = await fetch(url)
      if (reponse.status < 500) return reponse
    } catch (erreur) {
      derniereErreur = erreur
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    `Le serveur n'a pas répondu en ${limiteMs} ms — ${String(derniereErreur)}`,
  )
}

describe('SETUP-001 — le projet démarre en développement', () => {
  it('écoute et répond 200 sur la page d’accueil', async () => {
    const port = await portLibre()
    const serveur = spawn('npx', ['next', 'dev', '--port', String(port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: urlBaseDeTest(),
        NODE_ENV: 'development',
      },
      stdio: 'pipe',
    })

    let journal = ''
    serveur.stdout?.on('data', (morceau) => {
      journal += String(morceau)
    })
    serveur.stderr?.on('data', (morceau) => {
      journal += String(morceau)
    })

    try {
      const reponse = await attendreReponse(
        `http://127.0.0.1:${port}/`,
        180_000,
      )
      expect(reponse.status, journal.slice(-2_000)).toBe(200)

      const html = await reponse.text()
      expect(html).toContain('<html lang="fr"')
      // Aucune trace technique sur la page rendue (CORE-R1).
      expect(html).not.toContain('PrismaClient')
      expect(html).not.toContain('at Object.')
    } finally {
      serveur.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 500))
      if (!serveur.killed) serveur.kill('SIGKILL')
    }
  }, 240_000)
})

describe('SETUP-004 — refus de démarrer sans variable obligatoire', () => {
  it('s’arrête en nommant la variable absente', async () => {
    const { DATABASE_URL: _retiree, ...environnementIncomplet } = process.env

    let code: number | undefined
    let sortie = ''
    try {
      await executer(
        'npx',
        [
          'tsx',
          '-e',
          "import('./src/env/boot').then((m) => m.verifierEnvironnementAuDemarrage())",
        ],
        {
          cwd: process.cwd(),
          env: { ...environnementIncomplet, TEST_DATABASE_URL: '' },
        },
      )
    } catch (erreur) {
      const details = erreur as { code?: number; stderr?: string }
      code = details.code
      sortie = String(details.stderr ?? '')
    }

    expect(code).toBe(1)
    expect(sortie).toContain('Variable manquante : DATABASE_URL')
    // Message lisible, sans pile d'appels.
    expect(sortie).not.toContain('at Object.')
  }, 120_000)
})

describe('SETUP-002 — le build de production réussit', () => {
  it('se termine sans erreur ni avertissement TypeScript', async () => {
    const { stdout, stderr } = await executer('npx', ['next', 'build'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: urlBaseDeTest(),
        NODE_ENV: 'production',
        RESEND_API_KEY: 'cle-de-build',
        EMAIL_FROM: 'La maison <bonjour@exemple.test>',
      },
      maxBuffer: 32 * 1024 * 1024,
    })

    const sortie = `${stdout}\n${stderr}`
    expect(sortie).not.toMatch(/Failed to compile/i)
    expect(sortie).not.toMatch(/Type error/i)
    expect(sortie).toMatch(/Compiled successfully|Generating static pages/i)
  }, 480_000)
})
