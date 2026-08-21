'use client'

import { useCallback, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Avatar. UI-010 : quand la photo manque **ou casse au chargement**, on retombe
 * sur les initiales — jamais sur une icône d'image brisée.
 */
export interface AvatarProps {
  readonly nom: string
  readonly url?: string | null
  readonly taille?: 'petite' | 'normale' | 'grande'
  readonly className?: string
}

const tailles = {
  petite: 'size-8 text-xs',
  normale: 'size-11 text-sm',
  grande: 'size-16 text-lg',
} as const satisfies Record<string, string>

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  return mots
    .slice(0, 2)
    .map((mot) => mot[0] ?? '')
    .join('')
    .toUpperCase()
}

export function Avatar({
  nom,
  url,
  taille = 'normale',
  className,
}: AvatarProps) {
  const [imageCassee, setImageCassee] = useState(false)
  const afficherPhoto = Boolean(url) && !imageCassee

  /**
   * Une image rendue côté serveur peut échouer **avant** que React n'ait posé
   * son gestionnaire : l'événement `error` est alors perdu. On rattrape le cas
   * au montage, en interrogeant l'état réel de l'image.
   */
  const verifierAuMontage = useCallback((noeud: HTMLImageElement | null) => {
    if (noeud && noeud.complete && noeud.naturalWidth === 0) {
      setImageCassee(true)
    }
  }, [])

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-bois-clair font-medium text-encre',
        tailles[taille],
        className,
      )}
    >
      {afficherPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar distant, taille fixe, pas d'optimisation utile
        <img
          ref={verifierAuMontage}
          src={url as string}
          alt={nom}
          className="size-full object-cover"
          onError={() => setImageCassee(true)}
        />
      ) : (
        <>
          <span aria-hidden="true">{initiales(nom)}</span>
          <span className="sr-only">{nom}</span>
        </>
      )}
    </span>
  )
}
