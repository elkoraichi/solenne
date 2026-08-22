'use server'

import { debutDeJour } from '@/domain/core/dates'
import { succes, type Resultat } from '@/domain/core/result'
import {
  schemaIdentifiant as identifiant,
  schemaJour,
  validerEntree,
  z,
} from '@/domain/core/validation'
import type { Periode } from '@/domain/house/blocages'
import {
  niveauParDefaut,
  NIVEAUX_VISIBILITE,
  vueDesSejours,
  type NiveauVisibilite,
  type SejourDetaille,
  type SejourVisible,
} from '@/domain/privacy/visibilite'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import { refusNeutre, requireRole, requireUser } from '@/server/auth/garde'
import {
  chargerSejour,
  chargerSejours,
  visibiliteParDefaut,
} from '@/server/confidentialite'
import { db } from '@/server/db'

/**
 * Module `PRIV` — la confidentialité des séjours (décision **D4**).
 *
 * Trois lectures **séparées**, jamais une seule assortie d'un `if` :
 *   · `occupationDuCercle()` — ce qu'un ami reçoit. Des bandes « Maison
 *     occupée », ses propres séjours, ses propres demandes.
 *   · `sejoursDetailles()` — réservée à Solenne. Tout, sans exception.
 *   · `sejour({ id })` — un séjour précis, pour son propriétaire ou pour
 *     Solenne. Refus neutre pour tous les autres (PRIV-S03).
 *
 * La leçon du module `BLOCK` est reprise telle quelle : **la confidentialité
 * ne se filtre pas, elle se sépare**. Une fonction unique avec un `if` sur le
 * rôle finit toujours par laisser passer un champ le jour où on l'étend.
 *
 * Même si Solenne appelle `occupationDuCercle()`, elle reçoit la vue du cercle.
 * Le refus par défaut vaut aussi dans ce sens-là : c'est l'action qui décide de
 * ce qu'elle envoie, pas l'appelant de ce qu'il mérite.
 */

const schemaFenetre = z
  .object({ du: schemaJour.optional(), au: schemaJour.optional() })
  .optional()

const schemaNiveau = z.object({
  niveau: z.enum(NIVEAUX_VISIBILITE, {
    error: 'Ce niveau de visibilité n’existe pas.',
  }),
})

const schemaSejourEtNiveau = schemaNiveau.extend({ id: identifiant })

/**
 * Une demande à moi, encore en attente de réponse.
 *
 * Une demande acceptée est devenue un séjour : la montrer deux fois ferait
 * croire à deux venues. Une demande refusée ou annulée n'occupe plus rien.
 */
export interface DemandeAMoi {
  readonly id: string
  readonly du: Date
  readonly au: Date
  readonly personnes: number
}

export interface AgendaDuCercle {
  /** PRIV-R1 — « Maison occupée », fusionné, sans décompte ni nom. */
  readonly occupations: readonly Periode[]
  /** Les séjours qu'on a le droit de nommer : les miens, et les séjours `FULL`. */
  readonly sejours: readonly SejourVisible[]
  /** PRIV-R4 / PRIV-009 — les miennes seulement. */
  readonly mesDemandes: readonly DemandeAMoi[]
}

export interface ReglagesConfidentialite {
  /** Le niveau des prochains séjours du cercle — réglable (PRIV-010). */
  readonly defaut: NiveauVisibilite
  /** Celui des séjours de Solenne : plus visible, et non réglable globalement. */
  readonly defautSolenne: NiveauVisibilite
}

// ---------------------------------------------------------------------------
// Lecture — le cercle
// ---------------------------------------------------------------------------

/**
 * PRIV-001 — ce qu'un ami reçoit de l'occupation de la maison.
 *
 * La fenêtre par défaut commence aujourd'hui : le passé n'intéresse personne et
 * n'a pas à circuler.
 */
export async function occupationDuCercle(
  entree?: unknown,
): Promise<Resultat<AgendaDuCercle>> {
  return executerAction('confidentialite.occupation', async () => {
    const utilisateur = await requireUser('confidentialite.occupation')

    const validation = validerEntree(schemaFenetre, entree)
    if (!validation.ok) return validation
    const fenetre = validation.data ?? {}

    const depuis = fenetre.du ?? debutDeJour(new Date())

    const [sejours, demandes] = await Promise.all([
      chargerSejours(db, { du: depuis, au: fenetre.au }),
      db.stayRequest.findMany({
        where: {
          requesterId: utilisateur.id,
          status: 'PENDING',
          departureDate: { gt: depuis },
          ...(fenetre.au ? { arrivalDate: { lt: fenetre.au } } : {}),
        },
        select: {
          id: true,
          arrivalDate: true,
          departureDate: true,
          adults: true,
          children: true,
        },
        orderBy: { arrivalDate: 'asc' },
      }),
    ])

    const vue = vueDesSejours(sejours, {
      id: utilisateur.id,
      // Le cercle reçoit la vue du cercle, Solenne comprise.
      estAdministratrice: false,
    })

    return succes({
      occupations: vue.occupations,
      sejours: vue.sejours,
      mesDemandes: demandes.map((demande) => ({
        id: demande.id,
        du: demande.arrivalDate,
        au: demande.departureDate,
        personnes: demande.adults + demande.children,
      })),
    })
  })
}

// ---------------------------------------------------------------------------
// Lecture — Solenne
// ---------------------------------------------------------------------------

/** PRIV-002 / PRIV-R3 — Solenne voit tout, y compris les séjours cachés. */
export async function sejoursDetailles(
  entree?: unknown,
): Promise<Resultat<readonly SejourDetaille[]>> {
  return executerAction('confidentialite.sejours', async () => {
    const solenne = await requireRole('ADMIN', 'confidentialite.sejours')

    const validation = validerEntree(schemaFenetre, entree)
    if (!validation.ok) return validation
    const fenetre = validation.data ?? {}

    const sejours = await chargerSejours(db, fenetre)
    const vue = vueDesSejours(sejours, {
      id: solenne.id,
      estAdministratrice: true,
    })

    return succes(vue.sejours as readonly SejourDetaille[])
  })
}

/**
 * PRIV-S03 / PRIV-S08 — un séjour précis.
 *
 * Séjour inexistant et séjour d'autrui donnent **le même** refus : sans cela,
 * comparer deux messages suffirait à savoir quels identifiants existent. Les
 * identifiants sont des `cuid`, non séquentiels : il n'y a rien à parcourir.
 *
 * Cette lecture est la porte que `STAY` (lot 3.6) et `CAL` franchiront. Elle
 * est écrite ici parce que la règle qu'elle porte appartient à `PRIV`.
 */
export async function sejour(entree: unknown): Promise<Resultat<SejourDetaille>> {
  return executerAction('confidentialite.sejour', async () => {
    const utilisateur = await requireUser('confidentialite.sejour')

    const validation = validerEntree(z.object({ id: identifiant }), entree)
    if (!validation.ok) return validation

    const trouve = await chargerSejour(db, validation.data.id)

    const estAdministratrice = utilisateur.role === 'ADMIN'
    if (
      !trouve ||
      (!estAdministratrice && trouve.proprietaireId !== utilisateur.id)
    ) {
      refusNeutre()
    }

    const vue = vueDesSejours([trouve], {
      id: utilisateur.id,
      estAdministratrice,
    })

    const detail = vue.sejours[0]
    if (!detail || detail.nature !== 'COMPLET') refusNeutre()

    return succes(detail)
  })
}

// ---------------------------------------------------------------------------
// Réglages — Solenne seule
// ---------------------------------------------------------------------------

export async function reglagesConfidentialite(): Promise<
  Resultat<ReglagesConfidentialite>
> {
  return executerAction('confidentialite.reglages', async () => {
    await requireRole('ADMIN', 'confidentialite.reglages')
    return succes({
      defaut: await visibiliteParDefaut(),
      defautSolenne: niveauParDefaut({ estSejourDeSolenne: true }),
    })
  })
}

/**
 * PRIV-010 — le niveau que prendront les **nouveaux** séjours du cercle.
 *
 * Les séjours de Solenne n'en dépendent pas : ils partent plus visibles, et
 * elle les ajuste un par un. Ce réglage-ci ne parle que de ses invités.
 *
 * Les séjours existants gardent le leur : changer un réglage ne réécrit pas le
 * passé, sinon un séjour accepté sous promesse de discrétion deviendrait
 * public d'un clic.
 */
export async function definirVisibiliteParDefaut(
  entree: unknown,
): Promise<Resultat<ReglagesConfidentialite>> {
  return executerAction('confidentialite.defaut', async () => {
    const solenne = await requireRole('ADMIN', 'confidentialite.defaut')

    const validation = validerEntree(schemaNiveau, entree)
    if (!validation.ok) return validation
    const { niveau } = validation.data

    await db.$transaction(
      async (transaction) => {
        const maison = await transaction.house.findFirst({
          orderBy: { createdAt: 'asc' },
        })
        if (!maison) refusNeutre()

        const avant = await transaction.bookingSettings.findUnique({
          where: { houseId: maison.id },
          select: { defaultStayPrivacy: true },
        })

        await transaction.bookingSettings.upsert({
          where: { houseId: maison.id },
          create: { houseId: maison.id, defaultStayPrivacy: niveau },
          update: { defaultStayPrivacy: niveau },
        })

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'confidentialite.defaut',
            entite: 'BookingSettings',
            entiteId: maison.id,
            avant: { defaultStayPrivacy: avant?.defaultStayPrivacy ?? null },
            apres: { defaultStayPrivacy: niveau },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes({
      defaut: niveau,
      defautSolenne: niveauParDefaut({ estSejourDeSolenne: true }),
    })
  })
}

/** PRIV-011 — ajuster un séjour, et lui seul. */
export async function definirVisibiliteSejour(
  entree: unknown,
): Promise<Resultat<{ readonly niveau: NiveauVisibilite }>> {
  return executerAction('confidentialite.sejour.niveau', async () => {
    const solenne = await requireRole('ADMIN', 'confidentialite.sejour.niveau')

    const validation = validerEntree(schemaSejourEtNiveau, entree)
    if (!validation.ok) return validation
    const { id, niveau } = validation.data

    await db.$transaction(
      async (transaction) => {
        const avant = await transaction.stay.findUnique({
          where: { id },
          select: { id: true, privacyLevel: true },
        })
        if (!avant) refusNeutre()

        await transaction.stay.update({
          where: { id: avant.id },
          data: { privacyLevel: niveau },
        })

        await journaliserAudit(
          {
            acteurId: solenne.id,
            action: 'confidentialite.sejour',
            entite: 'Stay',
            entiteId: avant.id,
            avant: { privacyLevel: avant.privacyLevel },
            apres: { privacyLevel: niveau },
          },
          transaction,
        )
      },
      { isolationLevel: 'Serializable' },
    )

    return succes({ niveau })
  })
}
