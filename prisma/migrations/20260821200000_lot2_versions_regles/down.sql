-- Retour arrière : l'historique des règles disparaît, les règles restent.

DROP TABLE IF EXISTS "house_rule_versions";

ALTER TABLE "house_rules" DROP COLUMN IF EXISTS "version";
