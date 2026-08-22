import { Trees } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ConsoleGestion } from '@/components/formulaires/console-gestion'
import { Bouton } from '@/components/ui/bouton'
import { listerInvitations } from '@/server/actions/invitations'
import { listerUtilisateurs } from '@/server/actions/utilisateurs'
import { requireAdminPage } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Gérer' }

export default async function PageGerer() {
  const solenne = await requireAdminPage('gerer')

  const [utilisateurs, invitations] = await Promise.all([
    listerUtilisateurs(),
    listerInvitations(),
  ])
  if (!utilisateurs.ok || !invitations.ok) notFound()

  return (
    <div className="flex flex-col gap-8">
      <Bouton asChild variante="secondaire" pleineLargeur>
        <Link href="/gerer/maison">
          <Trees aria-hidden="true" />
          Informations et photos de la maison
        </Link>
      </Bouton>

      <ConsoleGestion
        utilisateurs={utilisateurs.data}
        invitations={invitations.data}
        moi={solenne.id}
      />
    </div>
  )
}
