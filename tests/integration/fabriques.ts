import { empreinteMotDePasse } from '@/server/auth/empreinte'
import type { PrismaClient } from '@/generated/prisma/client'
import type {
  Role,
  StayPrivacy,
  StayRequestStatus,
  StayStatus,
  UserStatus,
} from '@/generated/prisma/enums'

/** Données de test — jamais d'adresse réelle : le TLD `.test` n'est pas routable. */

export const MOT_DE_PASSE_VALIDE = 'ChampsDeLavande2026'
export const AUTRE_MOT_DE_PASSE = 'GrandTilleulSousLaPluie'

let compteur = 0

export function emailDeTest(prefixe = 'ami'): string {
  compteur += 1
  return `${prefixe}-${compteur}@exemple.test`
}

export interface OptionsUtilisateur {
  readonly email?: string
  readonly prenom?: string
  readonly nom?: string | null
  readonly role?: Role
  readonly statut?: UserStatus
  readonly motDePasse?: string | null
}

export async function creerUtilisateur(
  client: PrismaClient,
  options: OptionsUtilisateur = {},
) {
  const motDePasse =
    options.motDePasse === null
      ? null
      : (options.motDePasse ?? MOT_DE_PASSE_VALIDE)

  return client.user.create({
    data: {
      email: options.email ?? emailDeTest(),
      firstName: options.prenom ?? 'Camille',
      lastName: options.nom === undefined ? 'Roux' : options.nom,
      role: options.role ?? 'FRIEND',
      status: options.statut ?? 'ACTIVE',
      passwordHash: motDePasse === null ? null : await empreinteMotDePasse(motDePasse),
    },
  })
}

export async function creerAdministratrice(
  client: PrismaClient,
  options: OptionsUtilisateur = {},
) {
  return creerUtilisateur(client, {
    prenom: 'Solenne',
    nom: 'Marchand',
    role: 'ADMIN',
    email: options.email ?? emailDeTest('solenne'),
    ...options,
  })
}

export async function creerMaison(client: PrismaClient, capacite = 10) {
  return client.house.create({
    data: { name: 'La maison de Solenne', capacityMax: capacite },
  })
}

/** Un jour nu, calé à minuit UTC — même convention que le domaine. */
export function leJour(texte: string): Date {
  return new Date(`${texte}T00:00:00.000Z`)
}

export interface OptionsSejour {
  readonly du: string
  readonly au: string
  readonly adultes?: number
  readonly enfants?: number
  readonly statut?: StayStatus
  readonly niveau?: StayPrivacy
  readonly sejourDeSolenne?: boolean
  /** Rattache le séjour à une demande — c'est elle qui porte motif et commentaire. */
  readonly demandeId?: string
}

export async function creerSejour(
  client: PrismaClient,
  maisonId: string,
  utilisateurId: string,
  options: OptionsSejour,
) {
  return client.stay.create({
    data: {
      houseId: maisonId,
      userId: utilisateurId,
      startDate: leJour(options.du),
      endDate: leJour(options.au),
      adults: options.adultes ?? 2,
      children: options.enfants ?? 0,
      status: options.statut ?? 'CONFIRMED',
      ...(options.niveau ? { privacyLevel: options.niveau } : {}),
      ...(options.sejourDeSolenne ? { isOwnerStay: true } : {}),
      ...(options.demandeId ? { requestId: options.demandeId } : {}),
    },
  })
}

export interface OptionsDemande {
  readonly du: string
  readonly au: string
  readonly adultes?: number
  readonly enfants?: number
  readonly statut?: StayRequestStatus
  readonly motif?: string
  readonly commentaire?: string
  readonly besoins?: string
}

export async function creerDemande(
  client: PrismaClient,
  demandeurId: string,
  options: OptionsDemande,
) {
  return client.stayRequest.create({
    data: {
      requesterId: demandeurId,
      arrivalDate: leJour(options.du),
      departureDate: leJour(options.au),
      adults: options.adultes ?? 2,
      children: options.enfants ?? 0,
      status: options.statut ?? 'PENDING',
      purpose: options.motif ?? null,
      comment: options.commentaire ?? null,
      specialNeeds: options.besoins ?? null,
    },
  })
}
