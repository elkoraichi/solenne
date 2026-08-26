import { Trees } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ConsoleGestion } from '@/components/formulaires/console-gestion'
import { FileAttenteDecisions } from '@/components/formulaires/file-attente-decisions'
import { GestionSejours } from '@/components/formulaires/gestion-sejours'
import { Bouton } from '@/components/ui/bouton'
import { demandesEnAttente } from '@/server/actions/decisions-sejour'
import { listerInvitations } from '@/server/actions/invitations'
import { sejoursDeLaMaison, suggestionsLiberation } from '@/server/actions/sejours'
import { listerUtilisateurs } from '@/server/actions/utilisateurs'
import { requireAdminPage } from '@/server/auth/garde'

export const metadata: Metadata = { title: 'Gérer' }

export default async function PageGerer() {
  const solenne = await requireAdminPage('gerer')

  const [utilisateurs, invitations, demandes, sejours, suggestions] = await Promise.all([
    listerUtilisateurs(),
    listerInvitations(),
    demandesEnAttente(),
    sejoursDeLaMaison(),
    suggestionsLiberation(),
  ])
  if (!utilisateurs.ok || !invitations.ok || !demandes.ok || !sejours.ok || !suggestions.ok) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titre-demandes" className="flex flex-col gap-3">
        <h2 id="titre-demandes" className="font-titre text-3xl leading-tight text-encre">
          Demandes de séjour
        </h2>
        <FileAttenteDecisions demandes={demandes.data} />
      </section>

      <section aria-labelledby="titre-sejours" className="flex flex-col gap-3">
        <h2 id="titre-sejours" className="font-titre text-3xl leading-tight text-encre">
          Séjours
        </h2>
        <GestionSejours sejours={sejours.data} suggestions={suggestions.data} />
      </section>

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
