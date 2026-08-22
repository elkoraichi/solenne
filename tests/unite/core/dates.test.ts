import { describe, expect, it } from 'vitest'

import {
  ajouterJours,
  chevauchent,
  debutDeJour,
  formaterHeure,
  formaterInstant,
  formaterJourCourt,
  formaterJourLong,
  formaterPeriode,
  instantDepuisHeureParis,
  jour,
  jourDeSemaine,
  jourParisienDe,
  joursOccupes,
  nombreDeNuits,
  versTexteJour,
} from '@/domain/core/dates'

describe('CORE-010 — fuseau horaire', () => {
  it('affiche en heure de Paris un instant stocké en UTC (heure d’été)', () => {
    const instant = new Date('2026-07-14T20:00:00.000Z') // UTC+2 à Paris
    expect(formaterHeure(instant)).toBe('22:00')
    expect(formaterInstant(instant)).toBe('14 juillet 2026 à 22:00')
  })

  it('affiche en heure de Paris un instant stocké en UTC (heure d’hiver)', () => {
    const instant = new Date('2026-01-14T20:00:00.000Z') // UTC+1 à Paris
    expect(formaterHeure(instant)).toBe('21:00')
  })

  it('rattache un instant au bon jour parisien, même après minuit UTC', () => {
    // 14 juillet 23 h 30 à Paris = 15 juillet 21 h 30 UTC ? Non : 21 h 30 UTC le 14.
    const instant = new Date('2026-07-14T22:30:00.000Z') // 15 juillet 00 h 30 à Paris
    expect(versTexteJour(jourParisienDe(instant))).toBe('2026-07-15')
  })

  it('ne décale pas un jour nu à l’affichage', () => {
    expect(formaterJourLong(jour('2026-10-25'))).toBe('dimanche 25 octobre 2026')
    expect(formaterJourLong(jour('2026-01-01'))).toBe('jeudi 1er janvier 2026')
  })

  it('dit « 1er » du premier jour du mois, et de lui seul', () => {
    expect(formaterJourLong(jour('2026-09-01'))).toBe('mardi 1er septembre 2026')
    expect(formaterJourCourt(jour('2026-09-01'))).toBe('1er sept.')
    // Un millésime ou un onze qui commence par 1 n'y a pas droit.
    expect(formaterJourLong(jour('2026-09-11'))).toBe('vendredi 11 septembre 2026')
    expect(formaterJourLong(jour('2026-09-21'))).toBe('lundi 21 septembre 2026')
  })

  it('construit un instant à partir d’une heure lue sur une horloge parisienne', () => {
    // 25 octobre 2026 : nuit du changement d'heure, Paris passe de UTC+2 à UTC+1.
    expect(
      instantDepuisHeureParis(jour('2026-07-14'), 20, 0).toISOString(),
    ).toBe('2026-07-14T18:00:00.000Z')
    expect(
      instantDepuisHeureParis(jour('2026-01-14'), 20, 0).toISOString(),
    ).toBe('2026-01-14T19:00:00.000Z')
    expect(
      instantDepuisHeureParis(jour('2026-10-25'), 20, 0).toISOString(),
    ).toBe('2026-10-25T19:00:00.000Z')
  })
})

describe('CORE-011 — changement d’heure', () => {
  it('compte 2 nuits pour un séjour du 25 au 27 octobre 2026', () => {
    expect(nombreDeNuits(jour('2026-10-25'), jour('2026-10-27'))).toBe(2)
  })

  it('compte 1 nuit sur la nuit même du passage à l’heure d’hiver', () => {
    expect(nombreDeNuits(jour('2026-10-24'), jour('2026-10-25'))).toBe(1)
  })

  it('compte 1 nuit sur la nuit du passage à l’heure d’été', () => {
    // Dernier dimanche de mars 2026 : le 29.
    expect(nombreDeNuits(jour('2026-03-28'), jour('2026-03-29'))).toBe(1)
  })

  it('énumère les bons jours occupés autour du changement d’heure', () => {
    const jours = joursOccupes(jour('2026-10-25'), jour('2026-10-27'))
    expect(jours.map(versTexteJour)).toEqual(['2026-10-25', '2026-10-26'])
  })
})

describe('CORE-R6 — convention [arrivée, départ[', () => {
  it('n’occupe pas le jour du départ', () => {
    const jours = joursOccupes(jour('2026-05-01'), jour('2026-05-04'))
    expect(jours.map(versTexteJour)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ])
  })

  it('ne voit aucun chevauchement entre un départ le 20 et une arrivée le 20', () => {
    expect(
      chevauchent(
        jour('2026-05-15'),
        jour('2026-05-20'),
        jour('2026-05-20'),
        jour('2026-05-25'),
      ),
    ).toBe(false)
  })

  it('détecte un chevauchement d’une seule nuit', () => {
    expect(
      chevauchent(
        jour('2026-05-15'),
        jour('2026-05-21'),
        jour('2026-05-20'),
        jour('2026-05-25'),
      ),
    ).toBe(true)
  })

  it('détecte l’inclusion complète, dans les deux sens', () => {
    const a = [jour('2026-05-01'), jour('2026-05-31')] as const
    const b = [jour('2026-05-10'), jour('2026-05-12')] as const
    expect(chevauchent(a[0], a[1], b[0], b[1])).toBe(true)
    expect(chevauchent(b[0], b[1], a[0], a[1])).toBe(true)
  })

  it('compte zéro nuit pour un intervalle vide', () => {
    expect(nombreDeNuits(jour('2026-05-01'), jour('2026-05-01'))).toBe(0)
    expect(joursOccupes(jour('2026-05-01'), jour('2026-05-01'))).toEqual([])
  })
})

describe('Utilitaires de jours', () => {
  it('refuse un format de date inattendu', () => {
    expect(() => jour('25/10/2026')).toThrow(RangeError)
    expect(() => jour('2026-13-01')).toThrow(RangeError)
    expect(() => jour('2026-02-30')).toThrow(RangeError)
    expect(() => jour('')).toThrow(RangeError)
  })

  it('ramène un instant au jour UTC qui le contient', () => {
    expect(versTexteJour(debutDeJour(new Date('2026-05-04T23:59:59.999Z')))).toBe(
      '2026-05-04',
    )
  })

  it('ajoute des jours sans dériver au changement d’heure', () => {
    expect(versTexteJour(ajouterJours(jour('2026-10-24'), 3))).toBe('2026-10-27')
    expect(versTexteJour(ajouterJours(jour('2026-03-27'), 3))).toBe('2026-03-30')
  })

  it('numérote les jours de la semaine au sens ISO', () => {
    expect(jourDeSemaine(jour('2026-10-26'))).toBe(1) // lundi
    expect(jourDeSemaine(jour('2026-10-25'))).toBe(7) // dimanche
  })

  it('formate une période lisible', () => {
    expect(formaterPeriode(jour('2026-10-25'), jour('2026-10-27'))).toBe(
      'du 25 au 27 octobre 2026',
    )
    expect(formaterPeriode(jour('2026-10-30'), jour('2026-11-02'))).toBe(
      'du 30 octobre 2026 au 2 novembre 2026',
    )
    // Le cas qui se lisait mal sur l'agenda : « au 1 septembre ».
    expect(formaterPeriode(jour('2026-08-29'), jour('2026-09-01'))).toBe(
      'du 29 août 2026 au 1er septembre 2026',
    )
    expect(formaterPeriode(jour('2026-09-01'), jour('2026-09-04'))).toBe(
      'du 1er au 4 septembre 2026',
    )
  })
})
