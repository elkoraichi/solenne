import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import type { PrismaClient } from '@/generated/prisma/client'
import { impactCapacite, maison, mettreAJourCapacite } from '@/server/actions/maison'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { dansUneRequete, reinitialiserRequete } from '../../faux-next-headers'
import { clientDeTest, viderDonnees } from '../aide-base'
import {
  creerAdministratrice,
  creerDemande,
  creerMaison,
  creerSejour,
  creerUtilisateur,
} from '../fabriques'

/**
 * HOUSE-R1 → R3 — la capacité.
 *
 * Le décompte des personnes n'est pas fait ici : il vient de `OCCUP`
 * (`src/domain/occupancy`), seul endroit du projet qui additionne des
 * personnes. Ces tests vérifient que `HOUSE` en tire les bonnes conséquences.
 */

const client: PrismaClient = clientDeTest()

/** Loin devant, pour que rien ne dépende de la date du jour. */
const DU = '2027-09-10'
const AU = '2027-09-13'

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

async function decorSolenne(capacite = 12) {
  const solenne = await creerAdministratrice(client)
  const laMaison = await creerMaison(client, capacite)
  const jeton = await sessionPour(solenne.id)
  return { solenne, laMaison, jeton }
}

describe('HOUSE-002 — capacité valide', () => {
  it('enregistre la nouvelle capacité et la journalise', async () => {
    const { solenne, jeton } = await decorSolenne(10)

    const resultat = await en(jeton, () => mettreAJourCapacite({ capacite: 12 }))
    expect(resultat.ok).toBe(true)

    expect((await client.house.findFirstOrThrow()).capacityMax).toBe(12)

    const trace = await client.auditLog.findFirst({
      where: { action: 'maison.capacite' },
    })
    expect(trace?.actorId).toBe(solenne.id)
  })

  it('accepte les deux bornes, refuse ce qui les dépasse', async () => {
    const { jeton } = await decorSolenne(10)

    expect((await en(jeton, () => mettreAJourCapacite({ capacite: 1 }))).ok).toBe(true)
    expect((await en(jeton, () => mettreAJourCapacite({ capacite: 25 }))).ok).toBe(true)

    for (const valeur of [0, 26, -3, 12.5, 'douze', '', null]) {
      const refus = await en(jeton, () => mettreAJourCapacite({ capacite: valeur }))
      expect(refus.ok, String(valeur)).toBe(false)
      if (!refus.ok) expect(refus.code, String(valeur)).toBe('VALIDATION')
    }

    // Aucune des tentatives refusées n'a écrit quoi que ce soit.
    expect((await client.house.findFirstOrThrow()).capacityMax).toBe(25)
  })
})

describe('HOUSE-007 — réduction sous l’occupation confirmée', () => {
  it('refuse et nomme la journée en cause', async () => {
    const { jeton, laMaison } = await decorSolenne(12)
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })

    await creerSejour(client, laMaison.id, marc.id, {
      du: DU,
      au: AU,
      adultes: 5,
      enfants: 0,
    })
    await creerSejour(client, laMaison.id, lea.id, {
      du: '2027-09-11',
      au: '2027-09-12',
      adultes: 2,
      enfants: 2,
    })

    const resultat = await en(jeton, () => mettreAJourCapacite({ capacite: 6 }))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('CAPACITY_BELOW_OCCUPANCY')
    // 5 + 4 = 9 personnes le 11 septembre.
    expect(resultat.message).toContain('9')

    // La capacité n'a pas bougé d'un pouce.
    expect((await client.house.findFirstOrThrow()).capacityMax).toBe(12)
  })

  it('donne à Solenne la liste des séjours en cause avant qu’elle décide', async () => {
    const { jeton, laMaison } = await decorSolenne(12)
    const marc = await creerUtilisateur(client, { prenom: 'Marc' })
    const camille = await creerUtilisateur(client, { prenom: 'Camille' })

    const sejourMarc = await creerSejour(client, laMaison.id, marc.id, {
      du: DU,
      au: AU,
      adultes: 5,
    })
    const sejourLointain = await creerSejour(client, laMaison.id, camille.id, {
      du: '2027-12-01',
      au: '2027-12-03',
      adultes: 2,
    })

    const resultat = await en(jeton, () => impactCapacite({ capacite: 4 }))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.compatible).toBe(false)
    expect(resultat.data.pic?.personnes).toBe(5)

    const enCause = resultat.data.sejoursEnCause.map((s) => s.id)
    expect(enCause).toContain(sejourMarc.id)
    // Un séjour de 2 personnes sous une capacité de 4 n'est pas en cause.
    expect(enCause).not.toContain(sejourLointain.id)
    expect(resultat.data.sejoursEnCause[0]?.qui).toBe('Marc')
  })

  it('ne tient pas compte d’un séjour annulé', async () => {
    const { jeton, laMaison } = await decorSolenne(12)
    const marc = await creerUtilisateur(client)
    await creerSejour(client, laMaison.id, marc.id, {
      du: DU,
      au: AU,
      adultes: 9,
      statut: 'CANCELLED',
    })

    expect((await en(jeton, () => mettreAJourCapacite({ capacite: 4 }))).ok).toBe(
      true,
    )
  })
})

describe('HOUSE-008 — réduction compatible', () => {
  it('accepte quand l’occupation confirmée tient dans la nouvelle capacité', async () => {
    const { jeton, laMaison } = await decorSolenne(12)
    const marc = await creerUtilisateur(client)
    await creerSejour(client, laMaison.id, marc.id, {
      du: DU,
      au: AU,
      adultes: 2,
      enfants: 2,
    })

    const resultat = await en(jeton, () => mettreAJourCapacite({ capacite: 6 }))

    expect(resultat.ok).toBe(true)
    expect((await client.house.findFirstOrThrow()).capacityMax).toBe(6)
  })
})

describe('HOUSE-R3 / HOUSE-009 — conséquences sur les demandes', () => {
  it('signale les demandes en attente devenues incompatibles', async () => {
    const { jeton, laMaison } = await decorSolenne(12)
    const marc = await creerUtilisateur(client)
    const jean = await creerUtilisateur(client, { prenom: 'Jean' })

    await creerSejour(client, laMaison.id, marc.id, {
      du: DU,
      au: AU,
      adultes: 3,
    })
    const demande = await creerDemande(client, jean.id, {
      du: '2027-09-11',
      au: '2027-09-12',
      adultes: 4,
    })

    const resultat = await en(jeton, () => mettreAJourCapacite({ capacite: 5 }))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    // 3 déjà confirmées + 4 demandées = 7 pour 5 places.
    expect(
      resultat.data.demandesDevenuesIncompatibles.map((d) => d.id),
    ).toEqual([demande.id])
  })

  it('signale une demande refusée redevenue possible après augmentation', async () => {
    const { jeton } = await decorSolenne(8)
    const jean = await creerUtilisateur(client, { prenom: 'Jean' })

    const refusee = await creerDemande(client, jean.id, {
      du: DU,
      au: AU,
      adultes: 10,
      statut: 'REJECTED',
    })

    const resultat = await en(jeton, () => mettreAJourCapacite({ capacite: 14 }))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.demandesRedevenuesPossibles.map((d) => d.id)).toEqual([
      refusee.id,
    ])
  })

  it('ne ressort pas une demande refusée qui ne passe toujours pas', async () => {
    const { jeton } = await decorSolenne(8)
    const jean = await creerUtilisateur(client)
    await creerDemande(client, jean.id, {
      du: DU,
      au: AU,
      adultes: 20,
      statut: 'REJECTED',
    })

    const resultat = await en(jeton, () => mettreAJourCapacite({ capacite: 14 }))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.demandesRedevenuesPossibles).toEqual([])
  })
})

describe('HOUSE-S07 — capacité injectée par un ami', () => {
  it('refuse l’appel et laisse la valeur intacte', async () => {
    const laMaison = await creerMaison(client, 10)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const resultat = await en(jeton, () => mettreAJourCapacite({ capacite: 99 }))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('FORBIDDEN')

    expect(
      (await client.house.findUniqueOrThrow({ where: { id: laMaison.id } }))
        .capacityMax,
    ).toBe(10)

    const refus = await client.auditLog.findFirst({
      where: { action: 'refus.maison.capacite' },
    })
    expect(refus?.actorId).toBe(ami.id)
  })

  it('refuse aussi la lecture d’impact — elle nomme les autres amis', async () => {
    await creerMaison(client, 10)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const resultat = await en(jeton, () => impactCapacite({ capacite: 4 }))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('FORBIDDEN')
  })

  it('ne laisse pas passer une capacité glissée dans la mise à jour des informations', async () => {
    const { jeton } = await decorSolenne(10)

    // `capacityMax` et `capacite` n'existent pas dans le schéma des
    // informations : la valeur est ignorée, pas filtrée.
    const resultat = await en(jeton, async () => {
      const { mettreAJourMaison } = await import('@/server/actions/maison')
      return mettreAJourMaison({ nom: 'La maison', capacite: 99, capacityMax: 99 })
    })

    expect(resultat.ok).toBe(true)
    expect((await client.house.findFirstOrThrow()).capacityMax).toBe(10)
  })
})

describe('La capacité reste lisible par tout le cercle', () => {
  it('apparaît dans la vue de la maison', async () => {
    await creerMaison(client, 14)
    const ami = await creerUtilisateur(client)
    const jeton = await sessionPour(ami.id)

    const resultat = await en(jeton, () => maison())

    expect(resultat.ok && resultat.data.capaciteMax).toBe(14)
  })
})
