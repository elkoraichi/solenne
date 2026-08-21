import type { Metadata } from 'next'

import { FormulaireNouveauMotDePasse } from '@/components/formulaires/formulaire-nouveau-mot-de-passe'

export const metadata: Metadata = { title: 'Nouveau mot de passe' }

export default async function PageNouveauMotDePasse({
  params,
}: {
  params: Promise<{ jeton: string }>
}) {
  const { jeton } = await params
  // Le jeton n'est pas vérifié ici : il l'est au moment de l'envoi, une seule
  // fois, côté serveur. Afficher un verdict avant même la saisie renseignerait
  // gratuitement qui essaie des liens au hasard.
  return <FormulaireNouveauMotDePasse jeton={jeton} />
}
