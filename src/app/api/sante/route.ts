import { NextResponse } from 'next/server'

import { db } from '@/server/db'
import { journal } from '@/server/logging/logger'

export const dynamic = 'force-dynamic'

/**
 * Sonde de disponibilité. Elle ne révèle rien : ni version, ni schéma, ni
 * message d'erreur technique — seulement « en état » ou « indisponible ».
 */
export async function GET() {
  const debut = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json(
      { etat: 'ok', dureeMs: Date.now() - debut },
      { status: 200 },
    )
  } catch (erreur) {
    journal.error('Sonde de santé en échec', {
      action: 'sante',
      detail: erreur,
    })
    return NextResponse.json({ etat: 'indisponible' }, { status: 503 })
  }
}
