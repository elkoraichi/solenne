'use client'

import { Copy, Send, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue-confirmation'
import { EtatVide } from '@/components/ui/etat-vide'
import { formaterJourNumerique } from '@/domain/core/dates'
import type { Echec } from '@/domain/core/result'
import {
  emettreInvitation,
  relancerInvitation,
  revoquerInvitation,
  type InvitationListee,
} from '@/server/actions/invitations'
import {
  desactiverUtilisateur,
  reactiverUtilisateur,
  supprimerUtilisateur,
  type UtilisateurListe,
} from '@/server/actions/utilisateurs'

/** Écran 11 — console de Solenne, onglet « Utilisateurs & invitations ». */
export function ConsoleGestion({
  utilisateurs,
  invitations,
  moi,
}: {
  utilisateurs: UtilisateurListe[]
  invitations: InvitationListee[]
  moi: string
}) {
  const router = useRouter()
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [lienCopiable, setLienCopiable] = useState<string | null>(null)
  const [aSupprimer, setASupprimer] = useState<UtilisateurListe | null>(null)
  const [enCours, demarrer] = useTransition()

  function apres(message: string) {
    setEchec(null)
    setAnnonce(message)
    router.refresh()
  }

  function agir(appel: () => Promise<{ ok: boolean } & Record<string, unknown>>, message: string) {
    setEchec(null)
    setAnnonce(null)
    demarrer(async () => {
      const resultat = await appel()
      if (resultat.ok) apres(message)
      else setEchec(resultat as unknown as Echec)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <h2 className="font-titre text-2xl">Gérer le cercle</h2>

      {echec && (
        <BandeauErreur
          message={echec.message}
          action={
            echec.code === 'UPCOMING_STAYS' && aSupprimer === null ? (
              <p className="text-sm">
                Confirmez depuis la fiche de la personne pour passer outre.
              </p>
            ) : null
          }
        />
      )}
      {annonce && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {annonce}
        </p>
      )}

      <FormulaireInvitation
        surSucces={(lien) => {
          setLienCopiable(lien)
          apres('Invitation envoyée.')
        }}
        surEchec={setEchec}
      />

      {lienCopiable && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-champ)] border border-bois-clair bg-lin-fonce p-4">
          <p className="text-sm text-encre-doux">
            Tant que l’envoi d’emails n’est pas branché, transmettez ce lien à
            la main :
          </p>
          <code className="overflow-x-auto rounded-[var(--radius-puce)] bg-white px-3 py-2 text-xs break-all">
            {lienCopiable}
          </code>
          <Bouton
            variante="secondaire"
            onClick={() => {
              void navigator.clipboard?.writeText(lienCopiable)
              setAnnonce('Lien copié.')
            }}
          >
            <Copy aria-hidden="true" />
            Copier le lien
          </Bouton>
        </div>
      )}

      <section aria-labelledby="titre-invitations" className="flex flex-col gap-3">
        <h3 id="titre-invitations" className="font-titre text-xl">
          Invitations
        </h3>
        {invitations.length === 0 ? (
          <EtatVide
            titre="Aucune invitation en cours"
            texte="Les invitations envoyées apparaîtront ici, avec leur date d’expiration."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-champ)] border border-lin-profond bg-lin-fonce p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{invitation.email}</p>
                  <p className="text-sm text-encre-doux">
                    {invitation.etat === 'ACCEPTEE'
                      ? `Acceptée le ${invitation.accepteeLe ? formaterJourNumerique(invitation.accepteeLe) : '—'}`
                      : `Expire le ${formaterJourNumerique(invitation.expireLe)}`}
                  </p>
                </div>
                <EtiquetteEtat etat={invitation.etat} />
                {invitation.etat === 'EN_ATTENTE' || invitation.etat === 'EXPIREE' ? (
                  <div className="flex gap-1">
                    <Bouton
                      variante="discret"
                      disabled={enCours}
                      onClick={() =>
                        agir(
                          async () => {
                            const resultat = await relancerInvitation({
                              id: invitation.id,
                            })
                            if (resultat.ok) setLienCopiable(resultat.data.lien)
                            return resultat
                          },
                          'Invitation relancée.',
                        )
                      }
                    >
                      Relancer
                    </Bouton>
                    <Bouton
                      variante="discret"
                      disabled={enCours}
                      onClick={() =>
                        agir(
                          () => revoquerInvitation({ id: invitation.id }),
                          'Invitation révoquée.',
                        )
                      }
                    >
                      Révoquer
                    </Bouton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titre-utilisateurs" className="flex flex-col gap-3">
        <h3 id="titre-utilisateurs" className="font-titre text-xl">
          Le cercle
        </h3>
        <ul className="flex flex-col gap-2">
          {utilisateurs.map((utilisateur) => (
            <li
              key={utilisateur.id}
              className="flex flex-wrap items-center gap-3 rounded-[var(--radius-champ)] border border-lin-profond bg-lin-fonce p-4"
            >
              <Avatar
                nom={utilisateur.prenom}
                url={utilisateur.avatarUrl}
                taille="petite"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {utilisateur.prenom} {utilisateur.nom ?? ''}
                </p>
                <p className="truncate text-sm text-encre-doux">
                  {utilisateur.email}
                </p>
              </div>
              {utilisateur.role === 'ADMIN' && <Badge ton="bois">Solenne</Badge>}
              {utilisateur.statut === 'DISABLED' && (
                <Badge ton="terracotta">Désactivé</Badge>
              )}

              {utilisateur.id !== moi && !utilisateur.anonymise && (
                <div className="flex gap-1">
                  {utilisateur.statut === 'ACTIVE' ? (
                    <Bouton
                      variante="discret"
                      disabled={enCours}
                      onClick={() =>
                        agir(
                          () => desactiverUtilisateur({ id: utilisateur.id }),
                          'Compte désactivé.',
                        )
                      }
                    >
                      <UserMinus aria-hidden="true" />
                      Désactiver
                    </Bouton>
                  ) : (
                    <Bouton
                      variante="discret"
                      disabled={enCours}
                      onClick={() =>
                        agir(
                          () => reactiverUtilisateur({ id: utilisateur.id }),
                          'Compte réactivé.',
                        )
                      }
                    >
                      <UserPlus aria-hidden="true" />
                      Réactiver
                    </Bouton>
                  )}
                  <Bouton
                    variante="discret"
                    disabled={enCours}
                    aria-label={`Supprimer le compte de ${utilisateur.prenom}`}
                    onClick={() => setASupprimer(utilisateur)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Bouton>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <DialogueConfirmation
        ouvert={aSupprimer !== null}
        onOuvertureChange={(ouvert) => !ouvert && setASupprimer(null)}
        titre="Supprimer ce compte ?"
        objet={`${aSupprimer?.prenom ?? ''} ${aSupprimer?.nom ?? ''}`.trim()}
        consequence="ses informations personnelles seront effacées ; ses séjours passés resteront, sous « Ancien invité »"
        libelleConfirmer="Supprimer définitivement"
        enCours={enCours}
        onConfirmer={() => {
          const cible = aSupprimer
          if (!cible) return
          setASupprimer(null)
          agir(() => supprimerUtilisateur({ id: cible.id }), 'Compte supprimé.')
        }}
      />
    </div>
  )
}

function EtiquetteEtat({ etat }: { etat: InvitationListee['etat'] }) {
  const libelles = {
    EN_ATTENTE: { texte: 'En attente', ton: 'neutre' },
    EXPIREE: { texte: 'Expirée', ton: 'contour' },
    ACCEPTEE: { texte: 'Acceptée', ton: 'olive' },
    REVOQUEE: { texte: 'Révoquée', ton: 'terracotta' },
  } as const

  const { texte, ton } = libelles[etat]
  return <Badge ton={ton}>{texte}</Badge>
}

function FormulaireInvitation({
  surSucces,
  surEchec,
}: {
  surSucces: (lien: string) => void
  surEchec: (echec: Echec) => void
}) {
  const [email, setEmail] = useState('')
  const [enCours, demarrer] = useTransition()

  return (
    <form
      className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-5"
      noValidate
      onSubmit={(evenement) => {
        evenement.preventDefault()
        demarrer(async () => {
          const resultat = await emettreInvitation({ email })
          if (resultat.ok) {
            setEmail('')
            surSucces(resultat.data.lien)
          } else {
            surEchec(resultat)
          }
        })
      }}
    >
      <h3 className="font-titre text-xl">Inviter quelqu’un</h3>
      <Champ
        etiquette="Adresse email"
        nom="emailInvitation"
        type="email"
        inputMode="email"
        value={email}
        onChange={(evenement) => setEmail(evenement.target.value)}
      />
      <Bouton type="submit" disabled={enCours || email.length === 0}>
        <Send aria-hidden="true" />
        {enCours ? 'Un instant…' : 'Envoyer l’invitation'}
      </Bouton>
    </form>
  )
}
