-- PR5B.1-TX — contract/enforcement.
-- Aplicar somente depois que todos os writers estiverem usando as RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_escort_billing_atomic_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user <> 'torres_billing_rpc_owner' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        'PR5B1_TX_DIRECT_BILLING_DML_BLOCKED: operação %s exige RPC atômica',
        TG_OP
      );
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_boletim_snapshot_atomic_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PR5B1_TX_APPROVAL_DELETE_BLOCKED: snapshot comercial é imutável';
  END IF;

  IF TG_OP = 'INSERT'
     AND current_user <> 'torres_billing_rpc_owner' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PR5B1_TX_DIRECT_SNAPSHOT_INSERT_BLOCKED: use RPC atômica';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.billing_snapshot IS DISTINCT FROM NEW.billing_snapshot
    OR OLD.billing_ids IS DISTINCT FROM NEW.billing_ids
    OR OLD.total_value IS DISTINCT FROM NEW.total_value
    OR OLD.client_id IS DISTINCT FROM NEW.client_id
    OR OLD.client_name IS DISTINCT FROM NEW.client_name
    OR OLD.client_email IS DISTINCT FROM NEW.client_email
    OR OLD.period_start IS DISTINCT FROM NEW.period_start
    OR OLD.period_end IS DISTINCT FROM NEW.period_end
    OR OLD.os_count IS DISTINCT FROM NEW.os_count
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger functions não são RPCs. Remove os defaults Hosted de FUNCTION para
-- impedir exposição acidental via PostgREST; triggers continuam executando.
REVOKE EXECUTE ON FUNCTION public.guard_escort_billing_atomic_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_boletim_snapshot_atomic_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_escort_billing_approval
  ON public.escort_billings;
DROP FUNCTION IF EXISTS public.validate_escort_billing_approval();

DROP TRIGGER IF EXISTS guard_escort_billing_atomic_write
  ON public.escort_billings;
CREATE TRIGGER guard_escort_billing_atomic_write
BEFORE INSERT OR UPDATE OR DELETE ON public.escort_billings
FOR EACH ROW
EXECUTE FUNCTION public.guard_escort_billing_atomic_write();

DROP TRIGGER IF EXISTS guard_boletim_snapshot_atomic_insert
  ON public.boletim_approvals;
CREATE TRIGGER guard_boletim_snapshot_atomic_insert
BEFORE INSERT ON public.boletim_approvals
FOR EACH ROW
EXECUTE FUNCTION public.guard_boletim_snapshot_atomic_write();

DROP TRIGGER IF EXISTS guard_boletim_snapshot_atomic_update
  ON public.boletim_approvals;
CREATE TRIGGER guard_boletim_snapshot_atomic_update
BEFORE UPDATE OF
  billing_snapshot, billing_ids, total_value, client_id, client_name,
  client_email, period_start, period_end, os_count
ON public.boletim_approvals
FOR EACH ROW
EXECUTE FUNCTION public.guard_boletim_snapshot_atomic_write();

DROP TRIGGER IF EXISTS guard_boletim_snapshot_atomic_delete
  ON public.boletim_approvals;
CREATE TRIGGER guard_boletim_snapshot_atomic_delete
BEFORE DELETE ON public.boletim_approvals
FOR EACH ROW
EXECUTE FUNCTION public.guard_boletim_snapshot_atomic_write();

COMMENT ON FUNCTION public.guard_escort_billing_atomic_write() IS
  'PR5B.1-TX: impede INSERT/UPDATE/DELETE fora da RPC atômica.';
COMMENT ON FUNCTION public.guard_boletim_snapshot_atomic_write() IS
  'PR5B.1-TX: snapshot write-once e approval sem hard delete.';

COMMIT;
