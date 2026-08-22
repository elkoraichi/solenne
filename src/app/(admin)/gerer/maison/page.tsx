import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BlocagesMaison } from '@/components/formulaires/blocages-maison'
import { ConfidentialiteMaison } from '@/components/formulaires/confidentialite-maison'
import { EspacesMaison } from '@/components/formulaires/espaces-maison'
import { FormulaireMaison } from '@/components/formulaires/formulaire-maison'
import { ReglagesReservationMaison } from '@/components/formulaires/reglages-reservation-maison'
import { ReglesMaison } from '@/components/formulaires/regles-maison'
import { versTexteJour } from '@/domain/core/dates'
import { blocages } from '@/server/actions/blocages'
import {
  reglagesConfidentialite,
  sejoursDetailles,
} from '@/server/actions/confidentialite'
import { espacesDeLaMaison } from '@/server/actions/espaces'
import { maison } from '@/server/actions/maison'
import { reglagesReservation } from '@/server/actions/reglages-reservation'
import { reglesDeLaMaison } from '@/server/actions/regles'
import { requireAdminPage } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Gérer la maison' }

export default async function PageGererMaison() {
  await requireAdminPage('gerer.maison')

  const aujourdhui = versTexteJour(new Date())

  const [informations, espaces, regles, periodes, reglages, sejours, reglagesReservationEtat] =
    await Promise.all([
      maison(),
      espacesDeLaMaison(),
      reglesDeLaMaison(),
      blocages(),
      reglagesConfidentialite(),
      sejoursDetailles({ du: aujourdhui }),
      reglagesReservation(),
    ])
  if (
    !informations.ok ||
    !espaces.ok ||
    !regles.ok ||
    !periodes.ok ||
    !reglages.ok ||
    !sejours.ok ||
    !reglagesReservationEtat.ok
  ) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-10">
      <FormulaireMaison maison={informations.data} />
      <EspacesMaison
        espaces={espaces.data}
        capaciteMax={informations.data.capaciteMax}
      />
      <ReglesMaison regles={regles.data} />
      <BlocagesMaison blocages={periodes.data} />
      <ReglagesReservationMaison reglages={reglagesReservationEtat.data} />
      <ConfidentialiteMaison
        defaut={reglages.data.defaut}
        defautSolenne={reglages.data.defautSolenne}
        sejours={sejours.data}
      />
    </div>
  )
}
