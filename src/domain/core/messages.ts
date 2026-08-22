import { CODES, type CodeErreur } from './error-codes'

/**
 * Catalogue centralisé des messages utilisateur.
 *
 * CORE-R2 : tout message est en français, explique ce qui s'est passé et ce que
 * la personne peut faire.
 * CORE-012 : chaque code possède une entrée ; aucun message n'est écrit en dur
 * ailleurs dans le code.
 *
 * Les gabarits acceptent des paramètres nommés entre accolades : `{n}`, `{max}`.
 */
export const CATALOGUE_MESSAGES: Readonly<Record<CodeErreur, string>> = {
  // --- Les 11 refus métier du §12.4, au mot près ---
  BLOCKED_PERIOD: 'Ces dates ne sont pas disponibles.',
  // PRIV-005 / PRIV-S12 : le §12.4 écrivait « La maison serait à {n} personnes
  // pour {max} places ». Ce message est destiné à un **ami** : les deux nombres
  // lui apprennent combien de personnes occupent déjà la maison — y compris
  // celles d'un séjour caché, qu'il n'a pas le droit de deviner (PRIV-R5, R6).
  // Le refus reste le même, il ne se justifie plus. Le détail chiffré revient à
  // `STAYDEC` (lot 3), sur l'écran de Solenne, où il est légitime.
  CAPACITY_EXCEEDED:
    'La maison n’a plus assez de place sur ces dates. Essayez d’autres dates.',
  EXCLUSIVE_CONFLICT: 'La maison est déjà privatisée sur ces dates.',
  // « Occupée », et non « un séjour » : depuis `AVAIL-031`, un événement suffit
  // à refuser une privatisation. Dire lequel des deux reviendrait à décrire à un
  // ami ce qui se passe dans la maison — D4 ne le permet pas.
  EXCLUSIVE_REQUEST_CONFLICT:
    'La maison est déjà occupée sur ces dates : la privatisation n’est pas possible.',
  EVENT_OVERLAP: 'Un autre événement est déjà prévu sur ce créneau.',
  MIN_LEAD_TIME: 'Il faut demander au moins {n} h à l’avance.',
  MAX_ADVANCE: 'Les demandes sont possibles jusqu’à {n} jours à l’avance.',
  MAX_DURATION: 'Un séjour ne peut pas dépasser {n} nuits.',
  FORBIDDEN_WEEKDAY: 'Les arrivées ne sont pas possibles ce jour-là.',
  INVALID_DATES: 'La date de départ doit être après la date d’arrivée.',
  PAST_DATES: 'Ces dates sont déjà passées.',

  // --- Refus transverses ---
  UNAUTHENTICATED:
    'Votre session a expiré. Reconnectez-vous pour continuer.',
  FORBIDDEN: 'Cette page n’est pas accessible avec votre compte.',
  NOT_FOUND: 'Cette page n’existe pas ou n’est plus disponible.',
  VALIDATION: 'Certaines informations sont incomplètes ou incorrectes.',
  DUPLICATE_EMAIL: 'Cet email est déjà utilisé.',
  CONFLICT:
    'Quelqu’un vient de modifier ces informations. Rechargez la page et réessayez.',
  RATE_LIMITED: 'Trop de tentatives. Réessayez dans quelques minutes.',
  ACCOUNT_DISABLED:
    'Ce compte n’est plus actif. Contactez Solenne si c’est une erreur.',
  INVALID_TOKEN:
    'Ce lien n’est plus valable. Demandez-en un nouveau pour continuer.',
  INTERNAL:
    'Une erreur est survenue. Votre demande n’a pas été enregistrée. Vous pouvez réessayer.',

  // --- Identité (lot 1) ---
  // AUTH-R3 : la réponse est la même que l'email existe, n'existe pas, ou que
  // le compte soit désactivé. Ne jamais dériver de message plus précis d'ici.
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit faire au moins 10 caractères.',
  PASSWORD_TOO_COMMON:
    'Ce mot de passe est trop courant. Choisissez-en un moins prévisible.',
  PASSWORD_SAME_AS_OLD:
    'Choisissez un mot de passe différent de l’ancien.',
  WRONG_PASSWORD: 'L’ancien mot de passe est incorrect.',
  RESET_LINK_EXPIRED:
    'Ce lien a expiré. Vous pouvez recommencer la demande de réinitialisation.',
  INVITATION_EXPIRED:
    'Cette invitation a expiré. Demandez-en une nouvelle à Solenne.',
  INVITATION_USED: 'Cette invitation a déjà été utilisée.',
  INVITATION_PENDING:
    'Une invitation est déjà en cours pour cet email. Vous pouvez la relancer.',
  EMAIL_ALREADY_MEMBER: 'Cette personne a déjà un compte.',
  ACCOUNT_DISABLED_REACTIVATE:
    'Ce compte existe mais il est désactivé. Réactivez-le plutôt que d’inviter à nouveau.',
  SELF_DEACTIVATION: 'Vous ne pouvez pas désactiver votre propre compte.',
  SELF_DELETION: 'Vous ne pouvez pas supprimer votre propre compte.',
  LAST_ADMIN: 'Il doit rester au moins une administratrice.',
  UPCOMING_STAYS:
    'Cette personne a {n} séjour(s) à venir. Confirmez pour continuer.',
  FILE_TOO_LARGE: 'Cette image dépasse {max} Mo.',
  FILE_NOT_IMAGE: 'Ce fichier n’est pas une image.',

  // --- La maison (lot 2) ---
  TOO_MANY_PHOTOS:
    'La galerie est limitée à {max} photos. Retirez-en une avant d’en ajouter.',
  CAPACITY_BELOW_OCCUPANCY:
    'La maison accueille déjà {n} personnes le {jour}. Annulez ou réduisez ces séjours avant de descendre à {max} places.',
  BLOCKED_OVER_STAY:
    'Un séjour confirmé occupe ces dates : {qui}, {periode}. Annulez-le avant de bloquer la période.',
}

/**
 * Les mêmes refus, **chiffrés, pour l'écran de Solenne seule**.
 *
 * PRIV-005 a retiré les nombres du message destiné à un ami : ils lui
 * apprendraient combien de personnes occupent la maison, y compris celles d'un
 * séjour qu'il n'a pas le droit de voir. Solenne, elle, a besoin du chiffre
 * pour trancher. Les deux versions vivent ici côte à côte plutôt que dispersées
 * dans les modules (CORE-012) ; c'est l'appelant qui choisit son public, et
 * jamais l'écran qui masque après coup (règle non négociable n°4).
 *
 * Un code absent de cette table n'a rien de plus à dire à Solenne qu'à un ami.
 */
export const CATALOGUE_DETAILS: Readonly<Partial<Record<CodeErreur, string>>> = {
  CAPACITY_EXCEEDED: 'La maison serait à {n} personnes pour {max} places.',
}

export type ParametresMessage = Readonly<Record<string, string | number>>

function substituer(gabarit: string, parametres?: ParametresMessage): string {
  if (!parametres) return gabarit

  return gabarit.replace(/\{(\w+)\}/g, (correspondance, cle: string) => {
    const valeur = parametres[cle]
    return valeur === undefined ? correspondance : String(valeur)
  })
}

/**
 * Rend le message d'un code, paramètres substitués.
 * Un paramètre manquant laisse le gabarit visible plutôt que d'afficher
 * « undefined » — le défaut se voit immédiatement en test.
 */
export function messagePour(
  code: CodeErreur,
  parametres?: ParametresMessage,
): string {
  return substituer(CATALOGUE_MESSAGES[code], parametres)
}

/** La version chiffrée quand elle existe, le message ordinaire sinon. */
export function messageDetaille(
  code: CodeErreur,
  parametres?: ParametresMessage,
): string {
  return substituer(CATALOGUE_DETAILS[code] ?? CATALOGUE_MESSAGES[code], parametres)
}

/** Vrai si chaque code possède une entrée non vide (CORE-012). */
export function catalogueComplet(): boolean {
  return CODES.every((code) => {
    const message = CATALOGUE_MESSAGES[code]
    return typeof message === 'string' && message.trim().length > 0
  })
}
