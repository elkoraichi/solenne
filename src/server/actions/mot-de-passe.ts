'use server'

import { schemaEmail } from '@/domain/core/email'
import { verifierPolitique } from '@/domain/core/mot-de-passe'
import { ErreurMetier, succes, type Resultat } from '@/domain/core/result'
import { validerEntree, z } from '@/domain/core/validation'
import { executerAction } from '@/server/actions/executer'
import { journaliserAudit } from '@/server/audit'
import {
  empreinteMotDePasse,
  motDePasseCorrespond,
} from '@/server/auth/empreinte'
import { requireUser } from '@/server/auth/garde'
import { creerJeton, empreinteJeton } from '@/server/auth/jetons'
import { fermerLesSessions } from '@/server/auth/session'
import { db } from '@/server/db'
import {
  enregistrerTentative,
  estBloque,
  oublierTentatives,
} from '@/server/limitation'
import { envoyerCourrier, lienAbsolu } from '@/server/notifications/courrier'

/**
 * Module `PWD` — récupération et changement de mot de passe.
 *
 * Trois invariants tiennent tout le module :
 *   · seule l'empreinte du jeton est stockée (PWD-R1) ;
 *   · un jeton vaut une heure et une seule utilisation (PWD-R2) ;
 *   · la réponse à une demande est la même que l'email existe ou non (PWD-R3).
 */

const VALIDITE_JETON_MS = 60 * 60 * 1000

const schemaDemande = z.object({ email: schemaEmail })

const schemaMotDePasse = z
  .string({ error: 'Le mot de passe est obligatoire.' })
  .min(1, { error: 'Le mot de passe est obligatoire.' })

const schemaReinitialisation = z.object({
  jeton: z
    .string({ error: 'Ce lien est incomplet.' })
    .min(1, { error: 'Ce lien est incomplet.' })
    .max(500),
  motDePasse: schemaMotDePasse,
})

const schemaChangement = z.object({
  ancien: schemaMotDePasse,
  nouveau: schemaMotDePasse,
})

/**
 * @public — demande de réinitialisation.
 *
 * Répond toujours de la même façon (PWD-R3, PWD-002, PWD-015) : ni l'existence
 * du compte, ni son état ne transparaissent.
 */
export async function demanderReinitialisation(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('pwd.demanderReinitialisation', async () => {
    const validation = validerEntree(schemaDemande, entree)
    if (!validation.ok) return validation

    const { email } = validation.data

    // PWD-016 : une rafale de demandes est étouffée, mais la réponse ne change
    // pas — sinon la limitation elle-même trahirait l'existence du compte.
    const verdict = await estBloque('reinitialisation', email)
    await enregistrerTentative('reinitialisation', email)
    if (!verdict.autorise) return succes()

    const utilisateur = await db.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, status: true, anonymizedAt: true },
    })

    if (
      !utilisateur ||
      utilisateur.status !== 'ACTIVE' ||
      utilisateur.anonymizedAt !== null
    ) {
      return succes()
    }

    // PWD-017 : une nouvelle demande tue les jetons précédents.
    await db.passwordResetToken.deleteMany({
      where: { userId: utilisateur.id, usedAt: null },
    })

    const jeton = creerJeton()
    await db.passwordResetToken.create({
      data: {
        userId: utilisateur.id,
        tokenHash: empreinteJeton(jeton),
        expiresAt: new Date(Date.now() + VALIDITE_JETON_MS),
      },
    })

    await envoyerCourrier({
      destinataire: email,
      sujet: 'Réinitialiser votre mot de passe',
      texte: [
        `Bonjour ${utilisateur.firstName},`,
        '',
        'Vous avez demandé à choisir un nouveau mot de passe.',
        'Le lien ci-dessous est valable une heure et ne fonctionne qu’une fois.',
        '',
        'Si ce n’est pas vous, ignorez ce message : rien ne change.',
      ].join('\n'),
      lien: lienAbsolu(`/mot-de-passe/${jeton}`),
    })

    return succes()
  })
}

/** @public — réinitialisation avec un jeton reçu par email. */
export async function reinitialiserMotDePasse(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('pwd.reinitialiserMotDePasse', async () => {
    const validation = validerEntree(schemaReinitialisation, entree)
    if (!validation.ok) return validation

    const { jeton, motDePasse } = validation.data

    const enregistrement = await db.passwordResetToken.findUnique({
      where: { tokenHash: empreinteJeton(jeton) },
      include: {
        user: {
          select: { id: true, email: true, passwordHash: true, status: true },
        },
      },
    })

    // PWD-007 / PWD-008 : jeton inventé ou appartenant à un autre compte —
    // dans les deux cas, il n'existe simplement pas ici.
    if (!enregistrement) throw new ErreurMetier('INVALID_TOKEN')
    if (enregistrement.usedAt) throw new ErreurMetier('INVALID_TOKEN')
    if (enregistrement.expiresAt.getTime() <= Date.now()) {
      throw new ErreurMetier('RESET_LINK_EXPIRED')
    }
    if (enregistrement.user.status !== 'ACTIVE') {
      throw new ErreurMetier('INVALID_TOKEN')
    }

    verifierPolitique(motDePasse)

    if (
      enregistrement.user.passwordHash &&
      (await motDePasseCorrespond(enregistrement.user.passwordHash, motDePasse))
    ) {
      throw new ErreurMetier('PASSWORD_SAME_AS_OLD')
    }

    const empreinte = await empreinteMotDePasse(motDePasse)
    const utilisateurId = enregistrement.user.id

    await db.$transaction(async (transaction) => {
      // Consommation du jeton conditionnée à son état : deux requêtes
      // simultanées ne peuvent pas l'utiliser toutes les deux.
      const consomme = await transaction.passwordResetToken.updateMany({
        where: { id: enregistrement.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (consomme.count === 0) throw new ErreurMetier('INVALID_TOKEN')

      await transaction.user.update({
        where: { id: utilisateurId },
        data: { passwordHash: empreinte },
      })

      await journaliserAudit(
        {
          acteurId: utilisateurId,
          action: 'pwd.reinitialisation',
          entite: 'User',
          entiteId: utilisateurId,
        },
        transaction,
      )
    })

    // PWD-R5 : reprendre la main sur un compte coupe tous les accès existants.
    await fermerLesSessions(utilisateurId)
    await db.passwordResetToken.deleteMany({
      where: { userId: utilisateurId, usedAt: null },
    })
    // Reprendre la main sur son compte lève le blocage de connexion : les
    // échecs qui ont mené jusqu'ici ne doivent pas condamner l'accès.
    await oublierTentatives('connexion', enregistrement.user.email)

    return succes()
  })
}

/** Changement de mot de passe depuis le profil — l'ancien est exigé (PWD-R6). */
export async function changerMotDePasse(
  entree: unknown,
): Promise<Resultat<null>> {
  return executerAction('pwd.changerMotDePasse', async () => {
    const utilisateur = await requireUser('pwd.changerMotDePasse')

    const validation = validerEntree(schemaChangement, entree)
    if (!validation.ok) return validation

    const { ancien, nouveau } = validation.data

    const compte = await db.user.findUniqueOrThrow({
      where: { id: utilisateur.id },
      select: { passwordHash: true },
    })

    if (
      !compte.passwordHash ||
      !(await motDePasseCorrespond(compte.passwordHash, ancien))
    ) {
      throw new ErreurMetier('WRONG_PASSWORD')
    }

    verifierPolitique(nouveau)

    if (await motDePasseCorrespond(compte.passwordHash, nouveau)) {
      throw new ErreurMetier('PASSWORD_SAME_AS_OLD')
    }

    await db.user.update({
      where: { id: utilisateur.id },
      data: { passwordHash: await empreinteMotDePasse(nouveau) },
    })

    // PWD-013 : les autres appareils sont déconnectés, celui-ci reste ouvert.
    await fermerLesSessions(utilisateur.id, { sauf: utilisateur.sessionId })

    await journaliserAudit({
      acteurId: utilisateur.id,
      action: 'pwd.changement',
      entite: 'User',
      entiteId: utilisateur.id,
    })

    return succes()
  })
}
