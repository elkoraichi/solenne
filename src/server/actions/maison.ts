'use server'

import { debutDeJour, formaterJourLong } from '@/domain/core/dates'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { LONGUEURS, validerEntree, z } from '@/domain/core/validation'
import { schemaCapacite } from '@/domain/house/capacite'
import {
  ajouterPhoto,
  couvertureEffective,
  MAX_PHOTOS,
  reordonnerPhotos,
  retirerPhoto,
} from '@/domain/house/photos'
import {
  joursAuDela,
  occupationMaximale,
  presencesConcernees,
  tientDansLaCapacite,
  type JourOccupe,
} from '@/domain/occupancy/registre'
import type { PrismaClient } from '@/generated/prisma/client'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { requireRole, requireUser } from '@/server/auth/garde'
import { db } from '@/server/db'
import { toutesLesPresences } from '@/server/occupation'
import { stockerPhoto, supprimerImage } from '@/server/stockage/images'

/**
 * Module `HOUSE` — informations générales et galerie.
 *
 * L'application ne gère qu'une maison : aucune action ne prend d'identifiant
 * de maison en entrée. Ce n'est pas un filtre qu'on pourrait oublier, c'est une
 * absence — un client qui envoie `id` ne désigne rien (HOUSE-S02).
 *
 * La capacité et les règles de la maison sont volontairement hors de ce
 * fichier : elles arrivent avec leurs propres garde-fous.
 */

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const schemaInformations = z.object({
  nom: z
    .string({ error: 'Le nom de la maison est obligatoire.' })
    .trim()
    .min(1, { error: 'Le nom de la maison est obligatoire.' })
    .max(LONGUEURS.courte, { error: 'Ce nom est trop long.' }),
  description: z.string().trim().max(LONGUEURS.longue).nullish(),
  adresse: z.string().trim().max(LONGUEURS.moyenne).nullish(),
})

const schemaUrlPhoto = z.object({
  url: z.string().trim().min(1).max(LONGUEURS.moyenne),
})

const schemaOrdre = z.object({
  urls: z.array(z.string().trim().min(1).max(LONGUEURS.moyenne)).max(MAX_PHOTOS),
})

export interface VueMaison {
  readonly id: string
  readonly nom: string
  readonly description: string | null
  readonly adresse: string | null
  readonly capaciteMax: number
  readonly photos: readonly string[]
  readonly couverture: string | null
}

/** La maison, unique. Levée si le socle n'a pas été initialisé. */
async function laMaison(client: PrismaClient | Transaction = db) {
  const maison = await client.house.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!maison) throw new ErreurMetier('NOT_FOUND')
  return maison
}

/** Consultation — réservée au cercle (HOUSE §5 : un visiteur ne voit rien). */
export async function maison(): Promise<Resultat<VueMaison>> {
  return executerAction('maison.voir', async () => {
    await requireUser('maison.voir')

    const enregistrement = await laMaison()

    return succes({
      id: enregistrement.id,
      nom: enregistrement.name,
      description: enregistrement.description,
      adresse: enregistrement.address,
      capaciteMax: enregistrement.capacityMax,
      photos: enregistrement.photos,
      couverture: couvertureEffective(
        enregistrement.photos,
        enregistrement.coverImage,
      ),
    })
  })
}

/** HOUSE-001 / HOUSE-R4 — Solenne seule renseigne la maison. */
export async function mettreAJourMaison(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('maison.mettreAJour', async () => {
    const solenne = await requireRole('ADMIN', 'maison.mettreAJour')

    const validation = validerEntree(schemaInformations, entree)
    if (!validation.ok) return validation
    const donnees = validation.data

    const avant = await laMaison()

    const apres = {
      name: donnees.nom,
      description: donnees.description?.trim() ? donnees.description.trim() : null,
      address: donnees.adresse?.trim() ? donnees.adresse.trim() : null,
    }

    await db.house.update({ where: { id: avant.id }, data: apres })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'maison.modification',
      entite: 'House',
      entiteId: avant.id,
      avant: {
        name: avant.name,
        description: avant.description,
        address: avant.address,
      },
      apres,
    })

    return succes()
  })
}

/**
 * Écriture d'une galerie recalculée.
 *
 * Lecture et écriture dans la même transaction sérialisable : deux
 * téléversements simultanés ne peuvent pas s'écraser l'un l'autre (C6). Un
 * conflit remonte en `CONFLICT`, pas en incident technique.
 */
async function modifierGalerie(
  acteurId: string,
  action: string,
  calculer: (maison: {
    readonly photos: string[]
    readonly coverImage: string | null
  }) => {
    readonly photos: readonly string[]
    readonly coverImage: string | null
  },
): Promise<void> {
  const trace = await db.$transaction(
    async (transaction) => {
      const avant = await laMaison(transaction)
      const apres = calculer(avant)

      await transaction.house.update({
        where: { id: avant.id },
        data: { photos: [...apres.photos], coverImage: apres.coverImage },
      })

      await journaliserAudit(
        {
          acteurId,
          action,
          entite: 'House',
          entiteId: avant.id,
          avant: { photos: avant.photos, coverImage: avant.coverImage },
          apres: { photos: apres.photos, coverImage: apres.coverImage },
        },
        transaction,
      )

      return { avant: avant.photos, apres: apres.photos }
    },
    { isolationLevel: 'Serializable' },
  )

  // Les fichiers ne partent qu'une fois la base d'accord : l'inverse laisserait
  // une galerie pointant vers des images effacées.
  for (const url of trace.avant) {
    if (!trace.apres.includes(url)) await supprimerImage(url)
  }
}

/** HOUSE-011 — téléversement d'une photo de la maison. */
export async function televerserPhotoMaison(
  fichier: unknown,
): Promise<Resultat<{ url: string }>> {
  return executerAction('maison.televerserPhoto', async () => {
    const solenne = await requireRole('ADMIN', 'maison.televerserPhoto')

    if (!(fichier instanceof File)) throw new ErreurMetier('FILE_NOT_IMAGE')

    const image = await stockerPhoto(fichier)

    try {
      await modifierGalerie(solenne.id, 'maison.photoAjoutee', (avant) => ({
        photos: ajouterPhoto(avant.photos, image.url),
        coverImage: avant.coverImage,
      }))
    } catch (erreur) {
      // Galerie pleine ou écriture concurrente : le fichier déjà rangé n'a
      // plus de raison d'être.
      await supprimerImage(image.url)
      throw erreur
    }

    return succes({ url: image.url })
  })
}

/** HOUSE-011 — désignation de la photo d'accueil. */
export async function definirCouverture(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('maison.definirCouverture', async () => {
    const solenne = await requireRole('ADMIN', 'maison.definirCouverture')

    const validation = validerEntree(schemaUrlPhoto, entree)
    if (!validation.ok) return validation
    const { url } = validation.data

    await modifierGalerie(solenne.id, 'maison.couverture', (avant) => {
      if (!avant.photos.includes(url)) throw new ErreurMetier('NOT_FOUND')
      return { photos: avant.photos, coverImage: url }
    })

    return succes()
  })
}

/** HOUSE-011 — retrait d'une photo, fichier compris. */
export async function retirerPhotoMaison(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('maison.retirerPhoto', async () => {
    const solenne = await requireRole('ADMIN', 'maison.retirerPhoto')

    const validation = validerEntree(schemaUrlPhoto, entree)
    if (!validation.ok) return validation
    const { url } = validation.data

    await modifierGalerie(solenne.id, 'maison.photoRetiree', (avant) => {
      const photos = retirerPhoto(avant.photos, url)
      return {
        photos,
        // La couverture retirée redevient indéfinie : la première photo prend
        // le relais à l'affichage.
        coverImage: avant.coverImage === url ? null : avant.coverImage,
      }
    })

    return succes()
  })
}

// ---------------------------------------------------------------------------
// La capacité (HOUSE-R1 → R3)
// ---------------------------------------------------------------------------

export interface PeriodeConcernee {
  readonly id: string
  readonly qui: string
  readonly du: Date
  readonly au: Date
  readonly personnes: number
}

export interface AnalyseCapacite {
  readonly capaciteActuelle: number
  readonly capaciteVisee: number
  /** Faux si des séjours confirmés dépassent déjà la capacité visée. */
  readonly compatible: boolean
  /** Première journée en dépassement, celle que le refus nomme. */
  readonly premierDepassement: JourOccupe | null
  readonly pic: JourOccupe | null
  readonly sejoursEnCause: readonly PeriodeConcernee[]
  readonly demandesDevenuesIncompatibles: readonly PeriodeConcernee[]
  readonly demandesRedevenuesPossibles: readonly PeriodeConcernee[]
}

/**
 * Effet qu'aurait un changement de capacité, avant de le décider.
 *
 * Réservé à Solenne : la liste nomme les personnes concernées, ce qu'un ami ne
 * doit jamais lire (D4).
 */
async function analyserCapacite(
  capaciteVisee: number,
  laMaisonCourante: { readonly capacityMax: number },
): Promise<AnalyseCapacite> {
  const aPartirDe = debutDeJour(new Date())

  // Le passé ne se rattrape pas : une réduction de capacité ne peut pas être
  // refusée à cause d'un séjour déjà terminé.
  const presences = await toutesLesPresences(db, { aPartirDe })

  const enCause = presencesConcernees(presences, capaciteVisee)
  const sejours =
    enCause.length === 0
      ? []
      : await db.stay.findMany({
          where: { id: { in: enCause.map((p) => p.reference) } },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            adults: true,
            children: true,
            user: { select: { firstName: true } },
          },
          orderBy: { startDate: 'asc' },
        })

  const demandes = await db.stayRequest.findMany({
    where: {
      status: { in: ['PENDING', 'REJECTED'] },
      departureDate: { gt: aPartirDe },
    },
    select: {
      id: true,
      status: true,
      arrivalDate: true,
      departureDate: true,
      adults: true,
      children: true,
      requester: { select: { firstName: true } },
    },
    orderBy: { arrivalDate: 'asc' },
  })

  const decrire = (demande: (typeof demandes)[number]): PeriodeConcernee => ({
    id: demande.id,
    qui: demande.requester.firstName,
    du: demande.arrivalDate,
    au: demande.departureDate,
    personnes: demande.adults + demande.children,
  })

  const tient = (
    demande: (typeof demandes)[number],
    capacite: number,
  ): boolean =>
    tientDansLaCapacite(presences, capacite, {
      arrivee: demande.arrivalDate,
      depart: demande.departureDate,
      personnes: demande.adults + demande.children,
    })

  const depassements = joursAuDela(presences, capaciteVisee)

  return {
    capaciteActuelle: laMaisonCourante.capacityMax,
    capaciteVisee,
    compatible: depassements.length === 0,
    premierDepassement: depassements[0] ?? null,
    pic: occupationMaximale(presences),
    sejoursEnCause: sejours.map((sejour) => ({
      id: sejour.id,
      qui: sejour.user.firstName,
      du: sejour.startDate,
      au: sejour.endDate,
      personnes: sejour.adults + sejour.children,
    })),
    // HOUSE-R3 : ce que la nouvelle capacité casse…
    demandesDevenuesIncompatibles: demandes
      .filter(
        (demande) =>
          demande.status === 'PENDING' &&
          tient(demande, laMaisonCourante.capacityMax) &&
          !tient(demande, capaciteVisee),
      )
      .map(decrire),
    // …et ce qu'elle rouvre (HOUSE-009).
    demandesRedevenuesPossibles: demandes
      .filter(
        (demande) =>
          demande.status === 'REJECTED' &&
          !tient(demande, laMaisonCourante.capacityMax) &&
          tient(demande, capaciteVisee),
      )
      .map(decrire),
  }
}

/** Lecture seule : ce qui se passerait si la capacité passait à cette valeur. */
export async function impactCapacite(
  entree: unknown,
): Promise<Resultat<AnalyseCapacite>> {
  return executerAction('maison.impactCapacite', async () => {
    await requireRole('ADMIN', 'maison.impactCapacite')

    const validation = validerEntree(
      z.object({ capacite: schemaCapacite }),
      entree,
    )
    if (!validation.ok) return validation

    return succes(
      await analyserCapacite(validation.data.capacite, await laMaison()),
    )
  })
}

/**
 * HOUSE-002 / R1 / R2 / R3 — changement de capacité.
 *
 * Le refus de HOUSE-R2 ne se contente pas d'un « impossible » : il nomme la
 * journée et le nombre de personnes attendues, pour que Solenne sache quoi
 * annuler. La liste complète est dans `impactCapacite`.
 */
export async function mettreAJourCapacite(entree: unknown): Promise<
  Resultat<{
    readonly demandesDevenuesIncompatibles: readonly PeriodeConcernee[]
    readonly demandesRedevenuesPossibles: readonly PeriodeConcernee[]
  }>
> {
  return executerAction('maison.capacite', async () => {
    const solenne = await requireRole('ADMIN', 'maison.capacite')

    const validation = validerEntree(
      z.object({ capacite: schemaCapacite }),
      entree,
    )
    if (!validation.ok) return validation
    const { capacite } = validation.data

    const laMaisonCourante = await laMaison()
    const analyse = await analyserCapacite(capacite, laMaisonCourante)

    if (!analyse.compatible) {
      const premier = analyse.premierDepassement
      throw new ErreurMetier('CAPACITY_BELOW_OCCUPANCY', {
        parametres: {
          n: premier?.personnes ?? 0,
          jour: premier ? formaterJourLong(premier.jour) : '',
          max: capacite,
        },
      })
    }

    await db.house.update({
      where: { id: laMaisonCourante.id },
      data: { capacityMax: capacite },
    })

    await journaliserAudit({
      acteurId: solenne.id,
      action: 'maison.capacite',
      entite: 'House',
      entiteId: laMaisonCourante.id,
      avant: { capacityMax: analyse.capaciteActuelle },
      apres: { capacityMax: capacite },
      details: {
        demandesDevenuesIncompatibles: analyse.demandesDevenuesIncompatibles.map(
          (d) => d.id,
        ),
        demandesRedevenuesPossibles: analyse.demandesRedevenuesPossibles.map(
          (d) => d.id,
        ),
      },
    })

    return succes({
      demandesDevenuesIncompatibles: analyse.demandesDevenuesIncompatibles,
      demandesRedevenuesPossibles: analyse.demandesRedevenuesPossibles,
    })
  })
}

/** HOUSE-014 — l'ordre de la galerie, tel que Solenne l'a arrangé. */
export async function reordonnerGalerie(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('maison.reordonnerGalerie', async () => {
    const solenne = await requireRole('ADMIN', 'maison.reordonnerGalerie')

    const validation = validerEntree(schemaOrdre, entree)
    if (!validation.ok) return validation
    const { urls } = validation.data

    await modifierGalerie(solenne.id, 'maison.ordreGalerie', (avant) => ({
      photos: reordonnerPhotos(avant.photos, urls),
      coverImage: avant.coverImage,
    }))

    return succes()
  })
}
