-- Garanties structurelles que Prisma ne sait pas exprimer.
-- Référence : Mode Operatoire.md §8 (concurrence C1→C6) et règle non négociable n°8 et n°10.

-- ---------------------------------------------------------------------------
-- 1. Extension nécessaire aux contraintes d'exclusion mixtes (= + &&)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- 2. Cohérence des intervalles — convention [début, fin[
--    Le jour du départ n'est pas occupé, donc fin > début strictement.
-- ---------------------------------------------------------------------------
ALTER TABLE "stays"
  ADD CONSTRAINT "stays_dates_coherentes" CHECK ("end_date" > "start_date");

ALTER TABLE "stays"
  ADD CONSTRAINT "stays_effectifs_positifs" CHECK ("adults" >= 0 AND "children" >= 0 AND "adults" + "children" >= 1);

ALTER TABLE "stay_requests"
  ADD CONSTRAINT "stay_requests_dates_coherentes" CHECK ("departure_date" > "arrival_date");

ALTER TABLE "stay_requests"
  ADD CONSTRAINT "stay_requests_effectifs_positifs" CHECK ("adults" >= 0 AND "children" >= 0 AND "adults" + "children" >= 1);

ALTER TABLE "blocked_periods"
  ADD CONSTRAINT "blocked_periods_dates_coherentes" CHECK ("end_date" > "start_date");

ALTER TABLE "events"
  ADD CONSTRAINT "events_dates_coherentes" CHECK ("end_at" > "start_at");

ALTER TABLE "space_assignments"
  ADD CONSTRAINT "space_assignments_dates_coherentes" CHECK ("to" > "from");

ALTER TABLE "houses"
  ADD CONSTRAINT "houses_capacite_bornee" CHECK ("capacity_max" BETWEEN 1 AND 25);

-- Un invité est rattaché soit à une demande, soit à un séjour — jamais aux deux,
-- jamais à aucun des deux.
ALTER TABLE "stay_guests"
  ADD CONSTRAINT "stay_guests_rattachement_unique"
  CHECK (("stay_request_id" IS NULL) <> ("stay_id" IS NULL));

-- ---------------------------------------------------------------------------
-- 3. Filet de sécurité concurrence (C1, C5) — règle R2 / décision D2
--    Deux séjours exclusifs confirmés ne peuvent jamais se chevaucher.
-- ---------------------------------------------------------------------------
ALTER TABLE "stays"
  ADD CONSTRAINT "stays_sans_chevauchement_exclusif"
  EXCLUDE USING gist (
    "house_id" WITH =,
    daterange("start_date", "end_date", '[)') WITH &&
  ) WHERE ("exclusive" AND "status" = 'CONFIRMED');

-- ---------------------------------------------------------------------------
-- 4. Filet de sécurité — règle R6 / décision D8
--    Deux événements non annulés ne peuvent jamais se chevaucher.
-- ---------------------------------------------------------------------------
ALTER TABLE "events"
  ADD CONSTRAINT "events_sans_chevauchement"
  EXCLUDE USING gist (
    "house_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  ) WHERE ("status" <> 'CANCELLED');

-- ---------------------------------------------------------------------------
-- 5. Journal d'audit en écriture seule (règle non négociable n°8)
--    Aucune modification, aucune suppression, y compris par le propriétaire
--    de la base via l'application.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "audit_logs_ecriture_seule"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est en écriture seule : % interdit', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_pas_de_modification"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_ecriture_seule"();

CREATE TRIGGER "audit_logs_pas_de_troncature"
  BEFORE TRUNCATE ON "audit_logs"
  FOR STATEMENT EXECUTE FUNCTION "audit_logs_ecriture_seule"();
