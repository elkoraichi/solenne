-- STAYREQ-C06 : filet de sécurité pour la double soumission (Mode Operatoire.md §8).
-- Prisma n'exprime pas les index uniques partiels : cette contrainte n'existe
-- que dans cette migration, jamais dans le schéma déclaratif.
--
-- Un même demandeur ne peut pas avoir deux demandes `PENDING` pour exactement
-- les mêmes dates. Un double clic sur « Envoyer » percute cet index sur son
-- second essai ; la Server Action rattrape la violation et rend la demande
-- déjà créée plutôt qu'un refus.
CREATE UNIQUE INDEX "stay_requests_pending_unique"
  ON "stay_requests" ("requester_id", "arrival_date", "departure_date")
  WHERE ("status" = 'PENDING');
