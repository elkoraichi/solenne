-- AlterTable
ALTER TABLE "booking_settings" ALTER COLUMN "max_guests" DROP NOT NULL,
ALTER COLUMN "max_guests" DROP DEFAULT,
ALTER COLUMN "max_stay_nights" DROP NOT NULL,
ALTER COLUMN "max_stay_nights" DROP DEFAULT,
ALTER COLUMN "min_lead_time_hours" DROP NOT NULL,
ALTER COLUMN "min_lead_time_hours" DROP DEFAULT,
ALTER COLUMN "max_advance_days" DROP NOT NULL,
ALTER COLUMN "max_advance_days" DROP DEFAULT;
