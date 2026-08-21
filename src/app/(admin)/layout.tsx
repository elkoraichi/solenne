import { notFound, redirect } from 'next/navigation'

import { CoquilleApp } from '@/components/layout/coquille-app'
import { utilisateurEventuel } from '@/server/auth/garde'
import { db } from '@/server/db'

/**
 * Console d'administration.
 *
 * PERM-S08 : une URL devinée ne suffit pas. Un ami qui tape `/gerer` reçoit une
 * page introuvable — pas un « accès refusé » qui confirmerait que la page
 * existe. Et de toute façon, chaque action refuse de son côté.
 */
export default async function CoquilleAdministration({
  children,
}: {
  children: React.ReactNode
}) {
  const utilisateur = await utilisateurEventuel()
  if (!utilisateur) redirect('/connexion')
  if (utilisateur.role !== 'ADMIN') notFound()

  const demandesEnAttente = await db.stayRequest.count({
    where: { status: 'PENDING' },
  })

  return (
    <CoquilleApp
      titre="La maison"
      estAdministratrice
      demandesEnAttente={demandesEnAttente}
    >
      {children}
    </CoquilleApp>
  )
}
