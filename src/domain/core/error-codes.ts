/**
 * Codes d'erreur stables.
 *
 * Les codes servent aux tests et au code ; les messages, aux humains
 * (Mode Operatoire.md §12.4). Un code ne change jamais de nom une fois publié.
 */

/** Les 11 refus métier du §12.4. */
export const CODES_METIER = [
  'BLOCKED_PERIOD',
  'CAPACITY_EXCEEDED',
  'EXCLUSIVE_CONFLICT',
  'EXCLUSIVE_REQUEST_CONFLICT',
  'EVENT_OVERLAP',
  'MIN_LEAD_TIME',
  'MAX_ADVANCE',
  'MAX_DURATION',
  'FORBIDDEN_WEEKDAY',
  'INVALID_DATES',
  'PAST_DATES',
] as const

/** Refus transverses : permissions, validation, incidents techniques. */
export const CODES_TRANSVERSES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'DUPLICATE_EMAIL',
  'CONFLICT',
  'RATE_LIMITED',
  'ACCOUNT_DISABLED',
  'INVALID_TOKEN',
  'INTERNAL',
] as const

/** Refus propres à l'identité — lot 1 (`AUTH`, `PWD`, `INVITE`, `PROFILE`, `USERS`). */
export const CODES_IDENTITE = [
  'INVALID_CREDENTIALS',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_COMMON',
  'PASSWORD_SAME_AS_OLD',
  'WRONG_PASSWORD',
  'RESET_LINK_EXPIRED',
  'INVITATION_EXPIRED',
  'INVITATION_USED',
  'INVITATION_PENDING',
  'EMAIL_ALREADY_MEMBER',
  'ACCOUNT_DISABLED_REACTIVATE',
  'SELF_DEACTIVATION',
  'SELF_DELETION',
  'LAST_ADMIN',
  'UPCOMING_STAYS',
  'FILE_TOO_LARGE',
  'FILE_NOT_IMAGE',
] as const

/** Refus propres à la maison — lot 2 (`HOUSE`, `SPACE`, `BLOCK`). */
export const CODES_MAISON = [
  'TOO_MANY_PHOTOS',
  'CAPACITY_BELOW_OCCUPANCY',
  'BLOCKED_OVER_STAY',
] as const

/** Refus propres aux réglages de réservation — lot 3 (`POLICY`). */
export const CODES_POLICY = [
  'MAX_PARTY_SIZE',
  'POLICY_UNREACHABLE',
  'MAX_PARTY_ABOVE_CAPACITY',
] as const

/** Refus propres à la demande de séjour — lot 3 (`STAYREQ`). */
export const CODES_STAYREQ = [
  'AT_LEAST_ONE_GUEST',
  'GUEST_COUNT_MISMATCH',
  'RULES_NOT_ACCEPTED',
  'REQUEST_ALREADY_DECIDED',
] as const

/** Refus propres à la décision de Solenne — lot 3 (`STAYDEC`). */
export const CODES_STAYDEC = [
  'REQUEST_CANCELLED',
  'DECISION_CONFLICT_UNCONFIRMED',
] as const

export const CODES = [
  ...CODES_METIER,
  ...CODES_TRANSVERSES,
  ...CODES_IDENTITE,
  ...CODES_MAISON,
  ...CODES_POLICY,
  ...CODES_STAYREQ,
  ...CODES_STAYDEC,
] as const

export type CodeMetier = (typeof CODES_METIER)[number]
export type CodeTransverse = (typeof CODES_TRANSVERSES)[number]
export type CodeIdentite = (typeof CODES_IDENTITE)[number]
export type CodeMaison = (typeof CODES_MAISON)[number]
export type CodePolicy = (typeof CODES_POLICY)[number]
export type CodeStayReq = (typeof CODES_STAYREQ)[number]
export type CodeStayDec = (typeof CODES_STAYDEC)[number]
export type CodeErreur = (typeof CODES)[number]

const TOUS = new Set<string>(CODES)

export function estCodeErreur(valeur: unknown): valeur is CodeErreur {
  return typeof valeur === 'string' && TOUS.has(valeur)
}
