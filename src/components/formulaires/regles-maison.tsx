'use client'

import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  History,
  Pencil,
  Plus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { BandeauErreur } from '@/components/ui/bandeau-erreur'
import { Bouton } from '@/components/ui/bouton'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { EtatVide } from '@/components/ui/etat-vide'
import { formaterInstant } from '@/domain/core/dates'
import { LONGUEURS } from '@/domain/core/validation'
import type { Echec, Resultat } from '@/domain/core/result'
import {
  activerRegle,
  creerRegle,
  modifierRegle,
  reordonnerRegles,
  versionsDeLaRegle,
  type RegleDeLaMaison,
  type VersionDeRegle,
} from '@/server/actions/regles'

/**
 * Console de Solenne — les règles de la maison.
 *
 * Aucune suppression : une règle se désactive (HOUSE-015). Le texte accepté par
 * un ami doit rester consultable, ce que l'historique montre (HOUSE-018).
 */
export function ReglesMaison({
  regles,
}: {
  readonly regles: readonly RegleDeLaMaison[]
}) {
  const router = useRouter()
  const [echec, setEchec] = useState<Echec | null>(null)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const [enEdition, setEnEdition] = useState<string | null>(null)
  const [nouvelle, setNouvelle] = useState(false)
  const [historique, setHistorique] = useState<{
    readonly id: string
    readonly versions: readonly VersionDeRegle[]
  } | null>(null)
  const [enCours, demarrer] = useTransition()

  function agir(appel: () => Promise<Resultat<unknown>>, message: string) {
    setEchec(null)
    setAnnonce(null)
    demarrer(async () => {
      const resultat = await appel()
      if (resultat.ok) {
        setAnnonce(message)
        setEnEdition(null)
        setNouvelle(false)
        router.refresh()
      } else {
        setEchec(resultat)
      }
    })
  }

  function deplacer(rang: number, sens: -1 | 1) {
    const ids = regles.map((regle) => regle.id)
    const voisin = rang + sens
    const ici = ids[rang]
    const la = ids[voisin]
    if (ici === undefined || la === undefined) return
    ids[rang] = la
    ids[voisin] = ici
    agir(() => reordonnerRegles({ ids }), 'L’ordre des règles est enregistré.')
  }

  function ouvrirHistorique(id: string) {
    if (historique?.id === id) {
      setHistorique(null)
      return
    }
    demarrer(async () => {
      const resultat = await versionsDeLaRegle({ id })
      if (resultat.ok) setHistorique({ id, versions: resultat.data })
      else setEchec(resultat)
    })
  }

  return (
    <section aria-labelledby="titre-regles" className="flex flex-col gap-4">
      <h3 id="titre-regles" className="font-titre text-xl">
        Règles de la maison
      </h3>

      {echec && <BandeauErreur message={echec.message} />}
      {annonce && (
        <p
          role="status"
          className="rounded-[var(--radius-champ)] border border-olive/30 bg-lin-fonce px-4 py-3 text-sm font-medium text-olive-fonce"
        >
          {annonce}
        </p>
      )}

      {regles.length === 0 && !nouvelle && (
        <EtatVide
          titre="Aucune règle pour l’instant"
          texte="Les règles marquées « à accepter » devront être approuvées avant chaque séjour."
        />
      )}

      {regles.length > 0 && (
        <ul className="flex flex-col gap-3">
          {regles.map((regle, rang) => (
            <li
              key={regle.id}
              className="flex flex-col gap-3 rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4"
            >
              {enEdition === regle.id ? (
                <FormulaireRegle
                  regle={regle}
                  enCours={enCours}
                  echec={echec}
                  onAnnuler={() => setEnEdition(null)}
                  onValider={(valeurs) =>
                    agir(
                      () => modifierRegle({ id: regle.id, ...valeurs }),
                      'La règle est enregistrée.',
                    )
                  }
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="min-w-0 flex-1 break-words font-titre text-lg">
                      {regle.titre}
                    </h4>
                    {regle.acceptationObligatoire && (
                      <Badge ton="contour">À accepter</Badge>
                    )}
                    {!regle.active && <Badge ton="neutre">En sommeil</Badge>}
                  </div>
                  <p className="whitespace-pre-line break-words text-sm text-encre-doux">
                    {regle.texte}
                  </p>

                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Modifier « ${regle.titre} »`}
                      disabled={enCours}
                      onClick={() => setEnEdition(regle.id)}
                    >
                      <Pencil aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Historique de « ${regle.titre} »`}
                      aria-expanded={historique?.id === regle.id}
                      disabled={enCours}
                      onClick={() => ouvrirHistorique(regle.id)}
                    >
                      <History aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Monter « ${regle.titre} »`}
                      disabled={enCours || rang === 0}
                      onClick={() => deplacer(rang, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={`Descendre « ${regle.titre} »`}
                      disabled={enCours || rang === regles.length - 1}
                      onClick={() => deplacer(rang, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Bouton>
                    <Bouton
                      variante="discret"
                      taille="icone"
                      aria-label={
                        regle.active
                          ? `Mettre « ${regle.titre} » en sommeil`
                          : `Réafficher « ${regle.titre} »`
                      }
                      disabled={enCours}
                      onClick={() =>
                        agir(
                          () =>
                            activerRegle({ id: regle.id, active: !regle.active }),
                          regle.active
                            ? 'La règle est en sommeil.'
                            : 'La règle est de nouveau visible.',
                        )
                      }
                    >
                      {regle.active ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </Bouton>
                  </div>

                  {historique?.id === regle.id && (
                    <ol className="flex flex-col gap-2 border-t border-lin-profond pt-3 text-sm">
                      {historique.versions.map((version) => (
                        <li key={version.version} className="flex flex-col">
                          <span className="font-medium text-encre">
                            Version {version.version} —{' '}
                            {formaterInstant(version.deposeeLe)}
                          </span>
                          <span className="break-words text-encre-doux">
                            {version.titre} · {version.texte}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {nouvelle ? (
        <div className="rounded-[var(--radius-carte)] border border-lin-profond bg-lin-fonce p-4">
          <FormulaireRegle
            enCours={enCours}
            echec={echec}
            onAnnuler={() => setNouvelle(false)}
            onValider={(valeurs) =>
              agir(() => creerRegle(valeurs), 'La règle est ajoutée.')
            }
          />
        </div>
      ) : (
        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={enCours}
          onClick={() => setNouvelle(true)}
        >
          <Plus aria-hidden="true" />
          Ajouter une règle
        </Bouton>
      )}
    </section>
  )
}

interface ValeursRegle {
  readonly titre: string
  readonly texte: string
  readonly acceptationObligatoire: boolean
}

function FormulaireRegle({
  regle,
  enCours,
  echec,
  onValider,
  onAnnuler,
}: {
  readonly regle?: RegleDeLaMaison
  readonly enCours: boolean
  readonly echec: Echec | null
  readonly onValider: (valeurs: ValeursRegle) => void
  readonly onAnnuler: () => void
}) {
  const [titre, setTitre] = useState(regle?.titre ?? '')
  const [texte, setTexte] = useState(regle?.texte ?? '')
  const [obligatoire, setObligatoire] = useState(
    regle?.acceptationObligatoire ?? false,
  )

  const identifiant = regle?.id ?? 'nouvelle'

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(evenement) => {
        evenement.preventDefault()
        onValider({ titre, texte, acceptationObligatoire: obligatoire })
      }}
    >
      <Champ
        etiquette="Titre"
        nom={`titre-${identifiant}`}
        required
        value={titre}
        onChange={(evenement) => setTitre(evenement.target.value)}
        {...(echec?.champs?.titre ? { erreur: echec.champs.titre } : {})}
      />
      <ZoneTexte
        etiquette="Texte"
        nom={`texte-${identifiant}`}
        rows={4}
        maxLength={LONGUEURS.longue}
        value={texte}
        onChange={(evenement) => setTexte(evenement.target.value)}
        {...(echec?.champs?.texte ? { erreur: echec.champs.texte } : {})}
      />

      <label className="flex min-h-11 items-center gap-3 text-sm text-encre">
        <input
          type="checkbox"
          className="size-5 accent-[var(--color-olive)]"
          checked={obligatoire}
          onChange={(evenement) => setObligatoire(evenement.target.checked)}
        />
        À accepter avant chaque séjour
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Bouton type="submit" disabled={enCours}>
          {enCours ? 'Un instant…' : 'Enregistrer'}
        </Bouton>
        <Bouton variante="secondaire" disabled={enCours} onClick={onAnnuler}>
          Annuler
        </Bouton>
      </div>
    </form>
  )
}
