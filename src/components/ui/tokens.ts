/**
 * Jetons de couleur du carnet de la maison — lin, olive, terracotta, bois, encre.
 *
 * Ce fichier est la **source de vérité** : les mêmes valeurs sont déclarées
 * dans `globals.css` (via `@theme`) et vérifiées par le test UI-001, qui
 * contrôle le contraste de chaque paire réellement utilisée.
 */

export const PALETTE = {
  // Fonds — le lin, du plus clair au plus profond
  lin: '#FAF6EF',
  linFonce: '#F2EBE0',
  linProfond: '#E7DDCC',

  // Textes
  encre: '#2A2622',
  encreDoux: '#5C544B',

  // Actions et accents
  olive: '#5A6B4A',
  oliveFonce: '#46543A',
  terracotta: '#B5522F',
  terracottaFonce: '#8F3F23',
  bois: '#7E6444',
  boisClair: '#B99B72',

  blanc: '#FFFFFF',
} as const

export type NomCouleur = keyof typeof PALETTE

/** Usage d'une paire : le seuil WCAG AA dépend de la taille du texte. */
export type UsageTexte = 'courant' | 'grand'

export const SEUILS_AA: Readonly<Record<UsageTexte, number>> = {
  courant: 4.5,
  grand: 3,
}

export interface PaireTexte {
  readonly texte: NomCouleur
  readonly fond: NomCouleur
  readonly usage: UsageTexte
  readonly ou: string
}

/**
 * Toutes les combinaisons texte/fond effectivement employées dans l'interface.
 * Ajouter une combinaison ici est obligatoire avant de l'utiliser : le test
 * UI-001 ne peut vérifier que ce qui est déclaré.
 */
export const PAIRES_TEXTE: readonly PaireTexte[] = [
  { texte: 'encre', fond: 'lin', usage: 'courant', ou: 'corps de page' },
  { texte: 'encre', fond: 'linFonce', usage: 'courant', ou: 'carte' },
  { texte: 'encre', fond: 'linProfond', usage: 'courant', ou: 'squelette, séparateur' },
  { texte: 'encre', fond: 'blanc', usage: 'courant', ou: 'feuille modale' },
  { texte: 'encreDoux', fond: 'lin', usage: 'courant', ou: 'texte secondaire' },
  { texte: 'encreDoux', fond: 'linFonce', usage: 'courant', ou: 'texte secondaire sur carte' },
  { texte: 'encreDoux', fond: 'linProfond', usage: 'courant', ou: 'légende' },
  { texte: 'encreDoux', fond: 'blanc', usage: 'courant', ou: 'texte secondaire en feuille' },
  { texte: 'blanc', fond: 'olive', usage: 'courant', ou: 'bouton principal' },
  { texte: 'blanc', fond: 'oliveFonce', usage: 'courant', ou: 'bouton principal survolé' },
  { texte: 'blanc', fond: 'terracotta', usage: 'courant', ou: 'bouton destructeur' },
  { texte: 'blanc', fond: 'terracottaFonce', usage: 'courant', ou: 'bouton destructeur survolé' },
  { texte: 'blanc', fond: 'bois', usage: 'courant', ou: 'badge bois' },
  { texte: 'oliveFonce', fond: 'lin', usage: 'courant', ou: 'lien, onglet actif' },
  { texte: 'oliveFonce', fond: 'linFonce', usage: 'courant', ou: 'lien sur carte' },
  { texte: 'terracottaFonce', fond: 'lin', usage: 'courant', ou: 'message d’erreur' },
  { texte: 'terracottaFonce', fond: 'linFonce', usage: 'courant', ou: 'bandeau d’erreur' },
  { texte: 'bois', fond: 'lin', usage: 'courant', ou: 'métadonnée' },
  { texte: 'encre', fond: 'boisClair', usage: 'grand', ou: 'pastille d’avatar' },
] as const

// ---------------------------------------------------------------------------
// Contraste WCAG 2.1
// ---------------------------------------------------------------------------

function canalLineaire(composante: number): number {
  const c = composante / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminanceRelative(hex: string): number {
  const brut = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(brut)) {
    throw new RangeError(`Couleur invalide : « ${hex} » (attendu #RRGGBB)`)
  }
  const r = canalLineaire(Number.parseInt(brut.slice(0, 2), 16))
  const v = canalLineaire(Number.parseInt(brut.slice(2, 4), 16))
  const b = canalLineaire(Number.parseInt(brut.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * v + 0.0722 * b
}

/** Rapport de contraste entre deux couleurs, de 1 (identiques) à 21. */
export function contraste(premiere: string, seconde: string): number {
  const a = luminanceRelative(premiere)
  const b = luminanceRelative(seconde)
  const [claire, sombre] = a > b ? [a, b] : [b, a]
  return (claire + 0.05) / (sombre + 0.05)
}

export function respecteAA(paire: PaireTexte): boolean {
  return (
    contraste(PALETTE[paire.texte], PALETTE[paire.fond]) >=
    SEUILS_AA[paire.usage]
  )
}

/** Cible tactile minimale, en pixels (UI-R2). */
export const CIBLE_TACTILE_MIN_PX = 44
