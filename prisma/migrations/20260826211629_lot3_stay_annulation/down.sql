-- Retour arrière de l'ajout du motif d'annulation (`SETUP-007`).
ALTER TABLE "stays" DROP COLUMN IF EXISTS "cancel_reason";
