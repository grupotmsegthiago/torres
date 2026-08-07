-- Rollback PR5B.1-TX expand.
-- Executar somente depois do rollback contract e do app.
BEGIN;

REVOKE ALL ON FUNCTION public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
) FROM service_role;
REVOKE ALL ON FUNCTION public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
) FROM service_role;

DROP FUNCTION IF EXISTS public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
);
DROP FUNCTION IF EXISTS public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
);
DROP FUNCTION IF EXISTS public.is_escort_billing_snapshotted(uuid, bigint);

DROP INDEX IF EXISTS public.idx_boletim_snapshot_billing_lookup;

ALTER TABLE public.escort_billings
  DROP COLUMN IF EXISTS lock_version;

-- uniq_eb_so_id já existia antes desta migration e é preservado.
COMMIT;
