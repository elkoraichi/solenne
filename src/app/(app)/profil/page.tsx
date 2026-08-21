import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { FormulaireProfil } from '@/components/formulaires/formulaire-profil'
import { monProfil } from '@/server/actions/profil'

export const metadata: Metadata = { title: 'Profil' }

export default async function PageProfil() {
  const profil = await monProfil()
  if (!profil.ok) redirect('/connexion')

  return <FormulaireProfil profil={profil.data} />
}
