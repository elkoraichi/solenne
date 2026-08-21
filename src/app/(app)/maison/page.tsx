import { Trees } from 'lucide-react'
import type { Metadata } from 'next'

import { PageAVenir } from '@/components/ui/page-a-venir'
import { requireUser } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'La maison' }

export default async function PageMaison() {
  await requireUser('maison')
  return (
    <PageAVenir
      titre="La maison"
      texte="Les photos, les chambres, les bureaux et les règles de la maison s’afficheront ici."
      icone={Trees}
      lot="lot 2"
    />
  )
}
