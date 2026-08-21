-- Retour arrière de `lot1_identite` (SETUP-007).

DROP TABLE IF EXISTS "rate_limit_hits" CASCADE;
DROP TABLE IF EXISTS "email_change_requests" CASCADE;

DROP INDEX IF EXISTS "sessions_expires_idx";

ALTER TABLE "users" DROP COLUMN IF EXISTS "anonymized_at";

ALTER TABLE "sessions" DROP COLUMN IF EXISTS "user_agent";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "last_used_at";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "ip";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "created_at";
