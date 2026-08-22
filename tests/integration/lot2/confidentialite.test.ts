import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import { ajouterJours, versTexteJour } from '@/domain/core/dates'
import { CATALOGUE_MESSAGES } from '@/domain/core/messages'
import { tientDansLaCapacite } from '@/domain/occupancy/occupation'
import type { Resultat } from '@/domain/core/result'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  definirVisibiliteParDefaut,
  definirVisibiliteSejour,
  occupationDuCercle,
  reglagesConfidentialite,
  sejour,
  sejoursDetailles,
} from '@/server/actions/confidentialite'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { visibiliteParDefaut } from '@/server/confidentialite'
import { toutesLesPresences } from '@/server/occupation'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerDemande,
  creerMaison,
  creerSejour,
  creerUtilisateur,
  leJour,
} from '../fabriques'

/**
 * `PRIV` — confidentialité des séjours (PRIV-001 → 016, S03, S08, S09, S12).
 *
 * La vérification qui compte ne porte pas sur le rendu mais sur la **charge
 * utile** : ce que la Server Action renvoie réellement. Un champ absent de la
 * réponse ne peut pas fuiter ; un champ masqué par l'interface, si.
 */

const client: PrismaClient = clientDeTest()

/** Une Server Action quelconque, pour éprouver une garde sur toute une série. */
type Appel = () => Promise<Resultat<unknown>>

function dans(n: number): string {
  return versTexteJour(ajouterJours(new Date(), n))
}

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

/**
 * Le décor de référence de la fiche : Marc séjourne du 10 au 12 septembre avec
 * quatre personnes, motif « week-end famille ». Julie et Solenne regardent.
 */
async function decor(capacite = 10) {
  const solenne = await creerAdministratrice(client)
  const maison = await creerMaison(client, capacite)
  const marc = await creerUtilisateur(client, { prenom: 'Marc', nom: 'Vidal' })
  const julie = await creerUtilisateur(client, {
    prenom: 'Julie',
    nom: 'Perrin',
  })

  return {
    solenne,
    maison,
    marc,
    julie,
    jetonSolenne: await sessionPour(solenne.id),
    jetonMarc: await sessionPour(marc.id),
    jetonJulie: await sessionPour(julie.id),
  }
}

async function sejourDeMarc(
  maisonId: string,
  marcId: string,
  options: {
    readonly niveau?: 'HIDDEN' | 'BUSY_ONLY' | 'FULL'
    readonly du?: string
    readonly au?: string
  } = {},
) {
  const demande = await creerDemande(client, marcId, {
    du: options.du ?? dans(10),
    au: options.au ?? dans(12),
    adultes: 3,
    enfants: 1,
    statut: 'ACCEPTED',
    motif: 'Week-end famille',
    commentaire: 'On arrivera tard le vendredi',
    besoins: 'Un lit parapluie',
  })

  return creerSejour(client, maisonId, marcId, {
    du: options.du ?? dans(10),
    au: options.au ?? dans(12),
    adultes: 3,
    enfants: 1,
    niveau: options.niveau,
    demandeId: demande.id,
  })
}

// ---------------------------------------------------------------------------
// Ce qu'un ami reçoit
// ---------------------------------------------------------------------------

describe('PRIV-001 — par défaut, un ami voit « Maison occupée »', () => {
  it('des dates, et rien de plus', async () => {
    const { maison, marc, jetonJulie } = await decor()
    await sejourDeMarc(maison.id, marc.id)

    const vue = await en(jetonJulie, () => occupationDuCercle())

    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data.sejours).toEqual([])
    expect(vue.data.occupations).toEqual([
      { du: leJour(dans(10)), au: leJour(dans(12)) },
    ])
  })

  it('PRIV-S09 — la charge utile ne contient aucun champ privé', async () => {
    const { maison, marc, julie, jetonJulie } = await decor()
    await sejourDeMarc(maison.id, marc.id)
    await creerSejour(client, maison.id, marc.id, {
      du: dans(20),
      au: dans(23),
      adultes: 2,
    })
    await creerSejour(client, maison.id, julie.id, {
      du: dans(40),
      au: dans(42),
      adultes: 5,
      niveau: 'BUSY_ONLY',
    })

    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const jetonLea = await sessionPour(lea.id)
    const vue = await en(jetonLea, () => occupationDuCercle())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return

    const charge = JSON.stringify(vue.data)
    for (const interdit of [
      'Marc',
      'Julie',
      marc.id,
      julie.id,
      'Week-end famille',
      'lit parapluie',
      'arrivera tard',
    ]) {
      expect(charge, `« ${interdit} » ne doit pas sortir`).not.toContain(
        interdit,
      )
    }
    expect(charge).not.toMatch(/"(personnes|adultes|enfants|qui|id)"/)
    expect(jetonJulie).toBeTruthy()
  })
})

describe('PRIV-002 — Solenne voit tout', () => {
  it('nom, effectif, motif, commentaire et besoins', async () => {
    const { maison, marc, jetonSolenne } = await decor()
    await sejourDeMarc(maison.id, marc.id)

    const vue = await en(jetonSolenne, () => sejoursDetailles())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return

    expect(vue.data).toHaveLength(1)
    expect(vue.data[0]).toMatchObject({
      nature: 'COMPLET',
      qui: 'Marc',
      personnes: 4,
      motif: 'Week-end famille',
      commentaire: 'On arrivera tard le vendredi',
      besoins: 'Un lit parapluie',
      niveau: 'BUSY_ONLY',
    })
  })

  it('même quand elle passe par la lecture du cercle, elle reçoit la vue du cercle', async () => {
    const { maison, marc, jetonSolenne } = await decor()
    await sejourDeMarc(maison.id, marc.id)

    const vue = await en(jetonSolenne, () => occupationDuCercle())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data.sejours).toEqual([])
    expect(JSON.stringify(vue.data)).not.toContain('Marc')
  })
})

describe('PRIV-003 — chacun voit son propre séjour', () => {
  it('Marc lit le sien en entier', async () => {
    const { maison, marc, jetonMarc } = await decor()
    await sejourDeMarc(maison.id, marc.id)

    const vue = await en(jetonMarc, () => occupationDuCercle())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return

    expect(vue.data.occupations).toEqual([])
    expect(vue.data.sejours[0]).toMatchObject({
      nature: 'COMPLET',
      qui: 'Marc',
      motif: 'Week-end famille',
      estLeMien: true,
    })
    // La demande acceptée est devenue ce séjour : elle ne se raconte pas deux fois.
    expect(vue.data.mesDemandes).toEqual([])
  })
})

describe('PRIV-004 / PRIV-005 — le niveau « invisible »', () => {
  it('un séjour caché n’apparaît nulle part pour un ami', async () => {
    const { maison, solenne, jetonMarc } = await decor()
    await creerSejour(client, maison.id, solenne.id, {
      du: dans(10),
      au: dans(12),
      adultes: 2,
      niveau: 'HIDDEN',
      sejourDeSolenne: true,
    })

    const vue = await en(jetonMarc, () => occupationDuCercle())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data.occupations).toEqual([])
    expect(vue.data.sejours).toEqual([])
  })

  it('mais il compte dans la capacité — sans dire pourquoi', async () => {
    const { maison, solenne } = await decor(10)
    await creerSejour(client, maison.id, solenne.id, {
      du: dans(10),
      au: dans(12),
      adultes: 8,
      niveau: 'HIDDEN',
      sejourDeSolenne: true,
    })

    const presences = await toutesLesPresences(client)
    expect(presences).toHaveLength(1)
    expect(
      tientDansLaCapacite(presences, 10, {
        arrivee: leJour(dans(10)),
        depart: leJour(dans(12)),
        personnes: 4,
      }),
    ).toBe(false)

    // PRIV-S12 : le refus dit l'indisponibilité, jamais l'occupation.
    const message = CATALOGUE_MESSAGES.CAPACITY_EXCEEDED
    expect(message).not.toMatch(/\d/)
    expect(message).not.toContain('{n}')
    expect(message).not.toContain('{max}')
  })
})

describe('PRIV-006 — le niveau « prénom et nombre »', () => {
  it('donne le prénom et l’effectif, jamais le commentaire', async () => {
    const { maison, marc, jetonJulie } = await decor()
    await sejourDeMarc(maison.id, marc.id, { niveau: 'FULL' })

    const vue = await en(jetonJulie, () => occupationDuCercle())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return

    expect(vue.data.occupations).toEqual([])
    expect(vue.data.sejours).toEqual([
      {
        nature: 'NOMME',
        du: leJour(dans(10)),
        au: leJour(dans(12)),
        qui: 'Marc',
        personnes: 4,
      },
    ])
    expect(JSON.stringify(vue.data)).not.toContain('arrivera tard')
    expect(JSON.stringify(vue.data)).not.toContain(marc.id)
  })
})

describe('PRIV-007 / PRIV-012 — deux séjours simultanés', () => {
  it('ne font qu’une seule mention, sans aucun décompte', async () => {
    const { maison, marc, julie } = await decor(12)
    await creerSejour(client, maison.id, marc.id, {
      du: dans(10),
      au: dans(14),
      adultes: 4,
    })
    await creerSejour(client, maison.id, julie.id, {
      du: dans(12),
      au: dans(16),
      adultes: 3,
    })

    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    const vue = await en(await sessionPour(lea.id), () => occupationDuCercle())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return

    expect(vue.data.occupations).toEqual([
      { du: leJour(dans(10)), au: leJour(dans(16)) },
    ])
    // Aucun « 4 places restantes » : la capacité n'est même pas dans la réponse.
    expect(JSON.stringify(vue.data)).not.toMatch(/\d+\s*place/)
    expect(JSON.stringify(vue.data)).not.toMatch(/"(capacite|restantes)"/)
  })
})

describe('PRIV-009 — une demande en attente n’existe que pour son auteur', () => {
  it('Julie ne voit pas la demande de Marc, Marc voit la sienne', async () => {
    const { marc, jetonMarc, jetonJulie } = await decor()
    await creerDemande(client, marc.id, {
      du: dans(30),
      au: dans(33),
      adultes: 2,
      motif: 'Semaine au calme',
    })

    const cotéJulie = await en(jetonJulie, () => occupationDuCercle())
    expect(cotéJulie.ok).toBe(true)
    if (!cotéJulie.ok) return
    expect(cotéJulie.data.mesDemandes).toEqual([])
    expect(cotéJulie.data.occupations).toEqual([])
    expect(JSON.stringify(cotéJulie.data)).not.toContain('Semaine au calme')

    const cotéMarc = await en(jetonMarc, () => occupationDuCercle())
    expect(cotéMarc.ok).toBe(true)
    if (!cotéMarc.ok) return
    expect(cotéMarc.data.mesDemandes).toHaveLength(1)
    expect(cotéMarc.data.mesDemandes[0]).toMatchObject({ personnes: 2 })
  })
})

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

describe('PRIV-010 — le réglage global', () => {
  it('sans réglage enregistré, le défaut est « Maison occupée » (D4)', async () => {
    const { jetonSolenne } = await decor()

    const lu = await en(jetonSolenne, () => reglagesConfidentialite())
    expect(lu.ok).toBe(true)
    if (!lu.ok) return
    expect(lu.data.defaut).toBe('BUSY_ONLY')
    expect(lu.data.defautSolenne).toBe('FULL')
  })

  it('ne s’applique pas aux séjours de Solenne, plus visibles par défaut', async () => {
    const { jetonSolenne } = await decor()

    expect(await visibiliteParDefaut(client)).toBe('BUSY_ONLY')
    expect(
      await visibiliteParDefaut(client, { sejourDeSolenne: true }),
    ).toBe('FULL')

    // Même réglé au plus discret, le global ne vaut que pour le cercle.
    await en(jetonSolenne, () => definirVisibiliteParDefaut({ niveau: 'HIDDEN' }))

    expect(await visibiliteParDefaut(client)).toBe('HIDDEN')
    expect(
      await visibiliteParDefaut(client, { sejourDeSolenne: true }),
    ).toBe('FULL')

    const relu = await en(jetonSolenne, () => reglagesConfidentialite())
    expect(relu.ok).toBe(true)
    if (!relu.ok) return
    expect(relu.data).toEqual({ defaut: 'HIDDEN', defautSolenne: 'FULL' })
  })

  it('vaut pour les nouveaux séjours, jamais pour les anciens', async () => {
    const { maison, marc, jetonSolenne } = await decor()
    const ancien = await sejourDeMarc(maison.id, marc.id)

    const change = await en(jetonSolenne, () =>
      definirVisibiliteParDefaut({ niveau: 'FULL' }),
    )
    expect(change.ok).toBe(true)

    expect(await visibiliteParDefaut(client)).toBe('FULL')
    const inchange = await client.stay.findUniqueOrThrow({
      where: { id: ancien.id },
      select: { privacyLevel: true },
    })
    expect(inchange.privacyLevel).toBe('BUSY_ONLY')
  })

  it('refuse un niveau inventé et journalise le changement', async () => {
    const { solenne, jetonSolenne } = await decor()

    const refus = await en(jetonSolenne, () =>
      definirVisibiliteParDefaut({ niveau: 'PUBLIC' }),
    )
    expect(refus.ok).toBe(false)
    if (refus.ok) return
    expect(refus.code).toBe('VALIDATION')

    await en(jetonSolenne, () => definirVisibiliteParDefaut({ niveau: 'HIDDEN' }))
    const trace = await client.auditLog.findFirst({
      where: { action: 'confidentialite.defaut', actorId: solenne.id },
    })
    expect(trace).not.toBeNull()
  })
})

describe('PRIV-011 — le réglage d’un séjour', () => {
  it('ne touche que celui-là', async () => {
    const { maison, marc, julie, jetonSolenne, jetonJulie } = await decor()
    const celuiDeMarc = await sejourDeMarc(maison.id, marc.id)
    const celuiDeJulie = await creerSejour(client, maison.id, julie.id, {
      du: dans(30),
      au: dans(32),
      adultes: 2,
    })

    const change = await en(jetonSolenne, () =>
      definirVisibiliteSejour({ id: celuiDeMarc.id, niveau: 'FULL' }),
    )
    expect(change.ok).toBe(true)

    const vue = await en(jetonJulie, () => occupationDuCercle())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    // Julie voit celui de Marc, désormais nommé, et le sien, qui n'a pas bougé.
    expect(vue.data.sejours).toHaveLength(2)
    expect(vue.data.sejours).toContainEqual(
      expect.objectContaining({ nature: 'NOMME', qui: 'Marc' }),
    )
    expect(vue.data.sejours).toContainEqual(
      expect.objectContaining({ nature: 'COMPLET', estLeMien: true }),
    )

    const autre = await client.stay.findUniqueOrThrow({
      where: { id: celuiDeJulie.id },
      select: { privacyLevel: true },
    })
    expect(autre.privacyLevel).toBe('BUSY_ONLY')
  })

  it('un séjour inconnu se refuse sans rien confirmer', async () => {
    const { jetonSolenne } = await decor()
    const refus = await en(jetonSolenne, () =>
      definirVisibiliteSejour({ id: 'sejour-qui-n-existe-pas', niveau: 'FULL' }),
    )
    expect(refus.ok).toBe(false)
    if (refus.ok) return
    expect(refus.code).toBe('NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// Grille de sécurité
// ---------------------------------------------------------------------------

describe('PRIV-S03 / PRIV-S08 — accès direct à un séjour', () => {
  it('Marc lit le sien, Julie reçoit le même refus qu’un séjour inexistant', async () => {
    const { maison, marc, jetonMarc, jetonJulie } = await decor()
    const leSien = await sejourDeMarc(maison.id, marc.id)

    const parMarc = await en(jetonMarc, () => sejour({ id: leSien.id }))
    expect(parMarc.ok).toBe(true)

    const parJulie = await en(jetonJulie, () => sejour({ id: leSien.id }))
    const inexistant = await en(jetonJulie, () => sejour({ id: 'cmzzz0000' }))

    expect(parJulie.ok).toBe(false)
    expect(inexistant.ok).toBe(false)
    if (parJulie.ok || inexistant.ok) return
    expect(parJulie.code).toBe('NOT_FOUND')
    expect(parJulie.message).toBe(inexistant.message)
  })

  it('Solenne y accède, et les identifiants ne se devinent pas', async () => {
    const { maison, marc, julie, jetonSolenne } = await decor()
    const premier = await sejourDeMarc(maison.id, marc.id)
    const second = await creerSejour(client, maison.id, julie.id, {
      du: dans(30),
      au: dans(32),
    })

    const parSolenne = await en(jetonSolenne, () => sejour({ id: premier.id }))
    expect(parSolenne.ok).toBe(true)

    // PRIV-S08 : des `cuid`, pas des entiers. Il n'y a pas de « voisin ».
    expect(premier.id).not.toMatch(/^\d+$/)
    expect(second.id).not.toMatch(/^\d+$/)
    expect(Math.abs(premier.id.length - second.id.length)).toBe(0)
    expect(premier.id).not.toBe(second.id)
  })
})

describe('PRIV-S01 / PRIV-S02 — gardes', () => {
  it('sans session, aucune lecture ne passe', async () => {
    const { maison, marc } = await decor()
    const leSien = await sejourDeMarc(maison.id, marc.id)

    const appels: Appel[] = [
      () => occupationDuCercle(),
      () => sejoursDetailles(),
      () => sejour({ id: leSien.id }),
      () => reglagesConfidentialite(),
      () => definirVisibiliteParDefaut({ niveau: 'FULL' }),
      () => definirVisibiliteSejour({ id: leSien.id, niveau: 'FULL' }),
    ]

    for (const appel of appels) {
      const resultat = await dansUneRequete(appel)
      expect(resultat.ok).toBe(false)
      if (resultat.ok) continue
      expect(resultat.code).toBe('UNAUTHENTICATED')
    }
  })

  it('un ami ne lit ni le détail ni les réglages, et n’écrit rien', async () => {
    const { maison, marc, jetonMarc } = await decor()
    const leSien = await sejourDeMarc(maison.id, marc.id)

    const appels: Appel[] = [
      () => sejoursDetailles(),
      () => reglagesConfidentialite(),
      () => definirVisibiliteParDefaut({ niveau: 'FULL' }),
      () => definirVisibiliteSejour({ id: leSien.id, niveau: 'FULL' }),
    ]

    for (const appel of appels) {
      const resultat = await en(jetonMarc, appel)
      expect(resultat.ok).toBe(false)
      if (resultat.ok) continue
      expect(resultat.code).toBe('FORBIDDEN')
    }

    // Rien n'a bougé, et le refus est au journal.
    const apres = await client.stay.findUniqueOrThrow({
      where: { id: leSien.id },
      select: { privacyLevel: true },
    })
    expect(apres.privacyLevel).toBe('BUSY_ONLY')

    const refus = await client.auditLog.findMany({
      where: { actorId: marc.id, action: { startsWith: 'refus.' } },
    })
    expect(refus.length).toBeGreaterThan(0)
  })

  it('PRIV-S07 — un niveau glissé dans la lecture du cercle ne change rien', async () => {
    const { maison, marc, jetonJulie } = await decor()
    await sejourDeMarc(maison.id, marc.id)

    const vue = await en(jetonJulie, () =>
      occupationDuCercle({
        du: dans(0),
        niveau: 'FULL',
        estAdministratrice: true,
      }),
    )
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data.sejours).toEqual([])
  })
})

describe('un séjour annulé n’occupe rien', () => {
  it('il disparaît de la vue du cercle comme de celle de Solenne', async () => {
    const { maison, marc, jetonSolenne, jetonJulie } = await decor()
    await creerSejour(client, maison.id, marc.id, {
      du: dans(10),
      au: dans(12),
      statut: 'CANCELLED',
    })

    const cercle = await en(jetonJulie, () => occupationDuCercle())
    const solenne = await en(jetonSolenne, () => sejoursDetailles())
    expect(cercle.ok && cercle.data.occupations).toEqual([])
    expect(solenne.ok && solenne.data).toEqual([])
  })
})
