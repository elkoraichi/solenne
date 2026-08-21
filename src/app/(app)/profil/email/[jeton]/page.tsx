import type { Metadata } from 'next'
import Link from 'next/link'

import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { confirmerChangementEmail } from '@/server/actions/profil'

export const metadata: Metadata = { title: 'Confirmation d’adresse' }

export default async function PageConfirmationEmail({
  params,
}: {
  params: Promise<{ jeton: string }>
}) {
  const { jeton } = await params
  const resultat = await confirmerChangementEmail({ jeton })

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-titre text-2xl">
        {resultat.ok ? 'Adresse confirmée' : 'Ce lien n’a pas fonctionné'}
      </h2>

      {resultat.ok ? (
        <p className="text-encre-doux">
          Votre nouvelle adresse est maintenant celle du compte.
        </p>
      ) : (
        <BandeauErreur message={resultat.message} />
      )}

      <Bouton asChild>
        <Link href="/profil">Revenir au profil</Link>
      </Bouton>
    </div>
  )
}
