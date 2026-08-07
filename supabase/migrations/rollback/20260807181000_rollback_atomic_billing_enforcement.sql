-- Rollback PR5B.1-TX contract/enforcement.
-- Executar somente após rollback do app para writers diretos.
BEGIN;

DROP TRIGGER IF EXISTS guard_boletim_snapshot_atomic_delete
  ON public.boletim_approvals;
DROP TRIGGER IF EXISTS guard_boletim_snapshot_atomic_update
  ON public.boletim_approvals;
DROP TRIGGER IF EXISTS guard_boletim_snapshot_atomic_insert
  ON public.boletim_approvals;
DROP TRIGGER IF EXISTS guard_escort_billing_atomic_write
  ON public.escort_billings;

DROP FUNCTION IF EXISTS public.guard_boletim_snapshot_atomic_write();
DROP FUNCTION IF EXISTS public.guard_escort_billing_atomic_write();

-- Restaura exatamente os objetos live-only legados observados no TX-02/TX-04.
CREATE OR REPLACE FUNCTION public.validate_escort_billing_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'APROVADO' AND (OLD.status IS DISTINCT FROM 'APROVADO') THEN
    IF NEW.snapshot_data IS NULL OR NEW.snapshot_data = '{}'::jsonb THEN
      RAISE EXCEPTION 'Não é possível aprovar boletim sem snapshot de dados financeiros';
    END IF;

    IF NEW.fat_total IS NULL OR NEW.fat_total <= 0 THEN
      IF NEW.edit_reason IS NULL OR trim(NEW.edit_reason) = '' THEN
        RAISE EXCEPTION 'Faturamento zero ou negativo exige justificativa (edit_reason)';
      END IF;
    END IF;

    IF NEW.approved_at IS NULL THEN
      NEW.approved_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_escort_billing_approval
BEFORE UPDATE ON public.escort_billings
FOR EACH ROW
EXECUTE FUNCTION public.validate_escort_billing_approval();

CREATE OR REPLACE FUNCTION public.validate_service_order_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'aprovada' AND (OLD.status IS DISTINCT FROM 'aprovada') THEN
    IF NEW.snapshot_data IS NULL OR NEW.snapshot_data = '{}'::jsonb THEN
      RAISE EXCEPTION 'Não é possível aprovar sem snapshot de dados financeiros (snapshot_data vazio)';
    END IF;

    IF NEW.revenue_value IS NULL OR NEW.cost_value IS NULL THEN
      RAISE EXCEPTION 'Não é possível aprovar sem valores financeiros (revenue_value e cost_value são obrigatórios)';
    END IF;

    IF NEW.revenue_value <= 0 AND (NEW.edit_reason IS NULL OR trim(NEW.edit_reason) = '') THEN
      RAISE EXCEPTION 'Receita zero ou negativa exige justificativa (edit_reason obrigatório)';
    END IF;

    IF NEW.approved_at IS NULL THEN
      NEW.approved_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_service_order_approval
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_service_order_approval();

COMMIT;
