-- Le journal d'audit doit rester inviolable (règle n°8) ET permettre l'effacement
-- des données personnelles (USR-R5). Ces deux exigences se heurtent : supprimer
-- un compte détache son identifiant des entrées d'audit, donc les modifie.
--
-- Arbitrage : une seule mutation est tolérée, le **détachement de l'acteur**.
-- Tout le reste — action, entité, différentiel, adresse IP, horodatage — reste
-- figé. La trace de ce qui s'est passé survit ; le nom de qui l'a fait peut
-- disparaître, comme le droit à l'effacement l'exige.

CREATE OR REPLACE FUNCTION "audit_logs_ecriture_seule"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."actor_id" IS NULL
     AND NEW."id" = OLD."id"
     AND NEW."action" = OLD."action"
     AND NEW."entity_type" IS NOT DISTINCT FROM OLD."entity_type"
     AND NEW."entity_id" IS NOT DISTINCT FROM OLD."entity_id"
     AND NEW."diff"::text = OLD."diff"::text
     AND NEW."ip" IS NOT DISTINCT FROM OLD."ip"
     AND NEW."created_at" = OLD."created_at"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Le journal d''audit est en écriture seule : % interdit', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
