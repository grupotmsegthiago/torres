-- PR5B.0C-LITE — Gate read-only para preparar a PR5B.1
-- Projeto esperado: erjhxwbutjyylxdthuuz
-- Execute uma consulta por vez. Este arquivo não corrige dados.

-- CONSULTA 1 — B2.1: Service Orders por status
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  lower(coalesce(status, '<null>')) AS status,
  count(*)::bigint AS records
FROM public.service_orders
GROUP BY lower(coalesce(status, '<null>'))
ORDER BY records DESC, status
LIMIT 100;

-- CONSULTA 2 — B3.1: Escort Billings por status
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  upper(coalesce(status, '<NULL>')) AS status,
  count(*)::bigint AS records
FROM public.escort_billings
GROUP BY upper(coalesce(status, '<NULL>'))
ORDER BY records DESC, status
LIMIT 100;

-- CONSULTA 3 — B3.2 corrigida: snapshots deduplicados por billing_id
WITH duplicate_os AS (
  SELECT service_order_id, count(*)::bigint AS n
  FROM public.escort_billings
  WHERE service_order_id IS NOT NULL
  GROUP BY service_order_id
  HAVING count(*) > 1
),
snapshot_ranked AS (
  SELECT
    item->>'billing_id' AS billing_id,
    CASE
      WHEN item->>'total' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (item->>'total')::numeric
    END AS snapshot_total,
    row_number() OVER (
      PARTITION BY item->>'billing_id'
      ORDER BY
        CASE upper(coalesce(ba.status, ''))
          WHEN 'APROVADO' THEN 3
          WHEN 'CONFIRMADO' THEN 3
          WHEN 'PENDENTE' THEN 2
          ELSE 1
        END DESC,
        ba.created_at DESC NULLS LAST,
        ba.id::text DESC
    ) AS rn
  FROM public.boletim_approvals ba
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
        THEN ba.billing_snapshot
      ELSE '[]'::jsonb
    END
  ) AS item
  WHERE nullif(item->>'billing_id', '') IS NOT NULL
),
snapshot_links AS (
  SELECT billing_id, snapshot_total
  FROM snapshot_ranked
  WHERE rn = 1
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  count(*)::bigint AS total_billings,
  count(*) FILTER (
    WHERE so.id IS NULL AND eb.service_order_id IS NOT NULL
  )::bigint AS billing_without_service_order,
  count(*) FILTER (
    WHERE eb.service_order_id IS NULL
  )::bigint AS billing_without_traceable_service_order,
  (SELECT count(*) FROM duplicate_os)::bigint
    AS service_orders_with_duplicate_billing,
  (SELECT coalesce(sum(n), 0) FROM duplicate_os)::bigint
    AS rows_in_duplicate_groups,
  count(*) FILTER (
    WHERE upper(coalesce(eb.status, '')) IN (
      'APROVADA',
      'FATURADO',
      'FATURADA',
      'PAGO',
      'CANCELADO',
      'CANCELADA'
    )
  )::bigint AS frozen_billings,
  count(*) FILTER (
    WHERE upper(coalesce(eb.status, '')) IN (
      'A_VERIFICAR',
      'VERIFICADA',
      'PENDENTE',
      'ENVIADA_APROVACAO'
    )
  )::bigint AS open_billings,
  count(*) FILTER (
    WHERE sl.billing_id IS NOT NULL
  )::bigint AS billings_in_snapshot,
  count(*) FILTER (
    WHERE sl.snapshot_total IS NOT NULL
      AND abs(coalesce(eb.fat_total, 0) - sl.snapshot_total) > 0.01
  )::bigint AS billing_snapshot_value_differences
FROM public.escort_billings eb
LEFT JOIN public.service_orders so ON so.id = eb.service_order_id
LEFT JOIN snapshot_links sl ON sl.billing_id = eb.id::text;

-- CONSULTA 4 — IDs técnicos das OS sem billing
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  so.id AS service_order_id,
  so.os_number,
  so.status,
  so.scheduled_date,
  so.completed_date
FROM public.service_orders so
WHERE NOT EXISTS (
  SELECT 1
  FROM public.escort_billings eb
  WHERE eb.service_order_id = so.id
)
ORDER BY so.id
LIMIT 100;

-- CONSULTA 5 — IDs técnicos das canceladas com espelho divergente
WITH latest_billing AS (
  SELECT
    id,
    service_order_id,
    status,
    fat_total,
    row_number() OVER (
      PARTITION BY service_order_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.escort_billings
  WHERE service_order_id IS NOT NULL
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  so.id AS service_order_id,
  so.os_number,
  so.status,
  lb.id AS billing_id,
  lb.status AS billing_status,
  EXISTS (
    SELECT 1
    FROM public.boletim_approvals ba
    WHERE lb.id::text = ANY(coalesce(ba.billing_ids, ARRAY[]::text[]))
  ) AS has_approval
FROM public.service_orders so
JOIN latest_billing lb
  ON lb.service_order_id = so.id AND lb.rn = 1
WHERE lower(coalesce(so.status, '')) = 'cancelada'
  AND abs(coalesce(so.fat_calculado, 0) - coalesce(lb.fat_total, 0)) > 0.01
ORDER BY so.id
LIMIT 100;

-- CONSULTA 6 — IDs técnicos dos itens de snapshot sem billing
WITH snapshot_items AS (
  SELECT
    ba.id AS approval_id,
    ba.status AS approval_status,
    item->>'billing_id' AS billing_id,
    item->>'service_order_id' AS service_order_id
  FROM public.boletim_approvals ba
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
        THEN ba.billing_snapshot
      ELSE '[]'::jsonb
    END
  ) AS item
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  si.approval_id,
  si.approval_status,
  si.billing_id,
  si.service_order_id
FROM snapshot_items si
LEFT JOIN public.escort_billings eb ON eb.id::text = si.billing_id
WHERE eb.id IS NULL
ORDER BY si.approval_id::text, si.billing_id
LIMIT 100;

-- CONSULTA 7 — B4.1: Approvals por status e presença de snapshot
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  upper(coalesce(status, '<NULL>')) AS status,
  count(*)::bigint AS approvals,
  count(*) FILTER (
    WHERE jsonb_typeof(billing_snapshot) = 'array'
      AND jsonb_array_length(billing_snapshot) > 0
  )::bigint AS with_snapshot,
  count(*) FILTER (
    WHERE billing_snapshot IS NULL
       OR jsonb_typeof(billing_snapshot) <> 'array'
       OR jsonb_array_length(billing_snapshot) = 0
  )::bigint AS without_snapshot
FROM public.boletim_approvals
GROUP BY upper(coalesce(status, '<NULL>'))
ORDER BY approvals DESC, status
LIMIT 100;
