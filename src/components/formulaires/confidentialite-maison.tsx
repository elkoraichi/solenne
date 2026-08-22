'use client'

import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { ChoixRadio } from '@/components/ui/choix-radio'
import { EtatVide } from '@/components/ui/etat-vide'
import { formaterPeriode } from '@/domain/core/dates'
import type { Echec, Resultat } from '@/domain/core/result'
import {
  EXPLICATION_NIVEAU,
  LIBELLE_NIVEAU,
  NIVEAUX_VISIBILITE,
  type NiveauVisibilite,
  type SejourDetaille,
} from '@/domain/privacy/visibilite'
import {
  definirVisibiliteParDefaut,
  definirVisibiliteSejour,
} from '@/server/actions/confidentialite'

/**
 * Console de Solenne — ce que les amis apprennent des séjours.
 *
 * Deux réglages qu'il ne faut pas confondre :
 *   · le **défaut** s'applique aux séjours des amis à venir. Il ne réécrit
 *     rien : un séjour accepté sous promesse de discrétion le reste (PRIV-010) ;
 *   · le réglage **d'un séjour** ne touche que celui-là (PRIV-011).
 *
 * Les séjours de Solenne partent, eux, en « prénom et nombre de personnes » —
 * c'est sa maison. La phrase sous le choix le dit, pour qu'elle ne le
 * découvre pas sur l'agenda de ses amis.
 */
export function ConfidentialiteMaison({
  defaut,
  defautSolenne,
  sejours,
}: {
  readonly defaut: NiveauVisibilite
  readonly defautSolenne: NiveauVisibilite
  readonly sejours: readonly SejourDetaille[]
}) {
  const router = useRouter()
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function agir(appel: () => Promise<Resultat<unknown>>, message: string) {
    setEchec(null)
    setAnnonce(null)
    demarrer(async () => {
      const resultat = await appel()
      if (resultat.ok) {
        setAnnonce(message)
        router.refresh()
        return
      }
      setEchec(resultat)
    })
  }

  return (
    <section
      aria-labelledby="titre-confidentialite"
      className="flex flex-col gap-4"
    >
      <h3
        id="titre-confidentialite"
        className="flex items-center gap-2 font-titre text-xl"
      >
        <ShieldCheck aria-hidden="true" className="size-5 text-olive" />
        Confidentialité des séjours
      </h3>
      <p className="text-sm text-encre-doux">
        Par défaut, vos amis lisent « Maison occupée » et rien d’autre : ni qui
        vient, ni combien de personnes. Chacun voit toujours son propre séjour
        en entier, et vous voyez tout.
      </p>

      {echec && <BandeauErreur message={echec.message} />}
      {annonce && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {annonce}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-encre">
          Pour les prochains séjours de vos amis
        </legend>
        {NIVEAUX_VISIBILITE.map((niveau) => (
          <ChoixRadio
            key={niveau}
            nom="visibilite-par-defaut"
            coche={defaut === niveau}
            titre={LIBELLE_NIVEAU[niveau]}
            description={EXPLICATION_NIVEAU[niveau]}
            disabled={enCours}
            onChoisir={() =>
              agir(
                () => definirVisibiliteParDefaut({ niveau }),
                `Les prochains séjours seront enregistrés en « ${LIBELLE_NIVEAU[niveau]} ».`,
              )
            }
          />
        ))}
        <p className="text-sm text-encre-doux">
          Les séjours déjà enregistrés gardent leur réglage.
        </p>
        <p className="text-sm text-encre-doux">
          Vos propres séjours, eux, partent en «&nbsp;
          {LIBELLE_NIVEAU[defautSolenne].toLocaleLowerCase('fr-FR')}&nbsp;» :
          c’est votre maison, vos amis savent quand vous y êtes. Vous pouvez
          l’abaisser séjour par séjour, ci-dessous.
        </p>
      </fieldset>

      <h4 className="font-titre text-lg">Séjours à venir</h4>

      {sejours.length === 0 ? (
        <EtatVide
          titre="Aucun séjour à venir"
          texte="Dès qu’un séjour sera confirmé, vous pourrez régler ici ce que les autres en voient."
          illustration={<EyeOff aria-hidden="true" className="size-10" />}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {sejours.map((sejour) => (
            <li
              key={sejour.id}
              className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-encre">
                  {sejour.qui}
                  {sejour.estSejourDeSolenne && (
                    <Badge ton="contour">Votre séjour</Badge>
                  )}
                </p>
                <p className="text-sm text-encre-doux">
                  {formaterPeriode(sejour.du, sejour.au)} — {sejour.personnes}{' '}
                  personne{sejour.personnes > 1 ? 's' : ''}
                </p>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="flex items-center gap-1.5 text-sm font-medium text-encre">
                  <Eye aria-hidden="true" className="size-4 text-bois" />
                  Ce que les amis en voient
                </legend>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {NIVEAUX_VISIBILITE.map((niveau) => (
                    <ChoixRadio
                      key={niveau}
                      className="sm:flex-1"
                      nom={`visibilite-${sejour.id}`}
                      coche={sejour.niveau === niveau}
                      titre={LIBELLE_NIVEAU[niveau]}
                      disabled={enCours}
                      onChoisir={() =>
                        agir(
                          () =>
                            definirVisibiliteSejour({ id: sejour.id, niveau }),
                          `Le séjour de ${sejour.qui} est désormais en « ${LIBELLE_NIVEAU[niveau]} ».`,
                        )
                      }
                    />
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
