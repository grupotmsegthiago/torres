-- PR5B.1-PRE3 — Golden fixtures live
-- Pacote somente leitura. Execute uma consulta por vez.
-- Projeto esperado: erjhxwbutjyylxdthuuz

-- CONSULTA 1 — Concluída com billing aberto
WITH candidates AS (
  SELECT
    so.id AS service_order_id,
    so.os_number,
    so.status AS service_order_status,
    eb.id AS billing_id,
    eb.status AS billing_status,
    eb.fat_total,
    EXISTS (
      SELECT 1
      FROM public.boletim_approvals ba
      WHERE eb.id::text = ANY(coalesce(ba.billing_ids, ARRAY[]::text[]))
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
                 THEN ba.billing_snapshot
               ELSE '[]'::jsonb
             END
           ) AS item
           WHERE item->>'billing_id' = eb.id::text
         )
    ) AS snapshot_exists,
    so.completed_date
  FROM public.service_orders so
  JOIN public.escort_billings eb ON eb.service_order_id = so.id
  WHERE lower(coalesce(so.status, '')) IN (
    'concluida',
    'concluída',
    'encerrada',
    'finalizada'
  )
    AND upper(coalesce(eb.status, '')) IN (
      'A_VERIFICAR',
      'PENDENTE',
      'VERIFICADA'
    )
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  service_order_id,
  os_number,
  service_order_status,
  billing_id,
  billing_status,
  fat_total,
  snapshot_exists
FROM candidates
ORDER BY snapshot_exists ASC, completed_date DESC NULLS LAST, service_order_id
LIMIT 20;

-- CONSULTA 2 — Concluída com billing congelado ou snapshot imutável
WITH candidates AS (
  SELECT
    so.id AS service_order_id,
    so.os_number,
    so.status AS service_order_status,
    eb.id AS billing_id,
    eb.status AS billing_status,
    ap.approval_id,
    ap.approval_status,
    (ap.approval_id IS NOT NULL) AS snapshot_exists,
    so.completed_date
  FROM public.service_orders so
  JOIN public.escort_billings eb ON eb.service_order_id = so.id
  LEFT JOIN LATERAL (
    SELECT
      ba.id AS approval_id,
      ba.status AS approval_status
    FROM public.boletim_approvals ba
    WHERE eb.id::text = ANY(coalesce(ba.billing_ids, ARRAY[]::text[]))
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
               THEN ba.billing_snapshot
             ELSE '[]'::jsonb
           END
         ) AS item
         WHERE item->>'billing_id' = eb.id::text
       )
    ORDER BY
      CASE upper(coalesce(ba.status, ''))
        WHEN 'APROVADO' THEN 3
        WHEN 'CONFIRMADO' THEN 3
        WHEN 'PENDENTE' THEN 2
        ELSE 1
      END DESC,
      ba.created_at DESC NULLS LAST,
      ba.id::text DESC
    LIMIT 1
  ) ap ON true
  WHERE lower(coalesce(so.status, '')) IN (
    'concluida',
    'concluída',
    'encerrada',
    'finalizada'
  )
    AND (
      upper(coalesce(eb.status, '')) IN (
        'APROVADA',
        'FATURADO',
        'FATURADA',
        'PAGO'
      )
      OR ap.approval_id IS NOT NULL
    )
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  service_order_id,
  os_number,
  service_order_status,
  billing_id,
  billing_status,
  snapshot_exists,
  approval_id,
  approval_status
FROM candidates
ORDER BY
  CASE upper(coalesce(approval_status, ''))
    WHEN 'APROVADO' THEN 3
    WHEN 'CONFIRMADO' THEN 3
    WHEN 'PENDENTE' THEN 2
    ELSE 1
  END DESC,
  completed_date DESC NULLS LAST,
  service_order_id
LIMIT 20;

-- CONSULTA 3 — Recusada com valores financeiros zero
WITH latest_billing AS (
  SELECT
    eb.id,
    eb.service_order_id,
    eb.status,
    eb.fat_total,
    eb.invoice_id,
    row_number() OVER (
      PARTITION BY eb.service_order_id
      ORDER BY eb.created_at DESC NULLS LAST, eb.id DESC
    ) AS rn
  FROM public.escort_billings eb
  WHERE eb.service_order_id IS NOT NULL
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  so.id AS service_order_id,
  so.os_number,
  so.status,
  lb.id AS billing_id,
  lb.status AS billing_status,
  (
    coalesce(so.fat_calculado, 0) = 0
  ) AS fat_calculado_zero,
  (
    coalesce(so.lucro_calculado, 0) = 0
  ) AS lucro_calculado_zero,
  (
    coalesce(so.margem_calculada, 0) = 0
  ) AS margem_calculada_zero,
  (
    lb.id IS NULL OR coalesce(lb.fat_total, 0) = 0
  ) AS billing_zero,
  (
    lb.invoice_id IS NULL
  ) AS no_invoice_link,
  NOT EXISTS (
    SELECT 1
    FROM public.financial_transactions ft
    WHERE upper(coalesce(ft.type, '')) IN ('INCOME', 'RECEITA')
      AND coalesce(ft.amount, 0) > 0
      AND (
        (
          ft.origin_type = 'service_order'
          AND ft.origin_id = so.id::text
        )
        OR (
          lb.id IS NOT NULL
          AND ft.origin_type = 'escort_billing'
          AND ft.origin_id = lb.id::text
        )
      )
  ) AS no_positive_income_transaction
FROM public.service_orders so
LEFT JOIN latest_billing lb
  ON lb.service_order_id = so.id AND lb.rn = 1
WHERE lower(coalesce(so.status, '')) = 'recusada'
  AND coalesce(so.fat_calculado, 0) = 0
  AND coalesce(so.lucro_calculado, 0) = 0
  AND coalesce(so.margem_calculada, 0) = 0
  AND (lb.id IS NULL OR coalesce(lb.fat_total, 0) = 0)
ORDER BY so.id
LIMIT 20;

-- CONSULTA 4 — Billing em snapshot consistente
WITH snapshot_items AS (
  SELECT
    ba.id AS approval_id,
    ba.status AS approval_status,
    ba.created_at AS approval_created_at,
    item->>'billing_id' AS billing_id,
    CASE
      WHEN item->>'total' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (item->>'total')::numeric
    END AS snapshot_total
  FROM public.boletim_approvals ba
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
        THEN ba.billing_snapshot
      ELSE '[]'::jsonb
    END
  ) AS item
  WHERE nullif(item->>'billing_id', '') IS NOT NULL
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  eb.service_order_id,
  so.os_number,
  eb.id AS billing_id,
  eb.status AS billing_status,
  si.approval_id,
  si.approval_status,
  eb.fat_total AS billing_total,
  si.snapshot_total,
  abs(coalesce(eb.fat_total, 0) - coalesce(si.snapshot_total, 0))
    AS absolute_difference
FROM snapshot_items si
JOIN public.escort_billings eb ON eb.id::text = si.billing_id
LEFT JOIN public.service_orders so ON so.id = eb.service_order_id
WHERE si.snapshot_total IS NOT NULL
  AND abs(coalesce(eb.fat_total, 0) - si.snapshot_total) <= 0.01
ORDER BY
  CASE upper(coalesce(si.approval_status, ''))
    WHEN 'APROVADO' THEN 3
    WHEN 'CONFIRMADO' THEN 3
    WHEN 'PENDENTE' THEN 2
    ELSE 1
  END DESC,
  si.approval_created_at DESC NULLS LAST,
  si.approval_id::text,
  eb.id::text
LIMIT 20;

-- CONSULTA 5 — Billing atual diferente do snapshot
WITH snapshot_items AS (
  SELECT
    ba.id AS approval_id,
    ba.status AS approval_status,
    ba.created_at AS approval_created_at,
    item->>'billing_id' AS billing_id,
    CASE
      WHEN item->>'total' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (item->>'total')::numeric
    END AS snapshot_total
  FROM public.boletim_approvals ba
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
        THEN ba.billing_snapshot
      ELSE '[]'::jsonb
    END
  ) AS item
  WHERE nullif(item->>'billing_id', '') IS NOT NULL
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  eb.service_order_id,
  so.os_number,
  eb.id AS billing_id,
  eb.status AS billing_status,
  si.approval_id,
  si.approval_status,
  eb.fat_total AS billing_total,
  si.snapshot_total,
  abs(coalesce(eb.fat_total, 0) - coalesce(si.snapshot_total, 0))
    AS absolute_difference
FROM snapshot_items si
JOIN public.escort_billings eb ON eb.id::text = si.billing_id
LEFT JOIN public.service_orders so ON so.id = eb.service_order_id
WHERE si.snapshot_total IS NOT NULL
  AND abs(coalesce(eb.fat_total, 0) - si.snapshot_total) > 0.01
ORDER BY
  CASE upper(coalesce(si.approval_status, ''))
    WHEN 'APROVADO' THEN 3
    WHEN 'CONFIRMADO' THEN 3
    WHEN 'PENDENTE' THEN 2
    ELSE 1
  END DESC,
  absolute_difference DESC,
  si.approval_created_at DESC NULLS LAST,
  si.approval_id::text,
  eb.id::text
LIMIT 20;
