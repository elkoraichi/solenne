/**
 * Amorçage EXPLICITE du jeu de démonstration sur la base de production.
 *
 * Contrairement à `prisma/seed.ts` (qui refuse de s'exécuter en production,
 * SETUP-010), ce script est fait pour ça : le temps que Solenne dispose des
 * vraies photos, l'accès reste limité à elle et quelques amis, et le contenu
 * de `localhost` doit s'y retrouver à l'identique — décision explicite du
 * 27/08/2026 (cf. Rapports/etat.md).
 *
 * DESTRUCTIF : vide toutes les tables applicatives avant de reconstruire.
 * Exige `CONFIRME_PRODUCTION=oui` pour s'exécuter — un filet, pas une
 * formalité : ce script ne doit jamais partir par réflexe.
 *
 * À lancer une seule fois, depuis un poste qui a accès au contexte Netlify
 * (variables + Blobs) : `netlify dev:exec --context production -- npm run
 * db:seed:prod`. Pas branché sur `netlify.toml` : contrairement à
 * `bootstrap-house.ts` (idempotent), le rejouer efface tout, donc il ne doit
 * jamais tourner automatiquement à chaque déploiement.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { hash } from '@node-rs/argon2'
import { getStore } from '@netlify/blobs'
import { PrismaPg } from '@prisma/adapter-pg'

import { ajouterJours, debutDeJour, instantDepuisHeureParis } from '../src/domain/core/dates'
import { chargerFichierEnv } from '../src/env/fichier'
import { resoudreSourceEnv } from '../src/env/schema'
import { PrismaClient } from '../src/generated/prisma/client'
import { normaliserPhoto } from '../src/server/stockage/normalisation'
import { PHOTOS_ESPACES, PHOTOS_MAISON, type PhotoDemo } from './photos-demo'

if (process.env.CONFIRME_PRODUCTION !== 'oui') {
  console.error(
    [
      'Refus : ce script efface et recrée toute la base de production.',
      'Relancer avec CONFIRME_PRODUCTION=oui pour confirmer.',
    ].join('\n'),
  )
  process.exit(1)
}

chargerFichierEnv()
process.env = { ...process.env, ...resoudreSourceEnv(process.env) }

const urlBase = process.env.DATABASE_URL
if (!urlBase) {
  console.error('Variable manquante : DATABASE_URL (ni DATABASE_URL, ni NETLIFY_DB_URL/NETLIFY_DATABASE_URL).')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBase }) })

const CAPACITE_PROVISOIRE = 10
const MOT_DE_PASSE_DEMO = 'DemoSolenne2026!'
const NOM_MAGASIN = 'televersements'

const CHAMBRES = [
  { nom: 'Chambre blanche', lit: '1 lit double', couchages: 2 },
  { nom: 'Chambre jaune', lit: '1 lit double', couchages: 2 },
  { nom: 'Chambre verte', lit: '2 lits simples', couchages: 2 },
  { nom: 'Chambre mansardée', lit: '2 lits simples', couchages: 2 },
  { nom: 'Canapé-lit du salon', lit: '1 convertible', couchages: 2 },
] as const

const BUREAUX = [
  { nom: 'Bureau de Julien', equipements: ['bureau', 'écran', 'Wi-Fi', 'imprimante'] },
  { nom: 'Bureau de Solenne', equipements: ['bureau', 'écran', 'fauteuil'] },
] as const

const AMIS = [
  { prenom: 'Marc', nom: 'Delaunay', relation: 'CLOSE_FRIEND' as const, enfants: 0 },
  { prenom: 'Léa', nom: 'Fournier', relation: 'CLOSE_FRIEND' as const, enfants: 2 },
  { prenom: 'Jean', nom: 'Berthier', relation: 'FAMILY' as const, enfants: 1 },
  { prenom: 'Camille', nom: 'Roux', relation: 'ACQUAINTANCE' as const, enfants: 0 },
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

const TABLES_A_VIDER = [
  'rate_limit_hits',
  'email_change_requests',
  'audit_logs',
  'comments',
  'notification_deliveries',
  'notification_preferences',
  'notifications',
  'space_assignments',
  'stay_guests',
  'stays',
  'stay_requests',
  'event_item_claims',
  'event_items',
  'activity_participants',
  'event_activities',
  'event_participants',
  'events',
  'blocked_periods',
  'booking_settings',
  'house_rule_versions',
  'house_rules',
  'spaces',
  'houses',
  'password_reset_tokens',
  'invitations',
  'sessions',
  'accounts',
  'users',
] as const

async function viderBase() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_pas_de_modification"',
  )
  try {
    for (const table of TABLES_A_VIDER) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
    }
  } finally {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_pas_de_modification"',
    )
  }
}

/** Range une image normalisée sur Netlify Blobs (ou disque si le contexte est absent). */
async function ranger(normalisee: Buffer): Promise<string> {
  const nom = `${randomUUID()}.webp`
  try {
    const store = getStore(NOM_MAGASIN)
    const tampon = new ArrayBuffer(normalisee.byteLength)
    new Uint8Array(tampon).set(normalisee)
    await store.set(nom, tampon)
  } catch {
    await mkdir('.televersements', { recursive: true })
    await writeFile(join('.televersements', nom), normalisee)
  }
  return `/media/${nom}`
}

async function importerPhotoProd(photo: PhotoDemo): Promise<string | null> {
  let original: Buffer
  try {
    original = await readFile(join('Photos', photo.fichier))
  } catch {
    console.warn(`  ⚠ photo introuvable, ignorée : Photos/${photo.fichier}`)
    return null
  }
  const normalisee = await normaliserPhoto(new Uint8Array(original))
  return ranger(normalisee)
}

async function importerPhotosProd(photos: readonly PhotoDemo[]): Promise<string[]> {
  const urls: string[] = []
  for (const photo of photos) {
    const url = await importerPhotoProd(photo)
    if (url) urls.push(url)
  }
  return urls
}

async function main() {
  await viderBase()

  const empreinte = await hash(MOT_DE_PASSE_DEMO)
  const aujourdHui = debutDeJour(new Date())
  const dans = (jours: number) => ajouterJours(aujourdHui, jours)

  const solenne = await prisma.user.create({
    data: {
      email: 'solenne@exemple.test',
      passwordHash: empreinte,
      firstName: 'Solenne',
      lastName: 'Marchand',
      role: 'ADMIN',
      relationType: 'OTHER',
      status: 'ACTIVE',
    },
  })

  const amis = []
  for (const ami of AMIS) {
    amis.push(
      await prisma.user.create({
        data: {
          email: `${ami.prenom.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')}@exemple.test`,
          passwordHash: empreinte,
          firstName: ami.prenom,
          lastName: ami.nom,
          role: 'FRIEND',
          relationType: ami.relation,
          childrenCount: ami.enfants,
          status: 'ACTIVE',
        },
      }),
    )
  }
  const [marc, lea, jean, camille] = amis as [
    (typeof amis)[number],
    (typeof amis)[number],
    (typeof amis)[number],
    (typeof amis)[number],
  ]

  const photosMaison = await importerPhotosProd(PHOTOS_MAISON)

  const maison = await prisma.house.create({
    data: {
      name: 'Baby House',
      description:
        'Une maison de campagne en pierre, un grand jardin, une longue table sous le tilleul. On y vient pour se poser.',
      address: 'Provisoire — à renseigner',
      capacityMax: CAPACITE_PROVISOIRE,
      photos: photosMaison,
      coverImage: photosMaison[0] ?? null,
    },
  })

  const photoDe = async (nom: string): Promise<string[]> => {
    const photo = PHOTOS_ESPACES[nom]
    if (!photo) return []
    const url = await importerPhotoProd(photo)
    return url ? [url] : []
  }

  for (const [index, chambre] of CHAMBRES.entries()) {
    await prisma.space.create({
      data: {
        houseId: maison.id,
        type: 'ROOM',
        name: chambre.nom,
        bedType: chambre.lit,
        sleeps: chambre.couchages,
        photos: await photoDe(chambre.nom),
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
        photos: await photoDe(bureau.nom),
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

  const anniversaire = await prisma.event.create({
    data: {
      houseId: maison.id,
      title: 'L’anniversaire de Léa',
      description:
        'Un week-end de fin d’été : grande tablée samedi soir, brunch dimanche, baignades pour ceux qui osent.',
      startAt: instantDepuisHeureParis(dans(21), 17, 0),
      endAt: instantDepuisHeureParis(dans(23), 15, 0),
      location: 'À la maison',
      capacityMax: 10,
      status: 'PUBLISHED',
      createdById: solenne.id,
      activities: {
        create: [
          {
            title: 'Apéritif dans le jardin',
            startAt: instantDepuisHeureParis(dans(21), 19, 0),
            durationMin: 90,
            location: 'Sous le tilleul',
            order: 0,
          },
          {
            title: 'Grande tablée',
            startAt: instantDepuisHeureParis(dans(21), 20, 30),
            durationMin: 180,
            location: 'Terrasse',
            order: 1,
          },
          {
            title: 'Brunch tardif',
            startAt: instantDepuisHeureParis(dans(22), 11, 0),
            durationMin: 120,
            location: 'Cuisine',
            order: 2,
          },
        ],
      },
      items: {
        create: [
          { label: 'Viande à griller', category: 'Repas', slotsNeeded: 2, unit: 'part' },
          { label: 'Dessert', category: 'Repas', slotsNeeded: 2 },
          { label: 'Pain', category: 'Repas', slotsNeeded: 1 },
          { label: 'Glaçons', category: 'Boissons', slotsNeeded: 1 },
        ],
      },
    },
    include: { items: true },
  })

  await prisma.event.create({
    data: {
      houseId: maison.id,
      title: 'Week-end champignons',
      description: 'Lever tôt, bottes obligatoires, omelette au retour.',
      startAt: instantDepuisHeureParis(dans(60), 18, 0),
      endAt: instantDepuisHeureParis(dans(62), 14, 0),
      location: 'Bois de la Sablière',
      capacityMax: 8,
      status: 'PUBLISHED',
      createdById: solenne.id,
    },
  })

  await prisma.eventParticipant.createMany({
    data: [
      {
        eventId: anniversaire.id,
        userId: lea.id,
        status: 'YES',
        adultsExtra: 1,
        sleepsOver: false,
        respondedAt: new Date(),
      },
      {
        eventId: anniversaire.id,
        userId: marc.id,
        status: 'YES',
        adultsExtra: 0,
        sleepsOver: false,
        respondedAt: new Date(),
      },
      { eventId: anniversaire.id, userId: jean.id, status: 'MAYBE' },
      { eventId: anniversaire.id, userId: camille.id, status: 'PENDING' },
    ],
  })

  const dessert = anniversaire.items.find((item) => item.label === 'Dessert')
  if (dessert) {
    await prisma.eventItemClaim.create({
      data: { itemId: dessert.id, userId: marc.id, quantity: 1 },
    })
  }

  const demandeMarc = await prisma.stayRequest.create({
    data: {
      requesterId: marc.id,
      arrivalDate: dans(7),
      departureDate: dans(10),
      adults: 2,
      children: 0,
      purpose: 'Quelques jours au calme',
      status: 'ACCEPTED',
      decidedById: solenne.id,
      decidedAt: new Date(),
      rulesAcceptedAt: new Date(),
    },
  })

  await prisma.stay.create({
    data: {
      houseId: maison.id,
      requestId: demandeMarc.id,
      userId: marc.id,
      startDate: dans(7),
      endDate: dans(10),
      adults: 2,
      children: 0,
      privacyLevel: 'BUSY_ONLY',
      status: 'CONFIRMED',
    },
  })

  const demandeLea = await prisma.stayRequest.create({
    data: {
      requesterId: lea.id,
      arrivalDate: dans(21),
      departureDate: dans(23),
      adults: 2,
      children: 1,
      purpose: 'Rester dormir après la fête',
      status: 'ACCEPTED',
      decidedById: solenne.id,
      decidedAt: new Date(),
      rulesAcceptedAt: new Date(),
    },
  })

  await prisma.stay.create({
    data: {
      houseId: maison.id,
      requestId: demandeLea.id,
      userId: lea.id,
      startDate: dans(21),
      endDate: dans(23),
      adults: 2,
      children: 1,
      privacyLevel: 'BUSY_ONLY',
      status: 'CONFIRMED',
      guests: {
        create: [{ name: 'Noé', isChild: true }],
      },
    },
  })

  await prisma.stay.create({
    data: {
      houseId: maison.id,
      userId: solenne.id,
      startDate: dans(40),
      endDate: dans(44),
      adults: 1,
      children: 0,
      isOwnerStay: true,
      privacyLevel: 'FULL',
      status: 'CONFIRMED',
    },
  })

  await prisma.stayRequest.create({
    data: {
      requesterId: jean.id,
      arrivalDate: dans(75),
      departureDate: dans(78),
      adults: 2,
      children: 1,
      purpose: 'Week-end en famille',
      comment: 'On peut décaler d’une semaine si ça t’arrange.',
      status: 'PENDING',
    },
  })

  await prisma.blockedPeriod.createMany({
    data: [
      {
        houseId: maison.id,
        startDate: dans(30),
        endDate: dans(33),
        label: 'Ramonage et entretien de la chaudière',
        type: 'MAINTENANCE',
        createdById: solenne.id,
      },
      {
        houseId: maison.id,
        startDate: dans(90),
        endDate: dans(95),
        label: 'Réservé — famille',
        type: 'PERSONAL',
        createdById: solenne.id,
      },
    ],
  })

  const comptes = {
    utilisateurs: await prisma.user.count(),
    espaces: await prisma.space.count(),
    evenements: await prisma.event.count(),
    sejours: await prisma.stay.count(),
    blocages: await prisma.blockedPeriod.count(),
  }

  console.log(
    [
      'Production réinitialisée avec le jeu de démonstration :',
      `  · ${comptes.utilisateurs} comptes (Solenne + ${AMIS.length} amis)`,
      `  · 1 maison, capacité ${CAPACITE_PROVISOIRE}, ${photosMaison.length} photos`,
      `  · ${comptes.espaces} espaces (${CHAMBRES.length} chambres, ${BUREAUX.length} bureaux)`,
      `  · ${comptes.evenements} événements, ${comptes.sejours} séjours, ${comptes.blocages} périodes bloquées`,
      '',
      `Mot de passe commun aux comptes : ${MOT_DE_PASSE_DEMO}`,
    ].join('\n'),
  )
}

main()
  .catch((erreur) => {
    console.error('L’amorçage de production a échoué :', erreur)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
