'use client'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Une case à cocher, taillée pour le pouce — même principe que `ChoixRadio` :
 * l'`input` natif est masqué (`sr-only`, toujours focalisable et annoncé),
 * et c'est l'étiquette entière qui devient la cible de 44 px (UI-002).
 */
export function CaseACocher({
  nom,
  coche,
  titre,
  description,
  disabled,
  onChanger,
  className,
}: {
  readonly nom: string
  readonly coche: boolean
  readonly titre: string
  readonly description?: string
  readonly disabled?: boolean
  readonly onChanger: (coche: boolean) => void
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
        type="checkbox"
        name={nom}
        className="peer sr-only"
        checked={coche}
        disabled={disabled}
        onChange={(evenement) => onChanger(evenement.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-[var(--radius-puce)] border transition-colors',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-olive',
          coche ? 'border-olive bg-olive' : 'border-bois bg-white',
        )}
      >
        {coche && <Check className="size-3.5 text-white" strokeWidth={3} />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{titre}</span>
        {description && <span className="text-encre-doux">{description}</span>}
      </span>
    </label>
  )
}
