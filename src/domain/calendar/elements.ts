import type { ElementAgenda } from '@/domain/calendar/grille'
import type { Periode } from '@/domain/house/blocages'
import {
  MENTION_OCCUPEE,
  type SejourDetaille,
  type SejourVisible,
} from '@/domain/privacy/visibilite'

/**
 * `CAL` — ce qui entre dans l'agenda.
 *
 * Deux entrées, exactement comme `PRIV` en a deux lectures, et pour la même
 * raison : **la confidentialité ne se filtre pas, elle se sépare**.
 * `elementsDuCercle` ne sait rien lire d'autre que la vue du cercle, et le
 * compilateur le garantit — un `SejourNomme` n'a pas de champ `commentaire`.
 *
 * Ces fonctions ne décident jamais de ce qui est visible : elles mettent en
 * forme ce que `PRIV` a déjà tranché (CAL-R1).
 */

export interface DemandeEnAttente {
  readonly id: string
  readonly du: Date
  readonly au: Date
  readonly personnes: number
}

export function libellePersonnes(nombre: number): string {
  return `${nombre} personne${nombre > 1 ? 's' : ''}`
}

/** L'agenda d'un ami — bandes anonymes, séjours nommés, ses propres demandes. */
export function elementsDuCercle(donnees: {
  readonly indisponibilites: readonly Periode[]
  readonly occupations: readonly Periode[]
  readonly sejours: readonly SejourVisible[]
  readonly mesDemandes: readonly DemandeEnAttente[]
}): readonly ElementAgenda[] {
  const elements: ElementAgenda[] = []

  donnees.indisponibilites.forEach((periode, index) => {
    elements.push({
      cle: `indisponible-${index}`,
      categorie: 'INDISPONIBLE',
      titre: 'Maison fermée',
      du: periode.du,
      au: periode.au,
    })
  })

  donnees.occupations.forEach((periode, index) => {
    elements.push({
      cle: `occupee-${index}`,
      categorie: 'OCCUPEE',
      // Rien de plus : ni qui, ni combien. C'est tout ce qui est arrivé jusqu'ici.
      titre: MENTION_OCCUPEE,
      du: periode.du,
      au: periode.au,
    })
  })

  donnees.sejours.forEach((sejour, index) => {
    if (sejour.nature === 'NOMME') {
      elements.push({
        cle: `sejour-${index}`,
        categorie: 'SEJOUR',
        titre: sejour.qui,
        du: sejour.du,
        au: sejour.au,
        precision: libellePersonnes(sejour.personnes),
      })
      return
    }

    elements.push({
      cle: `mien-${sejour.id}`,
      categorie: 'SEJOUR',
      titre: 'Votre séjour',
      du: sejour.du,
      au: sejour.au,
      precision: libellePersonnes(sejour.personnes),
    })
  })

  donnees.mesDemandes.forEach((demande) => {
    elements.push({
      cle: `demande-${demande.id}`,
      categorie: 'MA_DEMANDE',
      titre: 'Votre demande',
      du: demande.du,
      au: demande.au,
      precision: libellePersonnes(demande.personnes),
    })
  })

  return elements
}

/**
 * L'agenda de Solenne — tout, séjours cachés compris (PRIV-R3).
 *
 * Le mot « invisible pour le cercle » n'est pas un détail d'affichage : sans
 * lui, elle ne saurait pas qu'un séjour qu'elle voit n'apparaît chez personne
 * d'autre, et prendrait un agenda plein pour un agenda partagé.
 */
export function elementsDeLaConsole(donnees: {
  readonly indisponibilites: readonly Periode[]
  readonly sejours: readonly SejourDetaille[]
}): readonly ElementAgenda[] {
  const elements: ElementAgenda[] = []

  donnees.indisponibilites.forEach((periode, index) => {
    elements.push({
      cle: `indisponible-${index}`,
      categorie: 'INDISPONIBLE',
      titre: 'Maison fermée',
      du: periode.du,
      au: periode.au,
    })
  })

  donnees.sejours.forEach((sejour) => {
    const mentions = [libellePersonnes(sejour.personnes)]
    if (sejour.niveau === 'HIDDEN') mentions.push('invisible pour le cercle')

    elements.push({
      cle: `sejour-${sejour.id}`,
      categorie: sejour.estSejourDeSolenne ? 'SEJOUR_SOLENNE' : 'SEJOUR',
      titre: sejour.qui,
      du: sejour.du,
      au: sejour.au,
      precision: mentions.join(' · '),
      // La fiche d'un séjour arrive au module `STAY` (lot 3.6).
      lien: null,
    })
  })

  return elements
}
