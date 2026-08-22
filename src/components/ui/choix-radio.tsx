'use client'

import { cn } from '@/lib/utils'

/**
 * Un choix unique dans un groupe, taillé pour le pouce.
 *
 * Le bouton natif fait 20 px : c'est la moitié de la cible tactile exigée
 * (UI-002, 44 × 44). Plutôt que de grossir un rond disgracieux, on masque
 * l'`input` — il reste focalisable et annoncé par les lecteurs d'écran — et
 * c'est **l'étiquette entière** qui devient la cible. Le rond n'est plus qu'un
 * dessin, marqué `aria-hidden`.
 */
export function ChoixRadio({
  nom,
  coche,
  titre,
  description,
  disabled,
  onChoisir,
  className,
}: {
  readonly nom: string
  readonly coche: boolean
  readonly titre: string
  readonly description?: string
  readonly disabled?: boolean
  readonly onChoisir: () => void
  readonly className?: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-[var(--radius-champ)] border px-3 py-2 text-sm text-encre transition-colors',
        coche ? 'border-olive bg-lin-fonce' : 'border-lin-profond',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        type="radio"
        name={nom}
        className="peer sr-only"
        checked={coche}
        disabled={disabled}
        onChange={onChoisir}
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-olive',
          coche ? 'border-olive bg-olive' : 'border-bois bg-white',
        )}
      >
        <span className="size-1.5 rounded-full bg-white" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{titre}</span>
        {description && <span className="text-encre-doux">{description}</span>}
      </span>
    </label>
  )
}
