import { CalendarDays } from 'lucide-react'
import type { Metadata } from 'next'

import { PageAVenir } from '@/components/ui/page-a-venir'
import { requireUser } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Agenda' }

export default async function PageAgenda() {
  await requireUser('agenda')
  return (
    <PageAVenir
      titre="Agenda"
      texte="Les mois, les semaines et les grandes cartes photo des événements s’afficheront ici."
      icone={CalendarDays}
      lot="lot 2"
    />
  )
}
