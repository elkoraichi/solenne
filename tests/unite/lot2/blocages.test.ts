import { describe, expect, it } from 'vitest'

import { jour, versTexteJour } from '@/domain/core/dates'
import {
  blocageSur,
  estRevolue,
  fusionnerPeriodes,
  joursBloques,
  periodeValide,
  seChevauchent,
  TYPES_BLOCAGE,
  type Periode,
} from '@/domain/house/blocages'

/**
 * `BLOCK` — logique pure des périodes bloquées.
 *
 * Le module ne connaît ni la base ni la session : il répond à trois questions —
 * la période est-elle bien formée, est-elle passée, et interdit-elle des dates
 * demandées (BLK-R1). Le refus lui-même appartient au serveur.
 */

function periode(du: string, au: string): Periode {
  return { du: jour(du), au: jour(au) }
}

describe('BLOCK-002 — un blocage d’un seul jour', () => {
  it('accepte une période d’une seule nuit', () => {
    expect(periodeValide(jour('2026-10-12'), jour('2026-10-13'))).toBe(true)
  })

  it('ne bloque que ce jour-là', () => {
    const bloques = joursBloques([periode('2026-10-12', '2026-10-13')])
    expect([...bloques]).toEqual(['2026-10-12'])
  })
})

describe('BLOCK-003 — dates inversées ou nulles', () => {
  it('refuse une fin antérieure au début', () => {
    expect(periodeValide(jour('2026-10-05'), jour('2026-10-01'))).toBe(false)
  })

  it('refuse une période vide — une nuit au moins', () => {
    expect(periodeValide(jour('2026-10-05'), jour('2026-10-05'))).toBe(false)
  })
})

describe('BLOCK-004 — blocage dans le passé', () => {
  const aujourdhui = jour('2026-08-22')

  it('reconnaît une période révolue sans la refuser', () => {
    expect(estRevolue(periode('2026-07-01', '2026-07-05'), aujourdhui)).toBe(true)
    expect(periodeValide(jour('2026-07-01'), jour('2026-07-05'))).toBe(true)
  })

  it('ne tient pas pour révolue une période qui court encore', () => {
    expect(estRevolue(periode('2026-08-20', '2026-08-25'), aujourdhui)).toBe(false)
  })

  it('tient pour révolue une période dont le départ est aujourd’hui', () => {
    // Convention `[début, fin[` : le 22 n'est pas bloqué, la période est finie.
    expect(estRevolue(periode('2026-08-18', '2026-08-22'), aujourdhui)).toBe(true)
  })
})

describe('BLOCK-005 / BLK-R2 — deux blocages qui se chevauchent', () => {
  const premier = periode('2026-10-01', '2026-10-05')
  const second = periode('2026-10-03', '2026-10-08')

  it('les reconnaît comme chevauchants', () => {
    expect(seChevauchent(premier, second)).toBe(true)
  })

  it('n’en fait qu’une seule période à l’affichage — pas de doublon visuel', () => {
    const fusion = fusionnerPeriodes([second, premier])
    expect(fusion).toHaveLength(1)
    expect(versTexteJour(fusion[0]!.du)).toBe('2026-10-01')
    expect(versTexteJour(fusion[0]!.au)).toBe('2026-10-08')
  })

  it('laisse séparées deux périodes disjointes', () => {
    const fusion = fusionnerPeriodes([
      periode('2026-10-01', '2026-10-03'),
      periode('2026-10-06', '2026-10-08'),
    ])
    expect(fusion).toHaveLength(2)
  })

  it('recolle deux périodes bout à bout', () => {
    // Du 1 au 3 puis du 3 au 6 : aucun jour libre entre les deux.
    const fusion = fusionnerPeriodes([
      periode('2026-10-01', '2026-10-03'),
      periode('2026-10-03', '2026-10-06'),
    ])
    expect(fusion).toHaveLength(1)
    expect(versTexteJour(fusion[0]!.au)).toBe('2026-10-06')
  })

  it('ne compte pas deux fois un jour couvert par deux blocages', () => {
    expect(joursBloques([premier, second]).size).toBe(7)
  })
})

describe('BLOCK-006 / BLK-R1 — un blocage interdit les dates qu’il couvre', () => {
  const blocages = [periode('2026-10-01', '2026-10-05')]

  it('désigne le blocage qui s’oppose à une demande incluse', () => {
    expect(blocageSur(blocages, jour('2026-10-02'), jour('2026-10-04'))).toBe(
      blocages[0],
    )
  })

  it('s’oppose aussi à une demande qui déborde de part et d’autre', () => {
    expect(
      blocageSur(blocages, jour('2026-09-28'), jour('2026-10-10')),
    ).not.toBeNull()
  })

  it('laisse passer une demande entièrement en dehors', () => {
    expect(blocageSur(blocages, jour('2026-10-06'), jour('2026-10-09'))).toBeNull()
  })
})

describe('BLOCK-012 — convention de bornes `[début, fin[`', () => {
  const blocages = [periode('2026-10-10', '2026-10-12')]

  it('laisse arriver le jour même de la fin du blocage', () => {
    expect(blocageSur(blocages, jour('2026-10-12'), jour('2026-10-14'))).toBeNull()
  })

  it('laisse partir le jour même du début du blocage', () => {
    expect(blocageSur(blocages, jour('2026-10-08'), jour('2026-10-10'))).toBeNull()
  })

  it('refuse une arrivée la veille de la fin', () => {
    expect(
      blocageSur(blocages, jour('2026-10-11'), jour('2026-10-14')),
    ).not.toBeNull()
  })

  it('ne bloque pas le jour de la fin', () => {
    expect([...joursBloques(blocages)]).toEqual(['2026-10-10', '2026-10-11'])
  })
})

describe('Les trois types de blocage', () => {
  it('sont ceux de la fiche, et rien d’autre', () => {
    expect(TYPES_BLOCAGE).toEqual(['MAINTENANCE', 'PERSONAL', 'OTHER'])
  })
})
