import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('../../faux-next-headers'))

import { ajouterJours, versTexteJour } from '@/domain/core/dates'
import { ErreurMetier } from '@/domain/core/result'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  blocages,
  creerBlocage,
  impactBlocage,
  modifierBlocage,
  periodesIndisponibles,
  supprimerBlocage,
} from '@/server/actions/blocages'
import { reinitialiserAntiSaturation } from '@/server/audit'
import { NOM_COOKIE_SESSION, ouvrirSession } from '@/server/auth/session'
import { verifierPeriodeLibre } from '@/server/blocages'
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
 * `BLOCK` — périodes bloquées (BLOCK-001 → 012, C05, S09).
 *
 * Les dates sont posées relativement à aujourd'hui : un test qui passe en août
 * doit passer en décembre, et « dans le passé » doit rester dans le passé.
 */

const client: PrismaClient = clientDeTest()

/** Un jour à `n` jours d'ici, au format `AAAA-MM-JJ`. Négatif = passé. */
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

async function decorSolenne(capacite = 10) {
  const solenne = await creerAdministratrice(client)
  const maison = await creerMaison(client, capacite)
  return { solenne, maison, jeton: await sessionPour(solenne.id) }
}

async function bloquer(
  jeton: string,
  du: string,
  au: string,
  reste: {
    readonly libelle?: string
    readonly motif?: string
    readonly type?: 'MAINTENANCE' | 'PERSONAL' | 'OTHER'
  } = {},
) {
  return en(jeton, () =>
    creerBlocage({
      du,
      au,
      libelle: reste.libelle ?? 'Travaux',
      type: reste.type ?? 'MAINTENANCE',
      ...(reste.motif === undefined ? {} : { motif: reste.motif }),
    }),
  )
}

// ---------------------------------------------------------------------------

describe('BLOCK-001 — création', () => {
  it('crée la période, la rend visible et la journalise', async () => {
    const { solenne, jeton } = await decorSolenne()

    const creation = await bloquer(jeton, dans(40), dans(45), {
      libelle: 'Travaux',
      motif: 'Réfection du toit de la grange',
    })

    expect(creation.ok).toBe(true)
    if (!creation.ok) return

    const vue = await en(jeton, () => blocages())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data).toHaveLength(1)
    expect(vue.data[0]).toMatchObject({
      id: creation.data.id,
      libelle: 'Travaux',
      motif: 'Réfection du toit de la grange',
      type: 'MAINTENANCE',
      revolue: false,
    })
    expect(versTexteJour(vue.data[0]!.du)).toBe(dans(40))
    expect(versTexteJour(vue.data[0]!.au)).toBe(dans(45))

    const trace = await client.auditLog.findFirst({
      where: { action: 'blocage.creation' },
    })
    expect(trace?.actorId).toBe(solenne.id)
    expect(trace?.entityId).toBe(creation.data.id)
  })

  it('refuse un type inventé', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      creerBlocage({
        du: dans(10),
        au: dans(12),
        libelle: 'Travaux',
        type: 'VACANCES',
      }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
  })

  it('refuse un libellé vide', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await bloquer(jeton, dans(10), dans(12), { libelle: '  ' })

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
    expect(resultat.champs?.libelle).toBeTruthy()
  })
})

describe('BLOCK-003 — dates inversées', () => {
  it('refuse une fin antérieure au début', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await bloquer(jeton, dans(20), dans(15))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('INVALID_DATES')
    expect(resultat.message).toBe(
      'La date de départ doit être après la date d’arrivée.',
    )
    expect(await client.blockedPeriod.count()).toBe(0)
  })

  it('refuse une date qui n’en est pas une', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await bloquer(jeton, '32/12/2026', dans(15))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('VALIDATION')
  })
})

describe('BLOCK-004 — blocage dans le passé', () => {
  it('l’autorise et le signale comme révolu', async () => {
    const { jeton } = await decorSolenne()

    const creation = await bloquer(jeton, dans(-30), dans(-25), {
      libelle: 'Hiver — maison fermée',
      type: 'OTHER',
    })
    expect(creation.ok).toBe(true)

    const vue = await en(jeton, () => blocages())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data[0]?.revolue).toBe(true)
  })

  it('n’oppose pas un blocage révolu à des dates à venir', async () => {
    const { jeton } = await decorSolenne()
    await bloquer(jeton, dans(-30), dans(-25))

    await expect(
      verifierPeriodeLibre(leJour(dans(10)), leJour(dans(12)), client),
    ).resolves.toBeUndefined()
  })
})

describe('BLOCK-005 / BLK-R2 — deux blocages qui se chevauchent', () => {
  it('les accepte tous les deux et n’en montre qu’un aux amis', async () => {
    const { jeton } = await decorSolenne()

    expect((await bloquer(jeton, dans(30), dans(35))).ok).toBe(true)
    expect((await bloquer(jeton, dans(33), dans(40), { libelle: 'Peinture' })).ok).toBe(
      true,
    )

    const console_ = await en(jeton, () => blocages())
    expect(console_.ok).toBe(true)
    if (console_.ok) expect(console_.data).toHaveLength(2)

    const ami = await creerUtilisateur(client)
    const vueAmi = await en(await sessionPour(ami.id), () =>
      periodesIndisponibles(),
    )

    expect(vueAmi.ok).toBe(true)
    if (!vueAmi.ok) return
    expect(vueAmi.data).toHaveLength(1)
    expect(versTexteJour(vueAmi.data[0]!.du)).toBe(dans(30))
    expect(versTexteJour(vueAmi.data[0]!.au)).toBe(dans(40))
  })
})

describe('BLOCK-006 / BLK-R1 — une demande sur une période bloquée', () => {
  it('est refusée, en français, sans détail technique', async () => {
    const { jeton } = await decorSolenne()
    await bloquer(jeton, dans(30), dans(35), { libelle: 'Travaux' })

    const refus = await verifierPeriodeLibre(
      leJour(dans(31)),
      leJour(dans(33)),
      client,
    ).catch((erreur: unknown) => erreur)

    expect(refus).toBeInstanceOf(ErreurMetier)
    expect((refus as ErreurMetier).code).toBe('BLOCKED_PERIOD')
    expect((refus as ErreurMetier).message).toBe(
      'Ces dates ne sont pas disponibles.',
    )
    // Le motif du blocage ne fuit pas dans le refus (BLOCK-S09).
    expect((refus as ErreurMetier).message).not.toContain('Travaux')
  })

  it('laisse passer des dates libres', async () => {
    const { jeton } = await decorSolenne()
    await bloquer(jeton, dans(30), dans(35))

    await expect(
      verifierPeriodeLibre(leJour(dans(35)), leJour(dans(38)), client),
    ).resolves.toBeUndefined()
  })
})

describe('BLOCK-007 / BLK-R3 — blocage sur un séjour confirmé', () => {
  it('est refusé, et nomme le séjour à annuler d’abord', async () => {
    const { maison, jeton } = await decorSolenne()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await creerSejour(client, maison.id, lea.id, {
      du: dans(50),
      au: dans(53),
      adultes: 2,
      enfants: 1,
    })

    const resultat = await bloquer(jeton, dans(49), dans(54))

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('BLOCKED_OVER_STAY')
    expect(resultat.message).toContain('Léa')
    expect(await client.blockedPeriod.count()).toBe(0)

    // L'écran doit pouvoir montrer quoi annuler, pas seulement dire non.
    const impact = await en(jeton, () =>
      impactBlocage({ du: dans(49), au: dans(54) }),
    )
    expect(impact.ok).toBe(true)
    if (!impact.ok) return
    expect(impact.data.sejoursEnCause).toHaveLength(1)
    expect(impact.data.sejoursEnCause[0]).toMatchObject({
      qui: 'Léa',
      personnes: 3,
    })
  })

  it('accepte un blocage qui s’arrête le jour de l’arrivée du séjour', async () => {
    const { maison, jeton } = await decorSolenne()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await creerSejour(client, maison.id, lea.id, { du: dans(50), au: dans(53) })

    // `[début, fin[` : le blocage libère le jour 50, le séjour l'occupe.
    const resultat = await bloquer(jeton, dans(47), dans(50))

    expect(resultat.ok).toBe(true)
  })

  it('ignore un séjour annulé', async () => {
    const { maison, jeton } = await decorSolenne()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await creerSejour(client, maison.id, lea.id, {
      du: dans(50),
      au: dans(53),
      statut: 'CANCELLED',
    })

    expect((await bloquer(jeton, dans(49), dans(54))).ok).toBe(true)
  })
})

describe('BLOCK-008 / BLK-R4 — blocage sur une demande en attente', () => {
  it('est accepté et signale la demande', async () => {
    const { jeton } = await decorSolenne()
    const jean = await creerUtilisateur(client, { prenom: 'Jean' })
    const demande = await creerDemande(client, jean.id, {
      du: dans(50),
      au: dans(53),
      adultes: 2,
      enfants: 1,
    })

    const resultat = await bloquer(jeton, dans(49), dans(54))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.demandesSignalees).toHaveLength(1)
    expect(resultat.data.demandesSignalees[0]).toMatchObject({
      id: demande.id,
      qui: 'Jean',
      personnes: 3,
    })

    // La console garde le signalement sous les yeux de Solenne.
    const vue = await en(jeton, () => blocages())
    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data[0]?.demandesSignalees).toHaveLength(1)
  })

  it('ne signale pas une demande déjà refusée', async () => {
    const { jeton } = await decorSolenne()
    const jean = await creerUtilisateur(client, { prenom: 'Jean' })
    await creerDemande(client, jean.id, {
      du: dans(50),
      au: dans(53),
      statut: 'REJECTED',
    })

    const resultat = await bloquer(jeton, dans(49), dans(54))

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.data.demandesSignalees).toHaveLength(0)
  })
})

describe('BLOCK-009 — suppression', () => {
  it('rend les dates disponibles et laisse une trace', async () => {
    const { solenne, jeton } = await decorSolenne()
    const creation = await bloquer(jeton, dans(30), dans(35))
    expect(creation.ok).toBe(true)
    if (!creation.ok) return

    const suppression = await en(jeton, () =>
      supprimerBlocage({ id: creation.data.id }),
    )
    expect(suppression.ok).toBe(true)

    await expect(
      verifierPeriodeLibre(leJour(dans(31)), leJour(dans(33)), client),
    ).resolves.toBeUndefined()

    const trace = await client.auditLog.findFirst({
      where: { action: 'blocage.suppression' },
    })
    expect(trace?.actorId).toBe(solenne.id)
    expect(trace?.entityId).toBe(creation.data.id)
  })

  it('répond NOT_FOUND sur un identifiant inconnu, sans rien confirmer', async () => {
    const { jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      supprimerBlocage({ id: 'blocage-qui-nexiste-pas' }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('NOT_FOUND')
  })
})

describe('BLOCK-010 — modification', () => {
  it('étend la période, et le moteur en tient compte', async () => {
    const { jeton } = await decorSolenne()
    const creation = await bloquer(jeton, dans(30), dans(35))
    expect(creation.ok).toBe(true)
    if (!creation.ok) return

    // Avant : le jour 36 est libre.
    await expect(
      verifierPeriodeLibre(leJour(dans(36)), leJour(dans(38)), client),
    ).resolves.toBeUndefined()

    const modification = await en(jeton, () =>
      modifierBlocage({
        id: creation.data.id,
        du: dans(30),
        au: dans(40),
        libelle: 'Travaux prolongés',
        type: 'MAINTENANCE',
      }),
    )
    expect(modification.ok).toBe(true)

    await expect(
      verifierPeriodeLibre(leJour(dans(36)), leJour(dans(38)), client),
    ).rejects.toMatchObject({ code: 'BLOCKED_PERIOD' })

    const trace = await client.auditLog.findFirst({
      where: { action: 'blocage.modification' },
    })
    expect(trace).not.toBeNull()
  })

  it('refuse une extension qui recouvrirait un séjour confirmé', async () => {
    const { maison, jeton } = await decorSolenne()
    const creation = await bloquer(jeton, dans(30), dans(35))
    expect(creation.ok).toBe(true)
    if (!creation.ok) return

    const lea = await creerUtilisateur(client, { prenom: 'Léa' })
    await creerSejour(client, maison.id, lea.id, { du: dans(50), au: dans(53) })

    const resultat = await en(jeton, () =>
      modifierBlocage({
        id: creation.data.id,
        du: dans(30),
        au: dans(55),
        libelle: 'Travaux',
        type: 'MAINTENANCE',
      }),
    )

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('BLOCKED_OVER_STAY')
  })
})

describe('BLOCK-C05 — blocage et confirmation de séjour au même instant', () => {
  it('laisse passer l’un des deux, jamais les deux', async () => {
    const { maison, jeton } = await decorSolenne()
    const lea = await creerUtilisateur(client, { prenom: 'Léa' })

    // Une confirmation de séjour telle que `STAYDEC` l'écrira au lot 3 :
    // lecture des blocages, puis écriture du séjour, en sérialisable.
    const confirmation = client
      .$transaction(
        async (transaction) => {
          const opposes = await transaction.blockedPeriod.findMany({
            where: {
              startDate: { lt: leJour(dans(53)) },
              endDate: { gt: leJour(dans(50)) },
            },
          })
          if (opposes.length > 0) throw new ErreurMetier('BLOCKED_PERIOD')

          return transaction.stay.create({
            data: {
              houseId: maison.id,
              userId: lea.id,
              startDate: leJour(dans(50)),
              endDate: leJour(dans(53)),
              adults: 2,
              children: 0,
              status: 'CONFIRMED',
            },
          })
        },
        { isolationLevel: 'Serializable' },
      )
      .then(() => true)
      .catch(() => false)

    const blocage = bloquer(jeton, dans(49), dans(54)).then((r) => r.ok)

    const [sejourEcrit, blocageEcrit] = await Promise.all([confirmation, blocage])

    // L'invariant : jamais un séjour confirmé sous une période bloquée.
    // Exactement une des deux écritures aboutit — l'autre échoue proprement.
    expect([sejourEcrit, blocageEcrit].filter(Boolean)).toHaveLength(1)

    const sejours = await client.stay.count({ where: { status: 'CONFIRMED' } })
    const periodes = await client.blockedPeriod.count()
    expect(sejours * periodes).toBe(0)
  })

  it('remonte un conflit d’écriture en refus lisible, jamais en incident', async () => {
    const { jeton } = await decorSolenne()

    const [a, b] = await Promise.all([
      bloquer(jeton, dans(30), dans(35), { libelle: 'Travaux' }),
      bloquer(jeton, dans(31), dans(36), { libelle: 'Peinture' }),
    ])

    for (const resultat of [a, b]) {
      if (!resultat.ok) {
        expect(['CONFLICT', 'BLOCKED_OVER_STAY']).toContain(resultat.code)
        expect(resultat.message).not.toContain('Error')
      }
    }
  })
})

describe('BLOCK-S09 — le motif reste privé', () => {
  it('n’envoie ni libellé ni motif à un ami', async () => {
    const { jeton } = await decorSolenne()
    await bloquer(jeton, dans(30), dans(35), {
      libelle: 'Week-end en famille',
      motif: 'Anniversaire de Julien',
      type: 'PERSONAL',
    })

    const ami = await creerUtilisateur(client)
    const vue = await en(await sessionPour(ami.id), () => periodesIndisponibles())

    expect(vue.ok).toBe(true)
    if (!vue.ok) return
    expect(vue.data).toHaveLength(1)

    // Pas « masqué à l'affichage » : absent de la réponse (règle n°4).
    const brut = JSON.stringify(vue.data)
    expect(brut).not.toContain('Week-end en famille')
    expect(brut).not.toContain('Anniversaire')
    expect(brut).not.toContain('PERSONAL')
    expect(Object.keys(vue.data[0]!).sort()).toEqual(['au', 'du'])
  })

  it('refuse la vue détaillée à un ami', async () => {
    await decorSolenne()
    const ami = await creerUtilisateur(client)

    const resultat = await en(await sessionPour(ami.id), () => blocages())

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe('FORBIDDEN')
  })
})

describe('BLOCK-S01 / S02 — gardes', () => {
  it('refuse toute lecture sans session', async () => {
    await decorSolenne()

    for (const appel of [periodesIndisponibles, blocages]) {
      const resultat = await dansUneRequete(() => appel())
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe('UNAUTHENTICATED')
    }
  })

  it('refuse les quatre écritures à un ami, et le journalise', async () => {
    const { jeton } = await decorSolenne()
    const creation = await bloquer(jeton, dans(30), dans(35))
    expect(creation.ok).toBe(true)
    if (!creation.ok) return

    const ami = await creerUtilisateur(client)
    const jetonAmi = await sessionPour(ami.id)
    const donnees = {
      id: creation.data.id,
      du: dans(60),
      au: dans(62),
      libelle: 'Ma période à moi',
      type: 'OTHER' as const,
    }

    const refus = await Promise.all([
      en(jetonAmi, () => creerBlocage(donnees)),
      en(jetonAmi, () => modifierBlocage(donnees)),
      en(jetonAmi, () => supprimerBlocage({ id: creation.data.id })),
      en(jetonAmi, () => impactBlocage({ du: donnees.du, au: donnees.au })),
    ])

    for (const resultat of refus) {
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe('FORBIDDEN')
    }

    expect(await client.blockedPeriod.count()).toBe(1)
    const journal = await client.auditLog.count({
      where: { action: { startsWith: 'refus.blocages.' } },
    })
    expect(journal).toBeGreaterThanOrEqual(4)
  })

  it('ignore un identifiant de maison envoyé par le client (S07)', async () => {
    const { maison, jeton } = await decorSolenne()

    const resultat = await en(jeton, () =>
      creerBlocage({
        houseId: 'maison-imaginaire',
        du: dans(30),
        au: dans(35),
        libelle: 'Travaux',
        type: 'MAINTENANCE',
      }),
    )

    expect(resultat.ok).toBe(true)
    const enregistre = await client.blockedPeriod.findFirst()
    expect(enregistre?.houseId).toBe(maison.id)
  })
})
