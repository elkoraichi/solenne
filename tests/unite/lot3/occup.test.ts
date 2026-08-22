import { describe, expect, it } from 'vitest'

import { jour, versTexteJour } from '@/domain/core/dates'
import { occupationLeJour, occupationMaximale, occupationSur } from '@/domain/occupancy/occupation'
import {
  REGISTRE,
  contributeursActifs,
  type Presence,
} from '@/domain/occupancy/registre'
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

describe('OCCUP-015 — période interrogée large, sur plusieurs mois', () => {
  it('rend le détail jour par jour correct du 1er septembre au 30 novembre', () => {
    const sejours = [
      sejour({ id: 'A', arrivee: jour('2026-09-05'), depart: jour('2026-09-08'), adultes: 2 }),
      sejour({ id: 'B', arrivee: jour('2026-10-10'), depart: jour('2026-10-15'), adultes: 6 }),
      sejour({ id: 'C', arrivee: jour('2026-11-20'), depart: jour('2026-11-22'), adultes: 3 }),
    ]

    const { jours, total } = occupationSur(presencesDesSejours(sejours), {
      debut: jour('2026-09-01'),
      fin: jour('2026-11-30'),
    })

    const parDate = new Map(jours.map((j) => [versTexteJour(j.jour), j.total]))

    expect(parDate.get('2026-09-01')).toBe(0)
    expect(parDate.get('2026-09-05')).toBe(2)
    expect(parDate.get('2026-09-07')).toBe(2)
    expect(parDate.get('2026-09-08')).toBe(0)
    expect(parDate.get('2026-10-12')).toBe(6)
    expect(parDate.get('2026-11-21')).toBe(3)
    expect(parDate.get('2026-11-29')).toBe(0)
    expect(total).toBe(6)
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

describe('OCCUP-018 — une personne identifiée n’est comptée qu’une fois par jour', () => {
  /**
   * Seul `SEJOUR_CONFIRME` est actif au lot 3 : `DORMEUR_EVENEMENT` n'existe pas
   * encore (lot 4, `SLEEP`). Le cas se rejoue donc avec deux séjours confirmés
   * qui réclament le même occupant le même jour — exactement le mécanisme que
   * `SLEEP` réutilisera sans y toucher.
   */
  it('ne compte Marc qu’une fois le 11, bien que deux séjours le réclament', () => {
    const sejours = [
      sejour({ id: 'A', adultes: 4, occupantId: 'marc' }),
      sejour({
        id: 'B',
        adultes: 1,
        arrivee: jour('2026-09-11'),
        depart: jour('2026-09-13'),
        occupantId: 'marc',
      }),
    ]

    expect(personnesLe('2026-09-11', sejours)).toBe(4)
  })
})

describe('OCCUP-019 — un contributeur dormant ne change pas le total', () => {
  it('ignore six dormeurs d’événement tant que le contributeur est inactif', () => {
    const presences: Presence[] = [
      ...presencesDesSejours([sejour()]),
      {
        contributeur: 'DORMEUR_EVENEMENT',
        reference: 'rsvp-1',
        arrivee: jour('2026-09-10'),
        depart: jour('2026-09-12'),
        personnes: 6,
      },
    ]

    const { total } = occupationSur(presences, {
      debut: jour('2026-09-10'),
      fin: jour('2026-09-12'),
    })

    expect(total).toBe(4)
  })
})

describe('OCCUP-020 — détail par source', () => {
  it('attribue les 4 personnes à SEJOUR_CONFIRME, les autres sources à zéro', () => {
    const { parSource } = occupationSur(presencesDesSejours([sejour()]), {
      debut: jour('2026-09-10'),
      fin: jour('2026-09-12'),
    })

    expect(parSource).toEqual({
      SEJOUR_CONFIRME: 4,
      DORMEUR_EVENEMENT: 0,
      AFFECTATION_CHAMBRE: 0,
    })
  })
})

describe('OCCUP-021 — occupation maximale sur une période', () => {
  it('désigne le jour et l’effectif du pic parmi des séjours qui varient du 10 au 20', () => {
    const sejours = [
      sejour({ id: 'A', adultes: 4, arrivee: jour('2026-09-10'), depart: jour('2026-09-15') }),
      sejour({ id: 'B', adultes: 5, arrivee: jour('2026-09-14'), depart: jour('2026-09-18') }),
      sejour({ id: 'C', adultes: 2, arrivee: jour('2026-09-18'), depart: jour('2026-09-20') }),
    ]

    const pic = occupationMaximale(presencesDesSejours(sejours))

    expect(pic).not.toBeNull()
    expect(pic?.personnes).toBe(9)
    expect(versTexteJour(pic?.jour as Date)).toBe('2026-09-14')
  })
})

describe('OCCUP-022 — grand volume', () => {
  it('répond en moins de 100 ms avec 200 séjours répartis sur deux ans', () => {
    const sejours = Array.from({ length: 200 }, (_, i) => {
      const arrivee = new Date(Date.UTC(2025, 0, 1) + i * 3 * 86_400_000)
      const depart = new Date(arrivee.getTime() + 2 * 86_400_000)
      return sejour({ id: `sejour-${i}`, arrivee, depart, adultes: 1 + (i % 6) })
    })

    const debutChrono = performance.now()
    occupationSur(presencesDesSejours(sejours), {
      debut: jour('2026-06-01'),
      fin: jour('2026-07-01'),
    })
    const duree = performance.now() - debutChrono

    expect(duree).toBeLessThan(100)
  })
})

describe('OCCUP-023 — exclusion du séjour en cours de modification', () => {
  it('ignore le séjour dont on exclut la référence, sans toucher aux autres', () => {
    const sejours = [sejour({ id: 'A', adultes: 4 }), sejour({ id: 'B', adultes: 3 })]

    const { total } = occupationSur(
      presencesDesSejours(sejours),
      { debut: jour('2026-09-10'), fin: jour('2026-09-12') },
      { exclureReference: 'A' },
    )

    expect(total).toBe(3)
  })
})

describe('OCCUP-024 — sentinelle : aucune source oubliée', () => {
  it('le total vaut la somme de tous les contributeurs actifs du registre, quel que soit leur nombre', () => {
    const presences: Presence[] = REGISTRE.map((contributeur, index) => ({
      contributeur: contributeur.nom,
      reference: `sentinelle-${index}`,
      arrivee: jour('2026-09-10'),
      depart: jour('2026-09-12'),
      personnes: 1,
    }))

    const { total, parSource } = occupationSur(presences, {
      debut: jour('2026-09-10'),
      fin: jour('2026-09-12'),
    })

    const actifs = contributeursActifs()
    expect(total).toBe(actifs.length)
    for (const nom of actifs) {
      expect(parSource[nom]).toBe(1)
    }
  })
})

describe('OCCUP-025 — cohérence après annulation', () => {
  it('retombe à zéro quand un séjour confirmé de 4 personnes est annulé', () => {
    const avant = sejour({ adultes: 4, statut: 'CONFIRMED' })
    const apres = sejour({ adultes: 4, statut: 'CANCELLED' })

    expect(personnesLe('2026-09-10', [avant])).toBe(4)
    expect(personnesLe('2026-09-10', [apres])).toBe(0)
  })
})

describe('OCCUP-026 — cohérence après modification de l’effectif', () => {
  it('reflète les 6 personnes d’un séjour passé de 4 à 6', () => {
    const avant = sejour({ adultes: 4 })
    const apres = sejour({ adultes: 6 })

    expect(personnesLe('2026-09-10', [avant])).toBe(4)
    expect(personnesLe('2026-09-10', [apres])).toBe(6)
  })
})
