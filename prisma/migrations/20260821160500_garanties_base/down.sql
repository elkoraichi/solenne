-- Retour arrière de `garanties_base` (SETUP-007).

DROP TRIGGER IF EXISTS "audit_logs_pas_de_troncature" ON "audit_logs";
DROP TRIGGER IF EXISTS "audit_logs_pas_de_modification" ON "audit_logs";
DROP FUNCTION IF EXISTS "audit_logs_ecriture_seule"();

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_sans_chevauchement";
ALTER TABLE "stays" DROP CONSTRAINT IF EXISTS "stays_sans_chevauchement_exclusif";

ALTER TABLE "stay_guests" DROP CONSTRAINT IF EXISTS "stay_guests_rattachement_unique";
ALTER TABLE "houses" DROP CONSTRAINT IF EXISTS "houses_capacite_bornee";
ALTER TABLE "space_assignments" DROP CONSTRAINT IF EXISTS "space_assignments_dates_coherentes";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_dates_coherentes";
ALTER TABLE "blocked_periods" DROP CONSTRAINT IF EXISTS "blocked_periods_dates_coherentes";
ALTER TABLE "stay_requests" DROP CONSTRAINT IF EXISTS "stay_requests_effectifs_positifs";
ALTER TABLE "stay_requests" DROP CONSTRAINT IF EXISTS "stay_requests_dates_coherentes";
ALTER TABLE "stays" DROP CONSTRAINT IF EXISTS "stays_effectifs_positifs";
ALTER TABLE "stays" DROP CONSTRAINT IF EXISTS "stays_dates_coherentes";

-- L'extension `btree_gist` n'est pas supprimée : elle est sans effet de bord
-- et d'autres migrations peuvent en dépendre.
