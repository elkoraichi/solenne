import { afterEach, describe, expect, it, vi } from 'vitest'

import { CATALOGUE_MESSAGES } from '@/domain/core/messages'
import { echec, ErreurMetier, succes } from '@/domain/core/result'
import { executerAction } from '@/server/actions/executer'
import { versEchec } from '@/server/errors'
import {
  configurerSortieJournal,
  retablirSortieJournalParDefaut,
  type EntreeJournal,
} from '@/server/logging/logger'

/** Fabrique une erreur au format de celles que lève Prisma. */
function erreurPrisma(code: string, meta?: Record<string, unknown>) {
  const erreur = new Error(
    `\nInvalid \`prisma.user.findMany()\` invocation in\n/app/src/server/db.ts:42:15\n\n${code}`,
  ) as Error & { code: string; meta?: Record<string, unknown> }
  erreur.name = 'PrismaClientKnownRequestError'
  erreur.code = code
  if (meta) erreur.meta = meta
  return erreur
}

function capturerJournal() {
  const entrees: EntreeJournal[] = []
  const restaurer = configurerSortieJournal((entree) => entrees.push(entree))
  return { entrees, restaurer }
}

afterEach(() => {
  retablirSortieJournalParDefaut()
  vi.restoreAllMocks()
})

describe('CORE-001 — erreur de base de données convertie', () => {
  it('rend le message générique du catalogue, sans terme technique', () => {
    const { entrees, restaurer } = capturerJournal()
    const resultat = versEchec(erreurPrisma('P1001'), {
      action: 'lireSejours',
    })
    restaurer()

    expect(resultat.ok).toBe(false)
    expect(resultat.code).toBe('INTERNAL')
    expect(resultat.message).toBe(CATALOGUE_MESSAGES.INTERNAL)
    expect(resultat.message).toContain('Vous pouvez réessayer')
    // Le détail technique, lui, est bien parti au journal (CORE-R3).
    expect(entrees).toHaveLength(1)
    expect(JSON.stringify(entrees[0]?.detail)).toContain('P1001')
  })
})

describe('CORE-002 — aucune pile d’appels exposée', () => {
  const fuites = [
    'PrismaClientKnownRequestError',
    'prisma.user.findMany',
    '/app/src/server/db.ts',
    'SELECT',
    'at Object.',
    'P1001',
    'P2002',
  ]

  it('ne laisse filtrer ni pile, ni nom de fichier, ni requête', () => {
    const restaurer = configurerSortieJournal(() => {})
    const brute = new Error(
      'SELECT * FROM "users" WHERE email = $1 — connection refused',
    )
    brute.stack =
      'Error: SELECT * FROM "users"\n    at Object.<anonymous> (/app/src/server/db.ts:42:15)'

    const resultat = versEchec(brute, { action: 'lireUtilisateurs' })
    restaurer()

    const charge = JSON.stringify(resultat)
    for (const fuite of fuites) {
      expect(charge).not.toContain(fuite)
    }
    expect(Object.keys(resultat).sort()).toEqual(['code', 'message', 'ok'])
  })

  it('ne laisse filtrer aucun détail à travers l’enveloppe de Server Action', async () => {
    const restaurer = configurerSortieJournal(() => {})
    const resultat = await executerAction('actionQuiPlante', async () => {
      throw erreurPrisma('P2002', { target: ['nom_interne_confidentiel'] })
    })
    restaurer()

    const charge = JSON.stringify(resultat)
    for (const fuite of [...fuites, 'nom_interne_confidentiel']) {
      expect(charge).not.toContain(fuite)
    }
  })
})

describe('CORE-003 — violation d’unicité', () => {
  it('renvoie un code stable et le message « Cet email est déjà utilisé »', () => {
    const restaurer = configurerSortieJournal(() => {})
    const resultat = versEchec(erreurPrisma('P2002', { target: ['email'] }), {
      action: 'creerUtilisateur',
    })
    restaurer()

    expect(resultat.code).toBe('DUPLICATE_EMAIL')
    expect(resultat.message).toBe('Cet email est déjà utilisé.')
  })

  it('retombe sur un conflit générique quand l’unicité ne porte pas sur l’email', () => {
    const restaurer = configurerSortieJournal(() => {})
    const resultat = versEchec(
      erreurPrisma('P2002', { target: ['event_id', 'user_id'] }),
      { action: 'repondreInvitation' },
    )
    restaurer()

    expect(resultat.code).toBe('CONFLICT')
  })

  it('traduit une ligne introuvable en « page introuvable »', () => {
    const restaurer = configurerSortieJournal(() => {})
    const resultat = versEchec(erreurPrisma('P2025'), { action: 'lireSejour' })
    restaurer()

    expect(resultat.code).toBe('NOT_FOUND')
  })
})

describe('CORE-005 — résultat typé', () => {
  it('renvoie { ok: true, data } sur le cas nominal', async () => {
    const resultat = await executerAction('lireProfil', async () =>
      succes({ prenom: 'Solenne' }),
    )
    expect(resultat).toEqual({ ok: true, data: { prenom: 'Solenne' } })
  })

  it('accepte un succès sans charge utile', async () => {
    const resultat = await executerAction('marquerLu', async () => succes())
    expect(resultat).toEqual({ ok: true, data: null })
  })

  it('ne laisse jamais une exception traverser la frontière serveur', async () => {
    const restaurer = configurerSortieJournal(() => {})
    const resultat = await executerAction('actionQuiPlante', async () => {
      throw new TypeError('undefined is not a function')
    })
    restaurer()

    expect(resultat.ok).toBe(false)
    expect(resultat).toMatchObject({ code: 'INTERNAL' })
  })

  it('convertit une erreur métier en refus explicite', async () => {
    const restaurer = configurerSortieJournal(() => {})
    const resultat = await executerAction('demanderSejour', async () => {
      throw new ErreurMetier('CAPACITY_EXCEEDED', {
        parametres: { n: 12, max: 10 },
      })
    })
    restaurer()

    expect(resultat).toEqual({
      ok: false,
      code: 'CAPACITY_EXCEEDED',
      message: 'La maison serait à 12 personnes pour 10 places.',
    })
  })

  it('laisse passer les redirections de Next sans les avaler', async () => {
    const redirection = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/connexion;307;',
    })
    await expect(
      executerAction('actionQuiRedirige', async () => {
        throw redirection
      }),
    ).rejects.toBe(redirection)
  })

  it('traduit une contrainte d’exclusion PostgreSQL en refus métier', () => {
    const restaurer = configurerSortieJournal(() => {})
    const resultat = versEchec(
      new Error(
        'conflicting key value violates exclusion constraint "stays_sans_chevauchement_exclusif"',
      ),
      { action: 'accepterDemande' },
    )
    restaurer()

    expect(resultat.code).toBe('EXCLUSIVE_CONFLICT')
    expect(resultat.message).toBe(CATALOGUE_MESSAGES.EXCLUSIVE_CONFLICT)
  })
})

describe('Fabriques de résultat', () => {
  it('n’ajoute la clé « champs » que lorsqu’il y en a', () => {
    expect(echec('FORBIDDEN')).not.toHaveProperty('champs')
    expect(echec('VALIDATION', { champs: { email: 'Requis' } })).toHaveProperty(
      'champs',
      { email: 'Requis' },
    )
  })
})
