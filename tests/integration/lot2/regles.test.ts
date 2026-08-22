import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import type { Resultat } from '@/domain/core/result'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  activerRegle,
  creerRegle,
  modifierRegle,
  reglesDeLaMaison,
  reordonnerRegles,
  versionsDeLaRegle,
} from '@/server/actions/regles'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import { creerAdministratrice, creerMaison, creerUtilisateur } from '../fabriques'

/** `HOUSE` — les règles de la maison (HOUSE-013 → 018, R4 → R6). */

const client: PrismaClient = clientDeTest()

beforeEach(async () => {
  await viderDonnees(client)
  reinitialiserRequete()
  reinitialiserAntiSaturation()
})

afterAll(async () => {
  await viderDonnees(client)
  await client.$disconnect()
})

async function sessionPour(utilisateurId: string) {
  return dansUneRequete(() => ouvrirSession(utilisateurId))
}

function en<T>(jeton: string, traitement: () => Promise<T>) {
  return dansUneRequete(traitement, {
    cookies: { [NOM_COOKIE_SESSION]: jeton },
  })
}

async function decorSolenne() {
  const solenne = await creerAdministratrice(client)
  await creerMaison(client)
  return { solenne, jeton: await sessionPour(solenne.id) }
}

async function ajouter(
  jeton: string,
  titre: string,
  obligatoire = false,
): Promise<string> {
  const resultat = await en(jeton, () =>
    creerRegle({
      titre,
      texte: `Le texte de « ${titre} ».`,
      acceptationObligatoire: obligatoire,
    }),
  )
  expect(resultat.ok).toBe(true)
  if (!resultat.ok) throw new Error('règle non créée')
  return resultat.data.id
}

describe('HOUSE-013 — création', () => {
  it('crée une règle, la rend visible des amis et la journalise', async () => {
    const { solenne, jeton } = await decorSolenne()

    const id = await ajouter(jeton, 'Le calme après 22 h', true)

    const ami = await creerUtilisateur(client)
    const vueAmi = await en(await sessionPour(ami.id), () => reglesDeLaMaison())

    expect(vueAmi.ok).toBe(true)
    if (!vueAmi.ok) return
    expect(vueAmi.data).toHaveLength(1)
    expect(vueAmi.data[0]?.id).toBe(id)
    expect(vueAmi.data[0]?.acceptationObligatoire).toBe(true)

    const trace = await client.auditLog.findFirst({
      where: { action: 'regle.creation' },
    })
    expect(trace?.actorId).toBe(solenne.id)
  })

  it('refuse une règle sans titre ou sans texte', async () => {
    const { jeton } = await decorSolenne()

    for (const entree of [
      { titre: '  ', texte: 'Un texte.' },
      { titre: 'Un titre', texte: '   ' },
    ]) {
      const resultat = await en(jeton, () => creerRegle(entree))
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe('VALIDATION')
    }

    expect(await client.houseRule.count()).toBe(0)
  })

  it('dépose une version 1 dès la création (HOUSE-R6)', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouter(jeton, 'On ne fume pas à l’intérieur')

    const versions = await client.houseRuleVersion.findMany({
      where: { ruleId: id },
    })
    expect(versions).toHaveLength(1)
    expect(versions[0]?.version).toBe(1)
  })
})

describe('HOUSE-014 — ordre des règles', () => {
  it('conserve et restitue l’ordre choisi sur huit règles', async () => {
    const { jeton } = await decorSolenne()

    const ids: string[] = []
    for (let i = 1; i <= 8; i += 1) ids.push(await ajouter(jeton, `Règle ${i}`))

    // L'ordre de création est l'ordre initial.
    const avant = await en(jeton, () => reglesDeLaMaison())
    expect(avant.ok && avant.data.map((r) => r.id)).toEqual(ids)

    const nouvelOrdre = [...ids].reverse()
    expect((await en(jeton, () => reordonnerRegles({ ids: nouvelOrdre }))).ok).toBe(
      true,
    )

    const apres = await en(jeton, () => reglesDeLaMaison())
    expect(apres.ok && apres.data.map((r) => r.id)).toEqual(nouvelOrdre)
  })

  it('refuse un ordre qui ne correspond plus aux règles connues', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouter(jeton, 'Une règle')

    const resultat = await en(jeton, () =>
      reordonnerRegles({ ids: [id, 'regle-fantome'] }),
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('CONFLICT')
  })
})

describe('HOUSE-015 — désactivation', () => {
  it('masque la règle aux amis mais la conserve en base', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouter(jeton, 'Règle saisonnière')

    expect((await en(jeton, () => activerRegle({ id, active: false }))).ok).toBe(
      true,
    )

    const ami = await creerUtilisateur(client)
    const vueAmi = await en(await sessionPour(ami.id), () => reglesDeLaMaison())
    expect(vueAmi.ok && vueAmi.data).toEqual([])

    // Solenne la voit encore, pour pouvoir la remettre.
    const vueSolenne = await en(jeton, () => reglesDeLaMaison())
    expect(vueSolenne.ok && vueSolenne.data).toHaveLength(1)
    expect(vueSolenne.ok && vueSolenne.data[0]?.active).toBe(false)

    expect(await client.houseRule.count()).toBe(1)
  })
})

describe('HOUSE-016 — règles obligatoires', () => {
  it('distingue les règles à accepter des autres', async () => {
    const { jeton } = await decorSolenne()
    await ajouter(jeton, 'À accepter 1', true)
    await ajouter(jeton, 'Simple information', false)
    await ajouter(jeton, 'À accepter 2', true)
    await ajouter(jeton, 'À accepter 3', true)

    const ami = await creerUtilisateur(client)
    const vue = await en(await sessionPour(ami.id), () => reglesDeLaMaison())

    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data.filter((r) => r.acceptationObligatoire)).toHaveLength(3)
    expect(vue.data.filter((r) => !r.acceptationObligatoire)).toHaveLength(1)
  })
})

describe('HOUSE-017 — texte très long', () => {
  it('accepte 5 000 caractères et les restitue intacts', async () => {
    const { jeton } = await decorSolenne()
    const texte = 'a'.repeat(5_000)

    const resultat = await en(jeton, () =>
      creerRegle({ titre: 'Règle bavarde', texte }),
    )
    expect(resultat.ok).toBe(true)

    const vue = await en(jeton, () => reglesDeLaMaison())
    expect(vue.ok && vue.data[0]?.texte).toHaveLength(5_000)
  })

  it('refuse au-delà de la limite plutôt que de tronquer en silence', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      creerRegle({ titre: 'Trop bavarde', texte: 'a'.repeat(5_001) }),
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('VALIDATION')
  })
})

describe('HOUSE-018 / HOUSE-R6 — modification après acceptation', () => {
  it('garde consultable le texte exact de chaque version', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouter(jeton, 'Le calme après 22 h', true)

    expect(
      (
        await en(jeton, () =>
          modifierRegle({
            id,
            titre: 'Le calme après 23 h',
            texte: 'On baisse le ton après 23 h.',
            acceptationObligatoire: true,
          }),
        )
      ).ok,
    ).toBe(true)

    const historique = await en(jeton, () => versionsDeLaRegle({ id }))

    expect(historique.ok).toBe(true)
    if (!historique.ok) return
    expect(historique.data).toHaveLength(2)
    // La plus récente d'abord.
    expect(historique.data[0]?.version).toBe(2)
    expect(historique.data[0]?.titre).toBe('Le calme après 23 h')
    // La version acceptée hier n'a pas bougé d'une virgule.
    expect(historique.data[1]?.version).toBe(1)
    expect(historique.data[1]?.titre).toBe('Le calme après 22 h')
  })

  it('n’ajoute pas de version quand rien n’a changé', async () => {
    const { jeton } = await decorSolenne()
    const id = await ajouter(jeton, 'Une règle stable')

    await en(jeton, () =>
      modifierRegle({
        id,
        titre: 'Une règle stable',
        texte: 'Le texte de « Une règle stable ».',
        acceptationObligatoire: false,
      }),
    )

    const historique = await en(jeton, () => versionsDeLaRegle({ id }))
    expect(historique.ok && historique.data).toHaveLength(1)
  })

  it('refuse de modifier une règle qui n’existe pas, sans le confirmer', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      modifierRegle({ id: 'regle-fantome', titre: 'X', texte: 'Y' }),
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('NOT_FOUND')
  })
})

describe('HOUSE-S02 — un ami ne touche pas aux règles', () => {
  it('refuse les quatre écritures et n’écrit rien', async () => {
    const solenne = await creerAdministratrice(client)
    await creerMaison(client)
    const id = await ajouter(await sessionPour(solenne.id), 'Le calme après 22 h')

    const ami = await creerUtilisateur(client)
    const jetonAmi = await sessionPour(ami.id)

    const appels: Array<() => Promise<Resultat<unknown>>> = [
      () => creerRegle({ titre: 'Ma règle', texte: 'À moi.' }),
      () => modifierRegle({ id, titre: 'Détourné', texte: 'Détourné.' }),
      () => activerRegle({ id, active: false }),
      () => reordonnerRegles({ ids: [id] }),
      () => versionsDeLaRegle({ id }),
    ]

    for (const appel of appels) {
      const resultat = await en(jetonAmi, appel)
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe('FORBIDDEN')
    }

    const regle = await client.houseRule.findUniqueOrThrow({ where: { id } })
    expect(regle.title).toBe('Le calme après 22 h')
    expect(regle.active).toBe(true)
    expect(await client.houseRule.count()).toBe(1)
  })

  it('refuse la lecture des règles sans session', async () => {
    await creerMaison(client)

    const resultat = await dansUneRequete(() => reglesDeLaMaison())

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe('UNAUTHENTICATED')
  })
})
