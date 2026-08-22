-- Retour arrière de `stays_exclusif_sans_cohabitation` (`SETUP-007`).
-- La contrainte du lot 0, `stays_sans_chevauchement_exclusif`, n'est pas
-- touchée : elle appartient à sa propre migration.
ALTER TABLE "stays" DROP CONSTRAINT IF EXISTS "stays_exclusif_sans_cohabitation";
