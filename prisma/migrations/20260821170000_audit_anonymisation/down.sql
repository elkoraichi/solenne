-- Retour arrière : version stricte, sans exception pour l'anonymisation.

CREATE OR REPLACE FUNCTION "audit_logs_ecriture_seule"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est en écriture seule : % interdit', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
