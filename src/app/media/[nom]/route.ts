import { NextResponse } from 'next/server'

import { requireUser } from '@/server/auth/garde'
import { lireImage } from '@/server/stockage/images'

/**
 * Sert les images téléversées.
 *
 * Elles ne sont pas dans `public/` : ce sont des photos de personnes, réservées
 * au cercle. Une session valide est exigée, comme pour n'importe quelle donnée.
 */
export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ nom: string }> },
) {
  try {
    await requireUser('media.lire')
  } catch {
    return new NextResponse(null, { status: 404 })
  }

  const { nom } = await contexte.params
  const image = await lireImage(nom)
  if (!image) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(image), {
    status: 200,
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'private, max-age=3600',
      'content-length': String(image.byteLength),
    },
  })
}
