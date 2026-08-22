import { describe, expect, it } from 'vitest'

import { jour } from '@/domain/core/dates'
import { occupationLeJour, occupationSur } from '@/domain/occupancy/occupation'
import {
  STATUTS_COMPTES,
  effectifDuSejour,
  presencesDesSejours,
  type SejourCompte,
} from '@/domain/occupancy/sejours'

/**
 * `OCCUP-001→014` — les fondamentaux du décompte.
 *
 * Le seul endroit du produit où l'on additionne des personnes (règle non
 * négociable n°3). Tout le reste — `AVAIL`, l'agenda, la décision de Solenne —
 * lit ce résultat sans jamais le recalculer.
 */

function sejour(modifications: Partial<SejourCompte> = {}): SejourCompte {
  return {
    id: 'sejour-1',
    arrivee: jour('2026-09-10'),
    depart: jour('2026-09-12'),
    adultes: 4,
    enfants: 0,
    statut: 'CONFIRMED',
    ...modifications,
  }
}

/** Combien de personnes dans la maison le jour dit. */
function personnesLe(texteDuJour: string, sejours: readonly SejourCompte[]): number {
  return occupationLeJour(presencesDesSejours(sejours), jour(texteDuJour)).total
}

describe('OCCUP-001 — maison vide', () => {
  it('ne compte personne quand aucun séjour n’existe', () => {
    expect(personnesLe('2026-09-10', [])).toBe(0)
  })
})

describe('OCCUP-002 — un séjour', () => {
  it('compte les quatre personnes d’un séjour du 10 au 12', () => {
    expect(personnesLe('2026-09-10', [sejour()])).toBe(4)
  })
})

describe('OCCUP-003 — deux séjours simultanés', () => {
  it('additionne 4 et 3 sur la même journée', () => {
    expect(
      personnesLe('2026-09-10', [sejour(), sejour({ id: 'sejour-2', adultes: 3 })]),
    ).toBe(7)
  })
})

describe('OCCUP-004 — chevauchement partiel', () => {
  const sejours = [
    sejour({
      id: 'A',
      adultes: 4,
      arrivee: jour('2026-09-08'),
      depart: jour('2026-09-11'),
    }),
    sejour({
      id: 'B',
      adultes: 3,
      arrivee: jour('2026-09-10'),
      depart: jour('2026-09-13'),
    }),
  ]

  it('rend 4, 7 puis 3 les 9, 10 et 11 septembre', () => {
    expect(personnesLe('2026-09-09', sejours)).toBe(4)
    expect(personnesLe('2026-09-10', sejours)).toBe(7)
    expect(personnesLe('2026-09-11', sejours)).toBe(3)
  })

  it('donne le même détail en une seule interrogation de période', () => {
    const { jours, total } = occupationSur(presencesDesSejours(sejours), {
      debut: jour('2026-09-08'),
      fin: jour('2026-09-13'),
    })

    expect(jours.map((j) => j.total)).toEqual([4, 4, 7, 3, 3])
    expect(total).toBe(7)
  })
})

describe('OCCUP-005 — le jour d’arrivée est occupé', () => {
  it('compte le 10 d’un séjour du 10 au 12', () => {
    expect(personnesLe('2026-09-10', [sejour()])).toBe(4)
  })
})

describe('OCCUP-006 — le jour de départ est libre', () => {
  it('ne compte pas le 12 d’un séjour du 10 au 12', () => {
    expect(personnesLe('2026-09-12', [sejour()])).toBe(0)
  })
})

describe('OCCUP-007 — séjour d’une seule nuit', () => {
  it('occupe le 10 et libère le 11', () => {
    const uneNuit = [sejour({ adultes: 2, depart: jour('2026-09-11') })]

    expect(personnesLe('2026-09-10', uneNuit)).toBe(2)
    expect(personnesLe('2026-09-11', uneNuit)).toBe(0)
  })
})

describe('OCCUP-008 — adultes et enfants', () => {
  it('compte les enfants comme des personnes : 2 + 3 font 5', () => {
    expect(personnesLe('2026-09-10', [sejour({ adultes: 2, enfants: 3 })])).toBe(5)
  })
})

describe('OCCUP-009 — invités nommés, sans double comptage (P6)', () => {
  /**
   * P6, arrêté à l'ouverture d'`OCCUP` : l'effectif d'un séjour est
   * **adultes + enfants**. La table `stay_guests` *nomme* ces mêmes personnes —
   * elle n'en ajoute aucune. Le §6.4 du Mode Opératoire écrit « + invités » ;
   * l'additionner compterait chaque enfant nommé deux fois.
   */
  it('reste à 4 quand les 4 personnes du séjour sont nommées une à une', () => {
    const nomme = sejour({
      adultes: 2,
      enfants: 2,
      invitesNommes: ['Claire', 'Marc', 'Léa', 'Tom'],
    })

    expect(effectifDuSejour(nomme)).toBe(4)
    expect(personnesLe('2026-09-10', [nomme])).toBe(4)
  })

  it('compte pareil que le séjour soit nommé ou anonyme', () => {
    const anonyme = sejour({ adultes: 2, enfants: 2 })
    const nomme = sejour({ adultes: 2, enfants: 2, invitesNommes: ['Claire', 'Marc'] })

    expect(effectifDuSejour(nomme)).toBe(effectifDuSejour(anonyme))
  })
})

describe('OCCUP-010 — séjour annulé', () => {
  it('ne compte pas un séjour annulé', () => {
    expect(personnesLe('2026-09-10', [sejour({ statut: 'CANCELLED' })])).toBe(0)
  })

  it('compte encore un séjour passé, marqué terminé', () => {
    expect(personnesLe('2026-09-10', [sejour({ statut: 'COMPLETED' })])).toBe(4)
  })
})

describe('OCCUP-011 et OCCUP-012 — une demande n’est pas un séjour', () => {
  /**
   * Liste blanche, jamais liste noire : `OCCUP` ne compte que les statuts qu'il
   * a explicitement déclarés. Un statut inconnu — parce qu'une demande a été
   * poussée là par erreur, ou parce qu'un statut naîtra plus tard — vaut zéro,
   * jamais « compté par défaut ».
   */
  it('ne connaît que les séjours confirmés et terminés', () => {
    expect([...STATUTS_COMPTES].sort()).toEqual(['COMPLETED', 'CONFIRMED'])
  })

  it('ignore une demande en attente qui se serait glissée dans la liste', () => {
    const enAttente = sejour({ statut: 'PENDING' as SejourCompte['statut'] })

    expect(personnesLe('2026-09-10', [enAttente])).toBe(0)
  })

  it('ignore une demande refusée', () => {
    const refusee = sejour({ statut: 'REJECTED' as SejourCompte['statut'] })

    expect(personnesLe('2026-09-10', [refusee])).toBe(0)
  })
})

describe('OCCUP-013 — la confidentialité n’affecte pas le calcul', () => {
  it('compte les 8 personnes d’un séjour caché', () => {
    const cache = sejour({ adultes: 8 })

    expect(personnesLe('2026-09-10', [cache])).toBe(8)
  })

  it('ne demande même pas le niveau de confidentialité', () => {
    expect(Object.keys(sejour())).not.toContain('confidentialite')
  })
})

describe('OCCUP-014 — le séjour de Solenne compte comme un autre', () => {
  it('compte les 2 personnes d’un séjour personnel de la maîtresse de maison', () => {
    expect(personnesLe('2026-09-10', [sejour({ adultes: 2, sejourDeSolenne: true })])).toBe(
      2,
    )
  })

  it('compte le même effectif que le séjour d’un ami', () => {
    const deSolenne = sejour({ adultes: 2, sejourDeSolenne: true })
    const dUnAmi = sejour({ id: 'sejour-2', adultes: 2 })

    expect(effectifDuSejour(deSolenne)).toBe(effectifDuSejour(dUnAmi))
  })
})

describe('Bornes de la période interrogée', () => {
  it('OCCUP-016 — refuse explicitement une période inversée', () => {
    expect(() =>
      occupationSur([], { debut: jour('2026-09-12'), fin: jour('2026-09-10') }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_DATES' }))
  })

  it('OCCUP-017 — rend zéro sans broncher sur une période de durée nulle', () => {
    const resultat = occupationSur(presencesDesSejours([sejour()]), {
      debut: jour('2026-09-10'),
      fin: jour('2026-09-10'),
    })

    expect(resultat.total).toBe(0)
    expect(resultat.jours).toEqual([])
  })
})
