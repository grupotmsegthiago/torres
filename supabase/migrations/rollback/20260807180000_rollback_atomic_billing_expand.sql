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
REVOKE ALL ON FUNCTION public.freeze_boletim_billings_atomic(
  integer, text, text, timestamptz
) FROM service_role;
REVOKE ALL ON FUNCTION public.mark_escort_billings_invoiced_atomic(
  uuid[], integer, timestamptz, text
) FROM service_role;
REVOKE ALL ON FUNCTION public.transition_invoice_billings_atomic(
  integer, text, timestamptz, text
) FROM service_role;

DROP FUNCTION IF EXISTS public.transition_invoice_billings_atomic(
  integer, text, timestamptz, text
);
DROP FUNCTION IF EXISTS public.mark_escort_billings_invoiced_atomic(
  uuid[], integer, timestamptz, text
);
DROP FUNCTION IF EXISTS public.freeze_boletim_billings_atomic(
  integer, text, text, timestamptz
);
DROP FUNCTION IF EXISTS public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
);
DROP FUNCTION IF EXISTS public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
);
DROP FUNCTION IF EXISTS public.is_escort_billing_snapshotted(uuid, bigint);

DROP INDEX IF EXISTS public.idx_boletim_snapshot_billing_lookup;

REVOKE ALL ON public.service_orders, public.mission_photos
  FROM torres_billing_rpc_owner;
REVOKE ALL ON public.escort_billings, public.boletim_approvals
  FROM torres_billing_rpc_owner;
REVOKE ALL ON public.system_audit_logs, public.financial_transactions
  FROM torres_billing_rpc_owner;
REVOKE ALL ON SEQUENCE
  public.boletim_approvals_id_seq,
  public.system_audit_logs_id_seq
  FROM torres_billing_rpc_owner;
REVOKE ALL ON SCHEMA public FROM torres_billing_rpc_owner;

DROP ROLE IF EXISTS torres_billing_rpc_owner;

-- uniq_eb_so_id já existia antes desta migration e é preservado.
-- lock_version também é preservado: snapshots criados após o expand registram
-- billing_version e rollback não pode apagar essa evidência de concorrência.
COMMIT;
