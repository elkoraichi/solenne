import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'

import './globals.css'

const policeTitre = Fraunces({
  subsets: ['latin'],
  variable: '--police-titre',
  display: 'swap',
  axes: ['SOFT', 'WONK'],
})

const policeCorps = Inter({
  subsets: ['latin'],
  variable: '--police-corps',
  display: 'swap',
})

export const metadata: Metadata = {
  // Le nom affiché de la maison est une donnée, pas un texte en dur : ce titre
  // est un repli, remplacé écran par écran (module HOUSE, lot 2).
  title: 'La maison',
  description: 'Le carnet de la maison de campagne.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#faf6ef',
}

export default function RacineLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${policeTitre.variable} ${policeCorps.variable}`}>
      <body className="font-corps antialiased">{children}</body>
    </html>
  )
}
