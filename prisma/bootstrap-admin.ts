/**
 * Amorçage du tout premier compte administrateur en production.
 *
 * Ne s'exécute que si `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`
 * sont fournies (variables d'environnement Netlify, jamais commitées) et
 * qu'aucun compte ADMIN n'existe déjà — idempotent, sans risque à laisser
 * dans la chaîne de build.
 */

import { hash } from '@node-rs/argon2'
import { PrismaPg } from '@prisma/adapter-pg'

import { chargerFichierEnv } from '../src/env/fichier'
import { PrismaClient } from '../src/generated/prisma/client'

chargerFichierEnv()

const email = process.env.ADMIN_BOOTSTRAP_EMAIL
const motDePasse = process.env.ADMIN_BOOTSTRAP_PASSWORD

async function main() {
  if (!email || !motDePasse) {
    console.log('Amorçage admin : variables absentes, rien à faire.')
    return
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Amorçage admin : DATABASE_URL manquant.')
    process.exitCode = 1
    return
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  try {
    const dejaLa = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    if (dejaLa) {
      console.log('Amorçage admin : un compte administrateur existe déjà, rien à faire.')
      return
    }

    const empreinte = await hash(motDePasse)
    await prisma.user.create({
      data: {
        email,
        passwordHash: empreinte,
        firstName: 'Solenne',
        lastName: 'Chabrat',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    })
    console.log(`Amorçage admin : compte créé pour ${email}.`)
  } finally {
    await prisma.$disconnect()
  }
}

main()
