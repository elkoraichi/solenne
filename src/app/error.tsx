'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { CATALOGUE_MESSAGES } from '@/domain/core/messages'

/**
 * CORE-R1 / CORE-002 : la personne voit un message français et une issue.
 * Le détail technique reste dans les journaux du serveur — il n'est ni affiché,
 * ni transmis au navigateur.
 */
export default function ErreurGlobale({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // `digest` est l'identifiant opaque produit par Next : il permet de retrouver
    // la trace côté serveur sans rien révéler ici.
    console.error(
      JSON.stringify({
        niveau: 'error',
        horodatage: new Date().toISOString(),
        message: 'Erreur rendue à l’écran',
        detail: { digest: error.digest ?? null },
      }),
    )
  }, [error])

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-6">
      <h1 className="font-titre text-3xl">Quelque chose s’est mal passé</h1>
      <BandeauErreur message={CATALOGUE_MESSAGES.INTERNAL} />
      <div className="flex gap-2">
        <Bouton onClick={reset}>Réessayer</Bouton>
        <Bouton variante="secondaire" asChild>
          <Link href="/">Revenir à l’accueil</Link>
        </Bouton>
      </div>
    </main>
  )
}
