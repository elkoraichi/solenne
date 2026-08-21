import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * PERM-012 — **aucune Server Action sans garde.**
 *
 * Ce test énumère mécaniquement toutes les actions exposées et vérifie que
 * chacune commence par `requireUser` ou `requireRole`. Les rares actions
 * publiques — connexion, activation d'invitation, réinitialisation — doivent
 * être marquées `@public` dans leur commentaire, avec la raison.
 *
 * C'est le seul test du projet qui protège d'un oubli : une action ajoutée
 * demain sans garde fera échouer l'intégration continue.
 */

const DOSSIER_ACTIONS = join(process.cwd(), 'src/server/actions')

interface ActionExposee {
  readonly fichier: string
  readonly nom: string
  readonly corps: string
  readonly commentaire: string
}

/**
 * Trouve l'accolade qui ouvre le corps.
 *
 * Ni la liste de paramètres (`entree: unknown = {}`) ni le type de retour
 * (`Promise<Resultat<{ avatarUrl: string }>>`) ne doivent être pris pour le
 * corps : on saute les parenthèses, puis on ignore tout ce qui vit entre
 * chevrons.
 */
function debutDuCorps(source: string, indexParenthese: number): number {
  let profondeur = 0
  let i = indexParenthese
  for (; i < source.length; i += 1) {
    if (source[i] === '(') profondeur += 1
    else if (source[i] === ')') {
      profondeur -= 1
      if (profondeur === 0) {
        i += 1
        break
      }
    }
  }

  let chevrons = 0
  for (; i < source.length; i += 1) {
    const caractere = source[i]
    if (caractere === '<') chevrons += 1
    else if (caractere === '>') chevrons -= 1
    else if (caractere === '{' && chevrons <= 0) return i
  }
  return -1
}

/** Extrait le corps d'une fonction en comptant les accolades. */
function corpsDepuis(source: string, indexOuverture: number): string {
  let profondeur = 0
  for (let i = indexOuverture; i < source.length; i += 1) {
    const caractere = source[i]
    if (caractere === '{') profondeur += 1
    else if (caractere === '}') {
      profondeur -= 1
      if (profondeur === 0) return source.slice(indexOuverture, i + 1)
    }
  }
  return source.slice(indexOuverture)
}

/** Le bloc de commentaire qui précède immédiatement la déclaration. */
function commentaireAvant(source: string, indexDeclaration: number): string {
  const avant = source.slice(0, indexDeclaration)
  const finBloc = avant.lastIndexOf('*/')
  if (finBloc === -1) return ''
  // Rien d'autre qu'espaces entre le commentaire et la déclaration.
  if (avant.slice(finBloc + 2).trim().length > 0) return ''
  const debutBloc = avant.lastIndexOf('/**', finBloc)
  return debutBloc === -1 ? '' : avant.slice(debutBloc, finBloc + 2)
}

function fichiersDActions(): string[] {
  return readdirSync(DOSSIER_ACTIONS)
    .filter((nom) => nom.endsWith('.ts'))
    .map((nom) => join(DOSSIER_ACTIONS, nom))
    .filter((chemin) => {
      const source = readFileSync(chemin, 'utf8')
      return /^\s*['"]use server['"]/.test(source)
    })
}

function actionsExposees(): ActionExposee[] {
  const actions: ActionExposee[] = []

  for (const chemin of fichiersDActions()) {
    const source = readFileSync(chemin, 'utf8')
    const motif = /export\s+async\s+function\s+(\w+)\s*\(/g

    let correspondance: RegExpExecArray | null
    while ((correspondance = motif.exec(source)) !== null) {
      const nom = correspondance[1] as string
      const indexAccolade = debutDuCorps(source, motif.lastIndex - 1)
      actions.push({
        fichier: chemin.replace(`${process.cwd()}/`, ''),
        nom,
        corps: corpsDepuis(source, indexAccolade),
        commentaire: commentaireAvant(source, correspondance.index),
      })
    }
  }

  return actions
}

const GARDES = ['requireUser(', 'requireRole(']

describe('PERM-012 — aucune Server Action sans garde', () => {
  const actions = actionsExposees()

  it('trouve bien les fichiers d’actions à contrôler', () => {
    expect(fichiersDActions().length).toBeGreaterThanOrEqual(4)
    expect(actions.length).toBeGreaterThanOrEqual(15)
  })

  it('chaque action est soit gardée, soit explicitement publique', () => {
    const sansGarde = actions
      .filter((action) => !GARDES.some((garde) => action.corps.includes(garde)))
      .filter((action) => !action.commentaire.includes('@public'))
      .map((action) => `${action.fichier} → ${action.nom}`)

    expect(sansGarde).toEqual([])
  })

  it('chaque action publique justifie de l’être', () => {
    const publiques = actions.filter((action) =>
      action.commentaire.includes('@public'),
    )

    // La liste est courte et connue : toute nouvelle entrée doit être décidée,
    // pas subie.
    expect(publiques.map((action) => action.nom).sort()).toEqual([
      'activerInvitation',
      'confirmerChangementEmail',
      'consulterInvitation',
      'demanderReinitialisation',
      'identiteCourante',
      'reinitialiserMotDePasse',
      'seConnecter',
    ])

    for (const action of publiques) {
      // Une phrase après `@public` : pourquoi cette action n'a pas de garde.
      const apres = action.commentaire.split('@public')[1] ?? ''
      expect(apres.replace(/[\s*]/g, '').length, action.nom).toBeGreaterThan(20)
    }
  })

  it('la garde est posée avant toute lecture de données', () => {
    const gardees = actions.filter((action) =>
      GARDES.some((garde) => action.corps.includes(garde)),
    )

    for (const action of gardees) {
      const indexGarde = Math.min(
        ...GARDES.map((garde) => action.corps.indexOf(garde)).filter(
          (index) => index >= 0,
        ),
      )
      const indexBase = action.corps.indexOf('db.')
      if (indexBase === -1) continue
      expect(
        indexGarde,
        `${action.fichier} → ${action.nom} interroge la base avant sa garde`,
      ).toBeLessThan(indexBase)
    }
  })

  it('chaque action passe par l’enveloppe qui empêche les exceptions de fuir', () => {
    const sansEnveloppe = actions
      .filter((action) => !action.corps.includes('executerAction'))
      .map((action) => `${action.fichier} → ${action.nom}`)

    expect(sansEnveloppe).toEqual([])
  })
})

describe('AUTH-011 — aucune route d’inscription publique', () => {
  it('aucune action ne crée un compte hors invitation', () => {
    const creations = actionsExposees().filter(
      (action) =>
        action.corps.includes('user.create(') ||
        action.corps.includes('user.upsert('),
    )

    expect(creations.map((action) => action.nom)).toEqual(['activerInvitation'])
  })

  it('aucune route d’inscription n’existe dans l’application', () => {
    const routes = readdirSync(join(process.cwd(), 'src/app'), {
      recursive: true,
    }) as string[]

    const suspectes = routes.filter((chemin) =>
      /(inscription|signup|sign-up|register|creer-un-compte)/i.test(chemin),
    )
    expect(suspectes).toEqual([])
  })
})
