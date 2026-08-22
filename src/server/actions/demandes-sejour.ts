'use server'

import { pourAmi, type ResultatDisponibilite } from '@/domain/availability/conflits'
import { debutDeJour } from '@/domain/core/dates'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import {
  LONGUEURS,
  schemaIdentifiant,
  schemaJour,
  validerEntree,
  z,
} from '@/domain/core/validation'
import { CAPACITE_MAX } from '@/domain/house/capacite'
import { occupationSur } from '@/domain/occupancy/occupation'
import { evaluerDemande } from '@/domain/stays/demande'
import type { PrismaClient } from '@/generated/prisma/client'
import type { StayRequestStatus } from '@/generated/prisma/enums'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import {
  estAdministratrice,
  requireUser,
  type UtilisateurConnecte,
} from '@/server/auth/garde'
import { db } from '@/server/db'
import { contexteDisponibilite } from '@/server/disponibilite'
import { reglagesActuelsDeLaMaison } from '@/server/reglages'

/**
 * `STAYREQ` — arrêt `STAYREQ-A` : créer, consulter, modifier, annuler.
 *
 * Le domaine (`src/domain/stays/demande.ts`) tranche ; ce fichier ne fait que
 * lire la base, lui tendre un contexte, et écrire le verdict. Comme
 * `reglages-reservation.ts` pour `POLICY`, c'est le **premier appelant réel**
 * de `verifierDisponibilite` — la délégation R8 (`POLICY` → `AVAIL`) décrite
 * dans les deux modules devient enfin du code qui tourne.
 *
 * SREQ-R2 / `STAYREQ-S04` : `requesterId` n'est **jamais** lu depuis l'entrée
 * — le schéma ne le déclare même pas, et l'identité vient uniquement de la
 * session (`requireUser`).
 */

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const schemaInvite = z.object({
  nom: z
    .string({ error: 'Le nom est obligatoire.' })
    .trim()
    .min(1, { error: 'Le nom est obligatoire.' })
    .max(LONGUEURS.courte),
})

const schemaDemandeBase = z.object({
  arrivee: schemaJour,
  depart: schemaJour,
  adultes: z.number().int().min(0).max(CAPACITE_MAX),
  enfants: z.number().int().min(0).max(CAPACITE_MAX),
  invites: z.array(schemaInvite).max(CAPACITE_MAX).optional(),
  exclusif: z.boolean().optional(),
  motif: z.string().trim().max(LONGUEURS.moyenne).optional(),
  commentaire: z.string().trim().max(LONGUEURS.longue).optional(),
  besoins: z.string().trim().max(LONGUEURS.moyenne).optional(),
  /** SREQ-R4 : envoyer quand même, malgré un conflit `AVAIL`/`POLICY`. */
  force: z.boolean().optional(),
})

const schemaCreation = schemaDemandeBase.extend({
  /** SREQ-R3 : accepte les règles obligatoires, si elles existent. */
  accepteRegles: z.boolean().optional(),
})

const schemaModification = schemaDemandeBase.extend({ id: schemaIdentifiant })
const schemaAnnulation = z.object({ id: schemaIdentifiant })

/** `STAYREQ-010` : disponibilité en direct — dates et personnes seulement. */
const schemaVerification = z.object({
  arrivee: schemaJour,
  depart: schemaJour,
  adultes: z.number().int().min(0).max(CAPACITE_MAX),
  enfants: z.number().int().min(0).max(CAPACITE_MAX),
  exclusif: z.boolean().optional(),
})

async function laMaison(client: PrismaClient | Transaction = db) {
  const maison = await client.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')
  return maison
}

export interface DemandeSejourVue {
  readonly id: string
  readonly arrivee: Date
  readonly depart: Date
  readonly adultes: number
  readonly enfants: number
  readonly exclusif: boolean
  readonly statut: StayRequestStatus
  readonly creeLe: Date
  readonly decisionNote: string | null
}

interface DonneesDemande {
  readonly arrivee: Date
  readonly depart: Date
  readonly adultes: number
  readonly enfants: number
  readonly invites?: readonly { readonly nom: string }[]
  readonly exclusif?: boolean
  readonly force?: boolean
}

/**
 * Évalue une demande candidate contre l'état actuel de la maison — préalables
 * `STAYREQ` propres, puis `POLICY` fondu dans `AVAIL` (R8). Ne persiste rien :
 * c'est aux appelants de décider quoi faire du verdict.
 */
async function evaluer(
  donnees: DonneesDemande,
  utilisateur: UtilisateurConnecte,
  maintenant: Date,
  reglesObligatoiresNonAcceptees: boolean,
) {
  const maison = await laMaison()
  const aPartirDe = debutDeJour(maintenant)

  const [reglages, contexte] = await Promise.all([
    reglagesActuelsDeLaMaison(maison.id),
    contexteDisponibilite(db, maison.capacityMax, { aPartirDe }),
  ])

  const occupationPeriode = occupationSur(contexte.presences, {
    debut: donnees.arrivee,
    fin: donnees.depart,
  })

  return evaluerDemande(
    {
      arrivee: donnees.arrivee,
      depart: donnees.depart,
      adultes: donnees.adultes,
      enfants: donnees.enfants,
      invites: donnees.invites ?? [],
      ...(donnees.exclusif !== undefined ? { exclusif: donnees.exclusif } : {}),
      maintenant,
      reglesObligatoiresNonAcceptees,
    },
    {
      ...contexte,
      reglages,
      estSolenne: estAdministratrice(utilisateur),
      periodeOccupee: occupationPeriode.total > 0,
    },
  )
}

/**
 * SREQ-R1 — création en `PENDING`, jamais confirmée automatiquement.
 * SREQ-R4 — un conflit `AVAIL`/`POLICY` refuse l'envoi, sauf `force: true`
 * (l'ami a vu l'avertissement et choisit d'envoyer quand même) : la demande
 * est alors créée, et les conflits partent au journal d'audit pour Solenne.
 */
export async function creerDemandeSejour(
  entree: unknown,
): Promise<Resultat<{ readonly id: string; readonly compatible: boolean }>> {
  return executerAction('demandeSejour.creer', async () => {
    const utilisateur = await requireUser('demandeSejour.creer')

    const validation = validerEntree(schemaCreation, entree)
    if (!validation.ok) return validation
    const donnees = validation.data
    const invites = donnees.invites ?? []

    const maison = await laMaison()
    const reglesObligatoires = await db.houseRule.count({
      where: { houseId: maison.id, active: true, requiresAcceptance: true },
    })

    const maintenant = new Date()
    const { prealables, disponibilite } = await evaluer(
      donnees,
      utilisateur,
      maintenant,
      reglesObligatoires > 0 && !donnees.accepteRegles,
    )

    const premierPrealable = prealables[0]
    if (premierPrealable) {
      return { ok: false, code: premierPrealable.code, message: premierPrealable.message }
    }

    if (!disponibilite.compatible && !donnees.force) {
      const premier = pourAmi(disponibilite).conflits[0]
      if (premier) return { ok: false, code: premier.code, message: premier.message }
    }

    try {
      const cree = await db.$transaction(
        async (transaction) => {
          const demande = await transaction.stayRequest.create({
            data: {
              requesterId: utilisateur.id,
              arrivalDate: donnees.arrivee,
              departureDate: donnees.depart,
              adults: donnees.adultes,
              children: donnees.enfants,
              exclusive: donnees.exclusif ?? false,
              purpose: donnees.motif ?? null,
              comment: donnees.commentaire ?? null,
              specialNeeds: donnees.besoins ?? null,
              rulesAcceptedAt: donnees.accepteRegles ? maintenant : null,
              ...(invites.length > 0
                ? { guests: { create: invites.map((invite) => ({ name: invite.nom })) } }
                : {}),
            },
          })

          await journaliserAudit(
            {
              acteurId: utilisateur.id,
              action: 'demandeSejour.creer',
              entite: 'StayRequest',
              entiteId: demande.id,
              apres: {
                arrivee: donnees.arrivee,
                depart: donnees.depart,
                adultes: donnees.adultes,
                enfants: donnees.enfants,
                exclusif: donnees.exclusif ?? false,
              },
              ...(disponibilite.compatible
                ? {}
                : {
                    details: {
                      conflits: pourAmi(disponibilite).conflits.map((c) => c.code),
                    },
                  }),
            },
            transaction,
          )

          return demande
        },
        { isolationLevel: 'Serializable' },
      )

      return succes({ id: cree.id, compatible: disponibilite.compatible })
    } catch (erreur) {
      // STAYREQ-C06 — double clic sur « Envoyer » : la seconde tentative
      // percute l'index unique partiel (ou une anomalie de sérialisation sur
      // la même course), plutôt que d'ouvrir une deuxième demande.
      // Idempotence : on rend celle déjà créée par la première, quelle que
      // soit la forme exacte que Postgres a donnée à l'échec.
      const existante = await db.stayRequest.findFirst({
        where: {
          requesterId: utilisateur.id,
          arrivalDate: donnees.arrivee,
          departureDate: donnees.depart,
          status: 'PENDING',
        },
      })
      if (!existante) throw erreur
      return succes({ id: existante.id, compatible: disponibilite.compatible })
    }
  })
}

/** SREQ-R2 : uniquement les demandes de l'appelant, quel que soit son rôle. */
export async function mesDemandesSejour(): Promise<
  Resultat<readonly DemandeSejourVue[]>
> {
  return executerAction('demandeSejour.lister', async () => {
    const utilisateur = await requireUser('demandeSejour.lister')

    const demandes = await db.stayRequest.findMany({
      where: { requesterId: utilisateur.id },
      orderBy: { createdAt: 'desc' },
    })

    return succes(
      demandes.map((demande) => ({
        id: demande.id,
        arrivee: demande.arrivalDate,
        depart: demande.departureDate,
        adultes: demande.adults,
        enfants: demande.children,
        exclusif: demande.exclusive,
        statut: demande.status,
        creeLe: demande.createdAt,
        decisionNote: demande.decisionNote,
      })),
    )
  })
}

/**
 * `STAYREQ-010` — l'assistant interroge cette action à chaque changement de
 * dates ou de personnes, pour avertir avant l'envoi plutôt qu'après. Ne
 * persiste rien, ne journalise rien : c'est un aperçu, pas une décision.
 * Les règles obligatoires ne sont jamais en jeu ici (`reglesObligatoiresNonAcceptees`
 * fixé à `false`) — leur acceptation se joue à l'étape suivante, sur le
 * récapitulatif, pas pendant la saisie des dates ou des personnes.
 */
export async function verifierDisponibiliteSejour(
  entree: unknown,
): Promise<Resultat<ResultatDisponibilite>> {
  return executerAction('demandeSejour.verifierDisponibilite', async () => {
    const utilisateur = await requireUser('demandeSejour.verifierDisponibilite')

    const validation = validerEntree(schemaVerification, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    const { disponibilite } = await evaluer(donnees, utilisateur, new Date(), false)
    return succes(pourAmi(disponibilite))
  })
}

/**
 * SREQ-R5 / R6 — modifiable tant qu'elle est `PENDING`, plus du tout après.
 * Un ami ne modifie que la sienne ; Solenne non plus ne réécrit pas celle
 * d'un autre (§5 de la fiche) — la clause `requesterId` vaut pour les deux.
 */
export async function modifierDemandeSejour(
  entree: unknown,
): Promise<Resultat<{ readonly compatible: boolean }>> {
  return executerAction('demandeSejour.modifier', async () => {
    const utilisateur = await requireUser('demandeSejour.modifier')

    const validation = validerEntree(schemaModification, entree)
    if (!validation.ok) return validation
    const donnees = validation.data
    const invites = donnees.invites ?? []

    const existante = await db.stayRequest.findFirst({
      where: { id: donnees.id, requesterId: utilisateur.id },
    })
    if (!existante) throw new ErreurMetier('NOT_FOUND')
    if (existante.status !== 'PENDING') {
      throw new ErreurMetier('REQUEST_ALREADY_DECIDED')
    }

    const maintenant = new Date()
    const { prealables, disponibilite } = await evaluer(
      donnees,
      utilisateur,
      maintenant,
      false, // SREQ-R3 : déjà acceptées à la création, pas revalidées ici.
    )

    const premierPrealable = prealables[0]
    if (premierPrealable) {
      return { ok: false, code: premierPrealable.code, message: premierPrealable.message }
    }

    if (!disponibilite.compatible && !donnees.force) {
      const premier = pourAmi(disponibilite).conflits[0]
      if (premier) return { ok: false, code: premier.code, message: premier.message }
    }

    await db.$transaction(
      async (transaction) => {
        // Filet de concurrence : si la demande a été décidée entre la lecture
        // ci-dessus et cette écriture, la mise à jour ne touche aucune ligne.
        const misAJour = await transaction.stayRequest.updateMany({
          where: { id: donnees.id, requesterId: utilisateur.id, status: 'PENDING' },
          data: {
            arrivalDate: donnees.arrivee,
            departureDate: donnees.depart,
            adults: donnees.adultes,
            children: donnees.enfants,
            exclusive: donnees.exclusif ?? existante.exclusive,
            purpose: donnees.motif ?? null,
            comment: donnees.commentaire ?? null,
            specialNeeds: donnees.besoins ?? null,
          },
        })
        if (misAJour.count === 0) throw new ErreurMetier('REQUEST_ALREADY_DECIDED')

        await transaction.stayGuest.deleteMany({
          where: { stayRequestId: donnees.id },
        })
        if (invites.length > 0) {
          await transaction.stayGuest.createMany({
            data: invites.map((invite) => ({
              stayRequestId: donnees.id,
              name: invite.nom,
            })),
          })
        }

        await journaliserAudit(
          {
            acteurId: utilisateur.id,
            action: 'demandeSejour.modifier',
            entite: 'StayRequest',
            entiteId: donnees.id,
            avant: {
              arrivee: existante.arrivalDate,
              depart: existante.departureDate,
              adultes: existante.adults,
              enfants: existante.children,
            },
            apres: {
              arrivee: donnees.arrivee,
              depart: donnees.depart,
              adultes: donnees.adultes,
              enfants: donnees.enfants,
            },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes({ compatible: disponibilite.compatible })
  })
}

/** SREQ-R5 / R6 — annulation par le demandeur, tant qu'elle est `PENDING`. */
export async function annulerDemandeSejour(entree: unknown): Promise<Resultat<null>> {
  return executerAction('demandeSejour.annuler', async () => {
    const utilisateur = await requireUser('demandeSejour.annuler')

    const validation = validerEntree(schemaAnnulation, entree)
    if (!validation.ok) return validation
    const { id } = validation.data

    await db.$transaction(
      async (transaction) => {
        const misAJour = await transaction.stayRequest.updateMany({
          where: { id, requesterId: utilisateur.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        })

        if (misAJour.count === 0) {
          // PERM-R4 : une demande d'un autre et une demande inexistante
          // rendent le même refus (`NOT_FOUND`) — seule celle du demandeur
          // lui-même, déjà décidée, obtient le message explicatif.
          const sienne = await transaction.stayRequest.findFirst({
            where: { id, requesterId: utilisateur.id },
            select: { id: true },
          })
          throw new ErreurMetier(sienne ? 'REQUEST_ALREADY_DECIDED' : 'NOT_FOUND')
        }

        await journaliserAudit(
          {
            acteurId: utilisateur.id,
            action: 'demandeSejour.annuler',
            entite: 'StayRequest',
            entiteId: id,
            apres: { statut: 'CANCELLED' },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes()
  })
}
