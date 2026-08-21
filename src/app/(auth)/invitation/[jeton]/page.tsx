import type { Metadata } from 'next'
import Link from 'next/link'

import { FormulaireActivation } from '@/components/formulaires/formulaire-activation'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { consulterInvitation } from '@/server/actions/invitations'

export const metadata: Metadata = { title: 'Votre invitation' }

export default async function PageInvitation({
  params,
}: {
  params: Promise<{ jeton: string }>
}) {
  const { jeton } = await params
  const invitation = await consulterInvitation({ jeton })

  if (!invitation.ok) {
    return (
      <section className="flex flex-col gap-5">
        <h1 className="font-titre text-3xl leading-tight">
          Cette invitation n’est plus valable
        </h1>
        <BandeauErreur message={invitation.message} />
        <p className="text-encre-doux">
          Demandez à Solenne de vous en envoyer une nouvelle : cela prend dix
          secondes de son côté.
        </p>
        <Bouton variante="secondaire" asChild>
          <Link href="/connexion">J’ai déjà un compte</Link>
        </Bouton>
      </section>
    )
  }

  return <FormulaireActivation jeton={jeton} email={invitation.data.email} />
}
