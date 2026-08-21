import { redirect } from 'next/navigation'

import { CoquilleApp } from '@/components/layout/coquille-app'
import { utilisateurEventuel } from '@/server/auth/garde'

/**
 * Écrans du cercle.
 *
 * La redirection ici est un **confort de navigation**, pas une protection : ce
 * sont les gardes des Server Actions qui refusent les données (PERM-R1).
 */
export default async function CoquilleCercle({
  children,
}: {
  children: React.ReactNode
}) {
  const utilisateur = await utilisateurEventuel()
  if (!utilisateur) redirect('/connexion')

  return (
    <CoquilleApp
      titre="La maison"
      estAdministratrice={utilisateur.role === 'ADMIN'}
    >
      {children}
    </CoquilleApp>
  )
}
