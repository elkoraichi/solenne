import { BedDouble } from 'lucide-react'
import type { Metadata } from 'next'

import { PageAVenir } from '@/components/ui/page-a-venir'
import { requireUser } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Séjours' }

export default async function PageSejours() {
  await requireUser('sejours')
  return (
    <PageAVenir
      titre="Séjours"
      texte="Vos demandes et vos séjours à venir s’afficheront ici, avec la disponibilité en direct."
      icone={BedDouble}
      lot="lot 3"
    />
  )
}
