import { redirect } from 'next/navigation'

import { utilisateurEventuel } from '@/server/auth/garde'

/**
 * Écrans publics : connexion, invitation, mot de passe oublié.
 * Quelqu'un déjà connecté n'a rien à y faire — on le renvoie chez lui.
 */
export default async function CoquilleAuthentification({
  children,
}: {
  children: React.ReactNode
}) {
  const utilisateur = await utilisateurEventuel()
  if (utilisateur) redirect('/')

  return (
    <div className="flex min-h-dvh flex-col bg-lin">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-10">
        {children}
      </main>
      <footer className="pb-6 text-center text-sm text-encre-doux">
        Un carnet privé, entre amis.
      </footer>
    </div>
  )
}
