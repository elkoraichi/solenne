import { empreinteMotDePasse } from '@/server/auth/empreinte'
import type { PrismaClient } from '@/generated/prisma/client'
import type { Role, UserStatus } from '@/generated/prisma/enums'

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
