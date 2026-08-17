-- APROVADA = aprovação interna (pronta para enviar ao cliente).
-- Enviar/reenviar boletim NÃO pode exigir reabertura nem bloquear snapshot.
-- Bloqueio de create_boletim_approval_atomic: só FATURADO / FATURADA / PAGO.
-- Cliente aprovar medição (boletim_approvals) é processo separado.

CREATE OR REPLACE FUNCTION public.create_boletim_approval_atomic(
  p_token text,
  p_client_id integer,
  p_client_name text,
  p_client_email text,
  p_period_start date,
  p_period_end date,
  p_billing_ids text[],
  p_total_value numeric,
  p_os_count integer,
  p_sent_by text,
  p_sent_by_user_id integer,
  p_billing_snapshot jsonb
)
RETURNS SETOF public.boletim_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result public.boletim_approvals%ROWTYPE;
  v_ids uuid[];
  v_service_order_ids integer[];
  v_snapshot_count integer;
  v_locked_count integer;
BEGIN
  IF jsonb_typeof(p_billing_snapshot) <> 'array'
     OR jsonb_array_length(p_billing_snapshot) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_SNAPSHOT';
  END IF;

  SELECT
    array_agg((item->>'billing_id')::uuid ORDER BY (item->>'billing_id')::uuid),
    count(*)
  INTO v_ids, v_snapshot_count
  FROM jsonb_array_elements(p_billing_snapshot) AS item
  WHERE NULLIF(item->>'billing_id', '') IS NOT NULL
    AND NULLIF(item->>'billing_version', '') IS NOT NULL;

  IF v_ids IS NULL
     OR v_snapshot_count <> jsonb_array_length(p_billing_snapshot)
     OR cardinality(v_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_SNAPSHOT_IDS';
  END IF;

  v_service_order_ids := public.lock_service_orders_for_billings(v_ids);

  PERFORM 1
  FROM public.escort_billings
  WHERE id = ANY(v_ids)
  ORDER BY id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_locked_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_BILLING_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND NOT (service_order_id = ANY(v_service_order_ids))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_MEMBERSHIP_STALE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_billing_snapshot) AS item
    JOIN public.escort_billings AS billing
      ON billing.id = (item->>'billing_id')::uuid
    WHERE billing.lock_version <> (item->>'billing_version')::bigint
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_STALE_SNAPSHOT_VERSION';
  END IF;

  -- Só faturada/paga bloqueia snapshot. APROVADA (interna) entra no boletim.
  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND upper(trim(COALESCE(status, ''))) IN ('FATURADO', 'FATURADA', 'PAGO')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_FROZEN_BILLING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings AS billing
    JOIN public.service_orders AS service_order
      ON service_order.id = billing.service_order_id
    WHERE billing.id = ANY(v_ids)
      AND (
        NULLIF(trim(COALESCE(service_order.escort_contract_id, '')), '') IS NULL
        OR billing.contract_id::text <> service_order.escort_contract_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_CONTRACT_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings AS billing
    JOIN public.service_orders AS service_order
      ON service_order.id = billing.service_order_id
    WHERE billing.id = ANY(v_ids)
      AND (
        billing.client_id IS DISTINCT FROM p_client_id
        OR service_order.client_id IS DISTINCT FROM p_client_id
        OR lower(COALESCE(service_order.status, '')) = 'recusada'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_CLIENT_OR_REFUSED_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_billing_snapshot) AS item
    JOIN public.escort_billings AS billing
      ON billing.id = (item->>'billing_id')::uuid
    WHERE round(COALESCE((item->>'fat_acionamento')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_acionamento, 0), 2)
       OR round(COALESCE((item->>'fat_hora_extra')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_hora_extra, 0), 2)
       OR round(COALESCE((item->>'fat_km')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_km, 0), 2)
       OR round(COALESCE((item->>'fat_adicional_noturno')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_adicional_noturno, 0), 2)
       OR round(COALESCE((item->>'fat_estadia')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_estadia, 0), 2)
       OR round(COALESCE((item->>'fat_pernoite')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_pernoite, 0), 2)
       OR round(COALESCE((item->>'despesas_pedagio')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.despesas_pedagio, 0), 2)
       OR round(COALESCE((item->>'despesas_outras')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.despesas_outras, 0), 2)
       OR round(COALESCE((item->>'receitas_os')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.receitas_os, 0), 2)
       OR round(COALESCE((item->>'total')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_total, 0), 2)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_COMPONENT_MISMATCH';
  END IF;

  IF COALESCE(p_os_count, -1) <> v_snapshot_count
     OR round(COALESCE(p_total_value, 0), 2) IS DISTINCT FROM (
       SELECT round(COALESCE(sum((item->>'total')::numeric), 0), 2)
       FROM jsonb_array_elements(p_billing_snapshot) AS item
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_TOTAL_OR_COUNT_MISMATCH';
  END IF;

  IF ARRAY(SELECT unnest(p_billing_ids) ORDER BY 1)
     IS DISTINCT FROM ARRAY(SELECT id::text FROM unnest(v_ids) AS id ORDER BY 1) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_BILLING_IDS_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.boletim_approvals
    WHERE status IN ('PENDENTE', 'APROVADO')
      AND billing_ids && p_billing_ids
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'PR5B1_TX_ACTIVE_APPROVAL_CONFLICT';
  END IF;

  INSERT INTO public.boletim_approvals (
    token, client_id, client_name, client_email,
    period_start, period_end, billing_ids, total_value,
    os_count, status, sent_by, sent_by_user_id, billing_snapshot
  ) VALUES (
    p_token, p_client_id, p_client_name, p_client_email,
    p_period_start, p_period_end, p_billing_ids, p_total_value,
    COALESCE(p_os_count, cardinality(p_billing_ids)),
    'PENDENTE', p_sent_by, p_sent_by_user_id, p_billing_snapshot
  )
  RETURNING * INTO v_result;

  RETURN NEXT v_result;
END;
$$;

COMMENT ON FUNCTION public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
) IS 'PR5B.1-TX: snapshot de boletim; APROVADA (interna) permitida; bloqueia só FATURADO/FATURADA/PAGO.';
