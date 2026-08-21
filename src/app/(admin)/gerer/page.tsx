import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ConsoleGestion } from '@/components/formulaires/console-gestion'
import { listerInvitations } from '@/server/actions/invitations'
import { listerUtilisateurs } from '@/server/actions/utilisateurs'
import { requireRole } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Gérer' }

export default async function PageGerer() {
  const solenne = await requireRole('ADMIN', 'gerer')

  const [utilisateurs, invitations] = await Promise.all([
    listerUtilisateurs(),
    listerInvitations(),
  ])
  if (!utilisateurs.ok || !invitations.ok) notFound()

  return (
    <ConsoleGestion
      utilisateurs={utilisateurs.data}
      invitations={invitations.data}
      moi={solenne.id}
    />
  )
}
