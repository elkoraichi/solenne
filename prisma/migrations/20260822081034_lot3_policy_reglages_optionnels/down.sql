-- Retour arrière : un réglage désactivé (`null`) reprend sa valeur par défaut
-- d'origine avant que la contrainte NOT NULL ne soit restaurée.

UPDATE "booking_settings" SET "max_guests" = 10 WHERE "max_guests" IS NULL;
UPDATE "booking_settings" SET "max_stay_nights" = 14 WHERE "max_stay_nights" IS NULL;
UPDATE "booking_settings" SET "min_lead_time_hours" = 48 WHERE "min_lead_time_hours" IS NULL;
UPDATE "booking_settings" SET "max_advance_days" = 365 WHERE "max_advance_days" IS NULL;

ALTER TABLE "booking_settings"
  ALTER COLUMN "max_guests" SET DEFAULT 10,
  ALTER COLUMN "max_guests" SET NOT NULL,
  ALTER COLUMN "max_stay_nights" SET DEFAULT 14,
  ALTER COLUMN "max_stay_nights" SET NOT NULL,
  ALTER COLUMN "min_lead_time_hours" SET DEFAULT 48,
  ALTER COLUMN "min_lead_time_hours" SET NOT NULL,
  ALTER COLUMN "max_advance_days" SET DEFAULT 365,
  ALTER COLUMN "max_advance_days" SET NOT NULL;
