import type { Metadata } from 'next'

import { AssistantDemandeSejour } from '@/components/formulaires/assistant-demande-sejour'
import { MesDemandesSejour } from '@/components/formulaires/mes-demandes-sejour'
import { mesDemandesSejour } from '@/server/actions/demandes-sejour'
import { reglesDeLaMaison } from '@/server/actions/regles'
import { requireUser } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Séjours' }

export default async function PageSejours() {
  await requireUser('sejours')

  const [demandes, regles] = await Promise.all([
    mesDemandesSejour(),
    reglesDeLaMaison(),
  ])

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titre-mes-demandes" className="flex flex-col gap-3">
        <h2 id="titre-mes-demandes" className="font-titre text-3xl leading-tight text-encre">
          Vos demandes
        </h2>
        <MesDemandesSejour demandes={demandes.ok ? demandes.data : []} />
      </section>

      <section aria-labelledby="titre-nouvelle-demande" className="flex flex-col gap-3">
        <h2
          id="titre-nouvelle-demande"
          className="font-titre text-3xl leading-tight text-encre"
        >
          Nouvelle demande
        </h2>
        <AssistantDemandeSejour regles={regles.ok ? regles.data : []} />
      </section>
    </div>
  )
}
