import Link from 'next/link'

import { Bouton } from '@/components/ui/bouton'
import { CATALOGUE_MESSAGES } from '@/domain/core/messages'

export default function PageIntrouvable() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-6">
      <h1 className="font-titre text-3xl">Rien par ici</h1>
      <p className="text-encre-doux">{CATALOGUE_MESSAGES.NOT_FOUND}</p>
      <Bouton asChild>
        <Link href="/">Revenir à l’accueil</Link>
      </Bouton>
    </main>
  )
}
