/**
 * Jeu de données de démonstration.
 *
 * Rejouable : chaque exécution efface le contenu des tables puis le recrée à
 * l'identique. Aucune donnée réelle — les adresses utilisent le domaine réservé
 * `.test`, qui ne peut pas recevoir de courrier.
 *
 * SETUP-010 : refus immédiat en production, avant toute écriture.
 */

import { hash } from '@node-rs/argon2'
import { PrismaPg } from '@prisma/adapter-pg'

import { ajouterJours, debutDeJour, instantDepuisHeureParis } from '../src/domain/core/dates'
import { chargerFichierEnv } from '../src/env/fichier'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  importerPhoto,
  importerPhotos,
  PHOTOS_ESPACES,
  PHOTOS_MAISON,
} from './photos-demo'

// --- Garde de production (SETUP-010) ------------------------------------------

if (process.env.NODE_ENV === 'production') {
  console.error(
    [
      'Refus : le jeu de démonstration ne peut pas être exécuté en production.',
      'Aucune écriture n’a été effectuée.',
    ].join('\n'),
  )
  process.exit(1)
}

chargerFichierEnv()

const urlBase = process.env.DATABASE_URL
if (!urlBase) {
  console.error('Variable manquante : DATABASE_URL')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBase }) })

// --- Contenus provisoires (04_Contenu_a_fournir.md) ---------------------------

const CAPACITE_PROVISOIRE = 10 // D1 : paramétrable 1→25, provisoirement 10
const MOT_DE_PASSE_DEMO = 'DemoSolenne2026!'

// Les noms suivent les photos fournies par Solenne (`Photos/`), qui font foi.
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

const AMIS = [
  { prenom: 'Marc', nom: 'Delaunay', relation: 'CLOSE_FRIEND' as const, enfants: 0 },
  { prenom: 'Léa', nom: 'Fournier', relation: 'CLOSE_FRIEND' as const, enfants: 2 },
  { prenom: 'Jean', nom: 'Berthier', relation: 'FAMILY' as const, enfants: 1 },
  { prenom: 'Camille', nom: 'Roux', relation: 'ACQUAINTANCE' as const, enfants: 0 },
] as const

// Ordre inverse des dépendances : on vide sans jamais heurter une clé étrangère.
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
  // `audit_logs` est protégé contre DELETE par un déclencheur : on le neutralise
  // le temps du nettoyage, uniquement hors production.
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

async function main() {
  await viderBase()

  const empreinte = await hash(MOT_DE_PASSE_DEMO)
  const aujourdHui = debutDeJour(new Date())
  const dans = (jours: number) => ajouterJours(aujourdHui, jours)

  // --- Comptes -----------------------------------------------------------

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
          email: `${ami.prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@exemple.test`,
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

  // --- La maison ---------------------------------------------------------

  const photosMaison = await importerPhotos(PHOTOS_MAISON)

  const maison = await prisma.house.create({
    data: {
      name: 'La maison de Solenne',
      description:
        'Une maison de campagne en pierre, un grand jardin, une longue table sous le tilleul. On y vient pour se poser.',
      address: 'Provisoire — à renseigner',
      capacityMax: CAPACITE_PROVISOIRE,
      photos: photosMaison,
      coverImage: photosMaison[0] ?? null,
    },
  })

  // `SPACE` — chaque pièce reçoit sa photo quand Solenne en a fourni une.
  const photoDe = async (nom: string): Promise<string[]> => {
    const photo = PHOTOS_ESPACES[nom]
    if (!photo) return []
    const url = await importerPhoto(photo)
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

  // Chaque règle naît avec sa version 1 : aucune règle sans historique (HOUSE-R6).
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

  // --- Deux événements, sans chevauchement (D8) --------------------------

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

  // --- Trois séjours ------------------------------------------------------
  // Aucun ne chevauche une période bloquée (R1) ; aucun n'est exclusif, donc
  // aucun conflit R2/R3 ; les effectifs cumulés restent sous la capacité (R4).

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

  // Séjour pendant un événement : cas nominal (D3).
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

  // Séjour de Solenne : pas de demande, elle ne se demande rien à elle-même.
  // `FULL` n'est pas une coquetterie d'illustration — c'est le défaut de ses
  // séjours (`NIVEAU_PAR_DEFAUT_SOLENNE`), quand ceux du cercle partent en
  // « Maison occupée ».
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

  // Une demande encore en attente, pour que l'écran de décision ait de la matière.
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

  // --- Deux périodes bloquées --------------------------------------------

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
      'Jeu de démonstration créé :',
      `  · ${comptes.utilisateurs} comptes (Solenne + ${AMIS.length} amis)`,
      `  · 1 maison, capacité ${CAPACITE_PROVISOIRE}, ${photosMaison.length} photos`,
      `  · ${comptes.espaces} espaces (${CHAMBRES.length} chambres, ${BUREAUX.length} bureaux)`,
      `  · ${comptes.evenements} événements, ${comptes.sejours} séjours, ${comptes.blocages} périodes bloquées`,
      '',
      `Mot de passe commun aux comptes de démonstration : ${MOT_DE_PASSE_DEMO}`,
    ].join('\n'),
  )
}

main()
  .catch((erreur) => {
    console.error('Le jeu de démonstration a échoué :', erreur)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
