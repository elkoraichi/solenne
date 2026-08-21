import type { Metadata } from 'next'

import { FormulaireConnexion } from '@/components/formulaires/formulaire-connexion'

export const metadata: Metadata = { title: 'Connexion' }

export default function PageConnexion() {
  return <FormulaireConnexion />
}
