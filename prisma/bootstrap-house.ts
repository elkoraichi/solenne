/**
 * Amorçage temporaire du contenu réel de la maison en production.
 *
 * Idempotent — ne fait rien si une maison existe déjà — donc sans risque à
 * laisser dans la chaîne de build, mais retiré une fois joué (cf. etat.md).
 *
 * Pas de photos ici : le stockage des images est encore local au serveur
 * (`src/server/stockage/images.ts`), pas encore adapté à l'hébergement Netlify
 * (écriture disque à l'exécution, non garantie persistante). Solenne les
 * ajoutera depuis la console une fois ce chantier fait.
 */

import { chargerFichierEnv } from '../src/env/fichier'
import { resoudreSourceEnv } from '../src/env/schema'
import { PrismaClient } from '../src/generated/prisma/client'

chargerFichierEnv()
process.env = { ...process.env, ...resoudreSourceEnv(process.env) }

const CAPACITE_PROVISOIRE = 10

const CHAMBRES = [
  { nom: 'Chambre blanche', lit: '1 lit double', couchages: 2 },
  { nom: 'Chambre jaune', lit: '1 lit double', couchages: 2 },
  { nom: 'Chambre verte', lit: '2 lits simples', couchages: 2 },
  { nom: 'Chambre mansardée', lit: '2 lits simples', couchages: 2 },
  { nom: 'Canapé-lit du salon', lit: '1 convertible', couchages: 2 },
] as const

const BUREAUX = [
  {
    nom: 'Bureau de Julien',
    equipements: ['bureau', 'écran', 'Wi-Fi', 'imprimante'],
  },
  { nom: 'Bureau de Solenne', equipements: ['bureau', 'écran', 'fauteuil'] },
] as const

const REGLES = [
  {
    title: 'Le calme après 22 h',
    body: 'Les voisins sont proches et se lèvent tôt. On baisse le ton et la musique après 22 h.',
    icon: 'moon',
    requiresAcceptance: true,
  },
  {
    title: 'On ne fume pas à l’intérieur',
    body: 'La terrasse est là pour ça, un cendrier vous y attend.',
    icon: 'cigarette-off',
    requiresAcceptance: true,
  },
  {
    title: 'La maison est rendue comme on l’a trouvée',
    body: 'Un coup de balai, la vaisselle rangée, le tri fait. Rien d’insurmontable.',
    icon: 'broom',
    requiresAcceptance: false,
  },
  {
    title: 'Les enfants près de la piscine',
    body: 'Toujours accompagnés d’un adulte. Le portillon se referme seul, on vérifie quand même.',
    icon: 'waves',
    requiresAcceptance: true,
  },
] as const

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Amorçage maison : DATABASE_URL manquant.')
    process.exitCode = 1
    return
  }

  const { PrismaPg } = await import('@prisma/adapter-pg')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  try {
    const dejaLa = await prisma.house.findFirst()
    if (dejaLa) {
      console.log('Amorçage maison : une maison existe déjà, rien à faire.')
      return
    }

    const maison = await prisma.house.create({
      data: {
        name: 'Baby House',
        description:
          'Une maison de campagne en pierre, un grand jardin, une longue table sous le tilleul. On y vient pour se poser.',
        address: 'Provisoire — à renseigner',
        capacityMax: CAPACITE_PROVISOIRE,
        photos: [],
        coverImage: null,
      },
    })

    for (const [index, chambre] of CHAMBRES.entries()) {
      await prisma.space.create({
        data: {
          houseId: maison.id,
          type: 'ROOM',
          name: chambre.nom,
          bedType: chambre.lit,
          sleeps: chambre.couchages,
          photos: [],
          order: index,
        },
      })
    }

    for (const [index, bureau] of BUREAUX.entries()) {
      await prisma.space.create({
        data: {
          houseId: maison.id,
          type: 'OFFICE',
          name: bureau.nom,
          amenities: [...bureau.equipements],
          sleeps: 0,
          photos: [],
          order: CHAMBRES.length + index,
        },
      })
    }

    for (const [index, regle] of REGLES.entries()) {
      await prisma.houseRule.create({
        data: {
          houseId: maison.id,
          title: regle.title,
          body: regle.body,
          icon: regle.icon,
          order: index,
          requiresAcceptance: regle.requiresAcceptance,
          version: 1,
          versions: {
            create: {
              version: 1,
              title: regle.title,
              body: regle.body,
              requiresAcceptance: regle.requiresAcceptance,
            },
          },
        },
      })
    }

    await prisma.bookingSettings.create({
      data: {
        houseId: maison.id,
        maxGuests: CAPACITE_PROVISOIRE,
        maxStayNights: 14,
        minLeadTimeHours: 48,
        maxAdvanceDays: 365,
        blockedWeekdays: [],
        defaultStayPrivacy: 'BUSY_ONLY',
        allowCoOccupancy: true,
      },
    })

    console.log('Amorçage maison : maison, 5 chambres, 2 bureaux, 4 règles créés.')
  } finally {
    await prisma.$disconnect()
  }
}

main()
