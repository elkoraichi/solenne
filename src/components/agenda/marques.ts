import {
  CalendarOff,
  DoorClosed,
  Hourglass,
  House,
  PartyPopper,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  MARQUE_CATEGORIE,
  type CategorieAgenda,
} from '@/domain/calendar/grille'

/**
 * CAL-R4 — la traduction du symbole nommé par le domaine en icône dessinée.
 *
 * Le domaine dit « sablier », l'interface choisit `Hourglass`. C'est la seule
 * raison d'être de ce fichier : garder `lucide-react` hors du domaine, et
 * garder le choix des icônes hors des règles.
 */
const ICONES: Readonly<Record<string, LucideIcon>> = {
  'calendrier-barre': CalendarOff,
  'porte-fermee': DoorClosed,
  personnes: Users,
  maison: House,
  sablier: Hourglass,
  fete: PartyPopper,
}

/** Le fond d'une bande. Le mot reste lisible sans la couleur (CAL-015). */
const BANDES: Readonly<Record<CategorieAgenda, string>> = {
  INDISPONIBLE: 'bg-bois text-white',
  OCCUPEE: 'border border-bois bg-lin text-bois',
  SEJOUR: 'bg-olive text-white',
  SEJOUR_SOLENNE: 'bg-olive-fonce text-white',
  MA_DEMANDE: 'border border-terracotta bg-lin text-terracotta',
  EVENEMENT: 'bg-terracotta text-white',
}

export function iconeDe(categorie: CategorieAgenda): LucideIcon {
  return ICONES[MARQUE_CATEGORIE[categorie].symbole] ?? DoorClosed
}

export function bandeDe(categorie: CategorieAgenda): string {
  return BANDES[categorie]
}

export function libelleDe(categorie: CategorieAgenda): string {
  return MARQUE_CATEGORIE[categorie].libelle
}
