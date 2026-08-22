-- STAYDEC-014 / STAYDEC-C01 : le second volet de la privatisation (D2).
--
-- Le lot 0 avait déjà posé `stays_sans_chevauchement_exclusif`, qui interdit à
-- deux séjours **exclusifs** confirmés de se chevaucher. Il laissait passer le
-- cas mixte : un séjour exclusif et un séjour ordinaire sur les mêmes dates.
-- Or D2 dit privatisation — un séjour exclusif exclut *tout* autre séjour, pas
-- seulement un autre exclusif.
--
-- Une contrainte d'exclusion compare deux lignes avec des opérateurs ; aucun
-- opérateur ne dit « au moins l'une des deux est exclusive ». La paire mixte
-- s'attrape en revanche exactement avec `<>` sur le drapeau : la contrainte
-- ci-dessous se déclenche quand deux séjours confirmés se chevauchent et que
-- l'un est exclusif et l'autre non. Les deux contraintes réunies couvrent les
-- trois combinaisons possibles :
--
--   exclusif ↔ exclusif   → `stays_sans_chevauchement_exclusif` (lot 0)
--   exclusif ↔ ordinaire  → `stays_exclusif_sans_cohabitation`  (ici)
--   ordinaire ↔ ordinaire → autorisé (cohabitation, règle R5 d'`AVAIL`)
--
-- C'est un **filet**, pas la règle : le refus métier vient de la revalidation
-- d'`AVAIL` dans la transaction sérialisable de la décision. La contrainte est
-- là pour le cas où deux transactions concurrentes échapperaient au moteur —
-- elle rend l'état impossible impossible, plutôt qu'improbable.
ALTER TABLE "stays"
  ADD CONSTRAINT "stays_exclusif_sans_cohabitation"
  EXCLUDE USING gist (
    "house_id" WITH =,
    daterange("start_date", "end_date", '[)') WITH &&,
    "exclusive" WITH <>
  ) WHERE ("status" = 'CONFIRMED');
