-- PR5B.1-TX — corrige ACL efetiva das RPCs após o EXPAND Hosted.
-- Exclusivamente privilégios: não altera funções, dados, RLS ou enforcement.
BEGIN;

-- As funções pertencem à role dedicada. O executor Hosted (postgres
-- não-superuser) precisa de SET temporário para revogar/conceder como owner.
GRANT torres_billing_rpc_owner TO CURRENT_USER WITH INHERIT FALSE;
GRANT torres_billing_rpc_owner TO CURRENT_USER WITH SET TRUE;
SET LOCAL ROLE torres_billing_rpc_owner;

-- Zera todos os executores externos, inclusive grants vindos dos defaults
-- do schema public. Signatures exatas tornam a migration fail-closed.
REVOKE EXECUTE ON FUNCTION
  public.is_escort_billing_snapshotted(uuid, bigint),
  public.lock_service_orders_for_billings(uuid[]),
  public.write_escort_billing_atomic(text, jsonb, uuid, integer, bigint, jsonb),
  public.create_boletim_approval_atomic(
    text, integer, text, text, date, date, text[], numeric,
    integer, text, integer, jsonb
  ),
  public.freeze_boletim_billings_atomic(integer, text, text, timestamptz),
  public.mark_escort_billings_invoiced_atomic(
    uuid[], integer, timestamptz, text
  ),
  public.transition_invoice_billings_atomic(integer, text, timestamptz, text)
FROM PUBLIC, anon, authenticated, service_role;

-- Contrato aprovado: service_role chama as seis RPCs públicas do backend.
-- lock_service_orders_for_billings permanece helper interno sem grant.
GRANT EXECUTE ON FUNCTION
  public.is_escort_billing_snapshotted(uuid, bigint),
  public.write_escort_billing_atomic(text, jsonb, uuid, integer, bigint, jsonb),
  public.create_boletim_approval_atomic(
    text, integer, text, text, date, date, text[], numeric,
    integer, text, integer, jsonb
  ),
  public.freeze_boletim_billings_atomic(integer, text, text, timestamptz),
  public.mark_escort_billings_invoiced_atomic(
    uuid[], integer, timestamptz, text
  ),
  public.transition_invoice_billings_atomic(integer, text, timestamptz, text)
TO service_role;

RESET ROLE;
REVOKE SET OPTION FOR torres_billing_rpc_owner FROM CURRENT_USER;
REVOKE INHERIT OPTION FOR torres_billing_rpc_owner FROM CURRENT_USER;

COMMIT;
