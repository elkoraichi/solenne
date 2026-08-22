import { describe, expect, it } from 'vitest'

import { jour, versTexteJour } from '@/domain/core/dates'
import {
  contributeursActifs,
  joursAuDela,
  occupationMaximale,
  occupationParJour,
  presencesConcernees,
  REGISTRE,
  type Presence,
} from '@/domain/occupancy/registre'

/**
 * Amorce du module `OCCUP` — l'unique endroit où l'on additionne des personnes.
 *
 * `HOUSE` en a besoin dès le lot 2 pour refuser une réduction de capacité sous
 * l'occupation déjà confirmée. Le registre de contributeurs du §6 est donc posé
 * ici ; le lot 3 le complètera (contrat `OCCUP-CT-*`, sentinelle `OCCUP-024`)
 * sans le réécrire.
 */

function presence(
  arrivee: string,
  depart: string,
  personnes: number,
  contributeur: Presence['contributeur'] = 'SEJOUR_CONFIRME',
): Presence {
  return {
    contributeur,
    reference: `${contributeur}-${arrivee}`,
    arrivee: jour(arrivee),
    depart: jour(depart),
    personnes,
  }
}

describe('Registre des contributeurs (§6.1)', () => {
  it('déclare les trois contributeurs prévus', () => {
    expect(REGISTRE.map((c) => c.nom)).toEqual([
      'SEJOUR_CONFIRME',
      'DORMEUR_EVENEMENT',
      'AFFECTATION_CHAMBRE',
    ])
  })

  it('n’active que le séjour confirmé tant que le lot 4 n’est pas là', () => {
    expect(contributeursActifs()).toEqual(['SEJOUR_CONFIRME'])
  })

  it('ignore la contribution d’un contributeur dormant', () => {
    // Garde-fou G3 : un contributeur déclaré mais inactif rend zéro. Le jour
    // où `SLEEP` l'active, le total change sans qu'aucune formule ne bouge.
    const total = occupationParJour([
      presence('2026-09-10', '2026-09-12', 4),
      presence('2026-09-10', '2026-09-12', 3, 'DORMEUR_EVENEMENT'),
    ])
    expect(total.get('2026-09-10')).toBe(4)
  })
})

describe('Occupation jour par jour', () => {
  it('respecte la convention [arrivée, départ[ — le jour du départ est libre', () => {
    const total = occupationParJour([presence('2026-09-10', '2026-09-12', 4)])

    expect(total.get('2026-09-10')).toBe(4)
    expect(total.get('2026-09-11')).toBe(4)
    expect(total.get('2026-09-12')).toBeUndefined()
  })

  it('additionne deux séjours qui se chevauchent', () => {
    const total = occupationParJour([
      presence('2026-09-10', '2026-09-13', 4),
      presence('2026-09-12', '2026-09-14', 3),
    ])

    expect(total.get('2026-09-11')).toBe(4)
    expect(total.get('2026-09-12')).toBe(7)
    expect(total.get('2026-09-13')).toBe(3)
  })

  it('ne compte pas un départ et une arrivée le même jour deux fois', () => {
    const total = occupationParJour([
      presence('2026-09-08', '2026-09-10', 4),
      presence('2026-09-10', '2026-09-12', 3),
    ])

    expect(total.get('2026-09-09')).toBe(4)
    expect(total.get('2026-09-10')).toBe(3)
  })

  it('renvoie le pic d’occupation', () => {
    const pic = occupationMaximale([
      presence('2026-09-10', '2026-09-13', 4),
      presence('2026-09-12', '2026-09-14', 3),
    ])

    expect(pic).not.toBeNull()
    expect(pic?.personnes).toBe(7)
    expect(versTexteJour(pic?.jour as Date)).toBe('2026-09-12')
  })

  it('n’a pas de pic quand il n’y a personne', () => {
    expect(occupationMaximale([])).toBeNull()
  })
})

describe('HOUSE-R2 — dépassement d’une capacité donnée', () => {
  const presences = [
    presence('2026-09-10', '2026-09-13', 5),
    presence('2026-09-11', '2026-09-12', 4),
  ]

  it('désigne les jours au-delà de la capacité visée', () => {
    const jours = joursAuDela(presences, 6)

    expect(jours).toHaveLength(1)
    expect(versTexteJour(jours[0]?.jour as Date)).toBe('2026-09-11')
    expect(jours[0]?.personnes).toBe(9)
  })

  it('ne signale rien quand la capacité visée suffit', () => {
    expect(joursAuDela(presences, 9)).toEqual([])
  })

  it('désigne les séjours à l’origine du dépassement, sans doublon', () => {
    const concernees = presencesConcernees(presences, 6)

    expect(concernees).toHaveLength(2)
    expect(new Set(concernees.map((p) => p.reference)).size).toBe(2)
  })

  it('laisse tranquille un séjour qui ne touche aucun jour en dépassement', () => {
    const concernees = presencesConcernees(
      [...presences, presence('2026-12-01', '2026-12-03', 2)],
      6,
    )

    expect(concernees.map((p) => p.reference)).not.toContain(
      'SEJOUR_CONFIRME-2026-12-01',
    )
  })
})
