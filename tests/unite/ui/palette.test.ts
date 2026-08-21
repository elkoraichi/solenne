import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  contraste,
  luminanceRelative,
  PAIRES_TEXTE,
  PALETTE,
  SEUILS_AA,
} from '@/components/ui/tokens'

describe('UI-001 — contrastes WCAG AA', () => {
  it('vérifie chaque paire texte/fond réellement utilisée', () => {
    const echecs = PAIRES_TEXTE.filter((paire) => {
      const rapport = contraste(PALETTE[paire.texte], PALETTE[paire.fond])
      return rapport < SEUILS_AA[paire.usage]
    }).map((paire) => {
      const rapport = contraste(PALETTE[paire.texte], PALETTE[paire.fond])
      return `${paire.texte} sur ${paire.fond} (${paire.ou}) : ${rapport.toFixed(2)} < ${SEUILS_AA[paire.usage]}`
    })

    expect(echecs).toEqual([])
  })

  it('déclare au moins une paire pour chaque couleur de texte de la palette', () => {
    const couleursDeTexte = new Set(PAIRES_TEXTE.map((paire) => paire.texte))
    expect(couleursDeTexte.size).toBeGreaterThanOrEqual(5)
  })

  it('calcule correctement des contrastes de référence', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(luminanceRelative('#FFFFFF')).toBeCloseTo(1, 5)
    expect(luminanceRelative('#000000')).toBeCloseTo(0, 5)
  })

  it('refuse une couleur mal formée', () => {
    expect(() => luminanceRelative('bleu')).toThrow(RangeError)
    expect(() => luminanceRelative('#FFF')).toThrow(RangeError)
  })
})

describe('UI-001 — la feuille de style et les jetons ne divergent pas', () => {
  const css = readFileSync(
    join(process.cwd(), 'src/app/globals.css'),
    'utf8',
  ).toLowerCase()

  const correspondances: Readonly<Record<keyof typeof PALETTE, string>> = {
    lin: '--color-lin',
    linFonce: '--color-lin-fonce',
    linProfond: '--color-lin-profond',
    encre: '--color-encre',
    encreDoux: '--color-encre-doux',
    olive: '--color-olive',
    oliveFonce: '--color-olive-fonce',
    terracotta: '--color-terracotta',
    terracottaFonce: '--color-terracotta-fonce',
    bois: '--color-bois',
    boisClair: '--color-bois-clair',
    blanc: '',
  }

  it('déclare dans le CSS exactement les valeurs des jetons', () => {
    for (const [nom, variable] of Object.entries(correspondances)) {
      if (!variable) continue
      const attendu = PALETTE[nom as keyof typeof PALETTE].toLowerCase()
      // On cible la déclaration exacte : `--color-lin: #faf6ef;`
      const motif = new RegExp(`${variable}:\\s*${attendu};`)
      expect(css, `${variable} doit valoir ${attendu}`).toMatch(motif)
    }
  })
})
