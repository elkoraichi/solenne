-- HOUSE-R6 — la version acceptée d'une règle reste consultable.
--
-- Sans historique, corriger une faute de frappe dans « le calme après 22 h »
-- réécrirait rétroactivement ce que chaque ami a accepté. On dépose donc une
-- version à chaque écriture ; les acceptations de séjour (lot 3) pointeront
-- vers la version en vigueur au moment où elles ont été données.

ALTER TABLE "house_rules"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "house_rule_versions" (
  "id"                  TEXT NOT NULL,
  "rule_id"             TEXT NOT NULL,
  "version"             INTEGER NOT NULL,
  "title"               TEXT NOT NULL,
  "body"                TEXT NOT NULL,
  "requires_acceptance" BOOLEAN NOT NULL,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "house_rule_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "house_rule_versions_rule_id_version_key"
  ON "house_rule_versions" ("rule_id", "version");

CREATE INDEX "house_rule_versions_rule_id_version_idx"
  ON "house_rule_versions" ("rule_id", "version");

ALTER TABLE "house_rule_versions"
  ADD CONSTRAINT "house_rule_versions_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "house_rules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Les règles déjà en base reçoivent leur version 1, pour qu'aucune ne soit
-- sans historique.
INSERT INTO "house_rule_versions" ("id", "rule_id", "version", "title", "body", "requires_acceptance", "created_at")
SELECT
  md5(random()::text || clock_timestamp()::text)::uuid::text,
  "id", 1, "title", "body", "requires_acceptance", "created_at"
FROM "house_rules";
