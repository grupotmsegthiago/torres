-- PR5B.0A — Inventário live do Sistema Torres
-- Pacote somente leitura. Execute uma consulta por vez no SQL Editor.
-- Projeto esperado: erjhxwbutjyylxdthuuz

-- BLOCO 1 — Contexto seguro
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  current_database() AS database_name,
  current_schema() AS current_schema,
  current_setting('server_version') AS postgres_version;

-- BLOCO 2 — Service Orders
-- Consulta 2.1 — Totais por status
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  lower(coalesce(status, '<null>')) AS status,
  count(*)::bigint AS records
FROM public.service_orders
GROUP BY lower(coalesce(status, '<null>'))
ORDER BY records DESC, status
LIMIT 100;

-- Consulta 2.2 — Billing, espelhos, canceladas e recusadas
WITH billing_counts AS (
  SELECT service_order_id, count(*)::bigint AS billing_count
  FROM public.escort_billings
  WHERE service_order_id IS NOT NULL
  GROUP BY service_order_id
),
latest_billing AS (
  SELECT
    id,
    service_order_id,
    status,
    fat_total,
    pag_total,
    desp_total,
    despesas_pedagio,
    despesas_combustivel,
    despesas_outras,
    row_number() OVER (
      PARTITION BY service_order_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.escort_billings
  WHERE service_order_id IS NOT NULL
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  count(*)::bigint AS total_service_orders,
  count(*) FILTER (
    WHERE lower(coalesce(so.status, '')) IN
      ('concluida', 'concluída', 'encerrada', 'finalizada')
  )::bigint AS completed,
  count(*) FILTER (
    WHERE lower(coalesce(so.status, '')) = 'cancelada'
  )::bigint AS cancelled,
  count(*) FILTER (
    WHERE lower(coalesce(so.status, '')) = 'recusada'
  )::bigint AS refused,
  count(*) FILTER (
    WHERE coalesce(bc.billing_count, 0) = 0
  )::bigint AS without_billing,
  count(*) FILTER (
    WHERE coalesce(bc.billing_count, 0) > 1
  )::bigint AS with_duplicate_billing,
  count(*) FILTER (
    WHERE coalesce(so.fat_calculado, 0) <> 0
       OR coalesce(so.valor_estimado, 0) <> 0
       OR coalesce(so.lucro_calculado, 0) <> 0
       OR coalesce(so.margem_calculada, 0) <> 0
       OR coalesce(so.custo_total_alocado, 0) <> 0
  )::bigint AS with_financial_mirrors,
  count(*) FILTER (
    WHERE lower(coalesce(so.status, '')) = 'recusada'
      AND (
        coalesce(so.fat_calculado, 0) <> 0
        OR coalesce(so.valor_estimado, 0) <> 0
        OR coalesce(so.lucro_calculado, 0) <> 0
        OR coalesce(so.margem_calculada, 0) <> 0
      )
  )::bigint AS refused_with_nonzero_values,
  count(*) FILTER (
    WHERE lower(coalesce(so.status, '')) = 'cancelada'
      AND lb.id IS NULL
  )::bigint AS cancelled_without_billing,
  count(*) FILTER (
    WHERE lower(coalesce(so.status, '')) = 'cancelada'
      AND lb.id IS NOT NULL
      AND abs(coalesce(so.fat_calculado, 0) - coalesce(lb.fat_total, 0)) > 0.01
  )::bigint AS cancelled_mirror_diff_billing
FROM public.service_orders so
LEFT JOIN billing_counts bc ON bc.service_order_id = so.id
LEFT JOIN latest_billing lb
  ON lb.service_order_id = so.id AND lb.rn = 1;

-- BLOCO 3 — Escort Billings
-- Consulta 3.1 — Totais por status
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  upper(coalesce(status, '<NULL>')) AS status,
  count(*)::bigint AS records
FROM public.escort_billings
GROUP BY upper(coalesce(status, '<NULL>'))
ORDER BY records DESC, status
LIMIT 100;

-- Consulta 3.2 — Órfãos, duplicidades e snapshots
WITH duplicate_os AS (
  SELECT service_order_id, count(*)::bigint AS n
  FROM public.escort_billings
  WHERE service_order_id IS NOT NULL
  GROUP BY service_order_id
  HAVING count(*) > 1
),
snapshot_items AS (
  SELECT ba.id AS approval_id, ba.status AS approval_status, item
  FROM public.boletim_approvals ba
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
        THEN ba.billing_snapshot
      ELSE '[]'::jsonb
    END
  ) AS item
),
snapshot_links AS (
  SELECT
    approval_id,
    approval_status,
    item->>'billing_id' AS billing_id,
    CASE
      WHEN item->>'total' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (item->>'total')::numeric
    END AS snapshot_total
  FROM snapshot_items
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
    WHERE upper(coalesce(eb.status, '')) IN
      ('APROVADA', 'FATURADO', 'FATURADA', 'PAGO', 'CANCELADO', 'CANCELADA')
  )::bigint AS frozen_billings,
  count(*) FILTER (
    WHERE upper(coalesce(eb.status, '')) IN
      ('A_VERIFICAR', 'VERIFICADA', 'PENDENTE', 'ENVIADA_APROVACAO')
  )::bigint AS open_billings,
  count(DISTINCT eb.id) FILTER (
    WHERE sl.billing_id IS NOT NULL
  )::bigint AS billings_in_snapshot,
  count(DISTINCT eb.id) FILTER (
    WHERE sl.snapshot_total IS NOT NULL
      AND abs(coalesce(eb.fat_total, 0) - sl.snapshot_total) > 0.01
  )::bigint AS billing_snapshot_value_differences
FROM public.escort_billings eb
LEFT JOIN public.service_orders so ON so.id = eb.service_order_id
LEFT JOIN snapshot_links sl ON sl.billing_id = eb.id::text;

-- BLOCO 4 — Boletim e snapshots
-- Consulta 4.1 — Approvals por status
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

-- Consulta 4.2 — Snapshot, billing e invoice
WITH snapshot_items AS (
  SELECT
    ba.id AS approval_id,
    ba.status AS approval_status,
    ba.total_value,
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
),
approval_invoice_pairs AS (
  SELECT DISTINCT si.approval_id, eb.invoice_id
  FROM snapshot_items si
  JOIN public.escort_billings eb ON eb.id::text = si.billing_id
  WHERE eb.invoice_id IS NOT NULL
),
invoice_totals AS (
  SELECT
    aip.approval_id,
    count(*)::bigint AS invoice_count,
    sum(i.value)::numeric AS invoice_total
  FROM approval_invoice_pairs aip
  JOIN public.invoices i ON i.id = aip.invoice_id
  GROUP BY aip.approval_id
),
approval_flags AS (
  SELECT
    ba.id,
    ba.status,
    ba.total_value,
    count(si.billing_id)::bigint AS snapshot_items,
    count(si.billing_id) FILTER (
      WHERE eb.id IS NULL
    )::bigint AS snapshot_items_without_billing,
    coalesce(it.invoice_count, 0)::bigint AS invoice_count,
    it.invoice_total
  FROM public.boletim_approvals ba
  LEFT JOIN snapshot_items si ON si.approval_id = ba.id
  LEFT JOIN public.escort_billings eb ON eb.id::text = si.billing_id
  LEFT JOIN invoice_totals it ON it.approval_id = ba.id
  GROUP BY ba.id, ba.status, ba.total_value, it.invoice_count, it.invoice_total
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  count(*)::bigint AS total_approvals,
  coalesce(sum(snapshot_items), 0)::bigint AS total_snapshot_items,
  coalesce(sum(snapshot_items_without_billing), 0)::bigint
    AS snapshot_items_without_billing,
  count(*) FILTER (
    WHERE upper(coalesce(status, '')) IN ('PENDENTE', 'APROVADO', 'CONFIRMADO')
      AND snapshot_items = 0
  )::bigint AS frozen_flow_without_snapshot,
  count(*) FILTER (
    WHERE invoice_count > 0
  )::bigint AS approvals_with_invoice,
  count(*) FILTER (
    WHERE upper(coalesce(status, '')) IN ('APROVADO', 'CONFIRMADO')
      AND invoice_count = 0
  )::bigint AS approved_without_invoice,
  count(*) FILTER (
    WHERE invoice_total IS NOT NULL
      AND abs(coalesce(total_value, 0) - invoice_total) > 0.01
  )::bigint AS approval_invoice_value_differences
FROM approval_flags;

-- BLOCO 5 — Invoices
-- Consulta 5.1 — Totais por status
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  upper(coalesce(status, '<NULL>')) AS status,
  count(*)::bigint AS invoices,
  sum(coalesce(value, 0))::numeric AS gross_value,
  sum(coalesce(net_value, 0))::numeric AS net_value
FROM public.invoices
GROUP BY upper(coalesce(status, '<NULL>'))
ORDER BY invoices DESC, status
LIMIT 100;

-- Consulta 5.2 — Órfãs, sem snapshot e duplicidades suspeitas
WITH invoice_approval AS (
  SELECT DISTINCT eb.invoice_id, ba.id AS approval_id
  FROM public.escort_billings eb
  JOIN public.boletim_approvals ba
    ON eb.id::text = ANY(coalesce(ba.billing_ids, ARRAY[]::text[]))
  WHERE eb.invoice_id IS NOT NULL
),
invoice_billing AS (
  SELECT invoice_id, count(*)::bigint AS billing_count
  FROM public.escort_billings
  WHERE invoice_id IS NOT NULL
  GROUP BY invoice_id
),
dup_payment AS (
  SELECT asaas_payment_id, count(*)::bigint AS n
  FROM public.invoices
  WHERE nullif(btrim(asaas_payment_id), '') IS NOT NULL
  GROUP BY asaas_payment_id
  HAVING count(*) > 1
),
dup_external AS (
  SELECT external_reference, count(*)::bigint AS n
  FROM public.invoices
  WHERE nullif(btrim(external_reference), '') IS NOT NULL
  GROUP BY external_reference
  HAVING count(*) > 1
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  count(*)::bigint AS total_invoices,
  count(*) FILTER (
    WHERE coalesce(ib.billing_count, 0) = 0
  )::bigint AS invoices_without_billing,
  count(*) FILTER (
    WHERE ia.approval_id IS NULL
  )::bigint AS invoices_without_approval_snapshot,
  count(*) FILTER (
    WHERE coalesce(ib.billing_count, 0) = 0
      AND service_order_id IS NULL
  )::bigint AS suspected_orphan_invoices,
  (SELECT count(*) FROM dup_payment)::bigint
    AS duplicate_asaas_payment_groups,
  (SELECT coalesce(sum(n), 0) FROM dup_payment)::bigint
    AS rows_in_duplicate_payment_groups,
  (SELECT count(*) FROM dup_external)::bigint
    AS duplicate_external_reference_groups,
  (SELECT coalesce(sum(n), 0) FROM dup_external)::bigint
    AS rows_in_duplicate_external_groups
FROM public.invoices i
LEFT JOIN invoice_billing ib ON ib.invoice_id = i.id
LEFT JOIN invoice_approval ia ON ia.invoice_id = i.id;

-- BLOCO 6 — Financial Transactions
-- Consulta 6.1 — Ledger por tipo, status e origem
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  upper(coalesce(type, '<NULL>')) AS type,
  upper(coalesce(status, '<NULL>')) AS status,
  coalesce(nullif(btrim(origin_type), ''), '<NULL>') AS origin_type,
  count(*)::bigint AS transactions,
  sum(coalesce(amount, 0))::numeric AS amount
FROM public.financial_transactions
GROUP BY
  upper(coalesce(type, '<NULL>')),
  upper(coalesce(status, '<NULL>')),
  coalesce(nullif(btrim(origin_type), ''), '<NULL>')
ORDER BY transactions DESC, type, status, origin_type
LIMIT 100;

-- Consulta 6.2 — Rastreabilidade e duplicidades suspeitas
WITH duplicate_origin AS (
  SELECT origin_type, origin_id, count(*)::bigint AS n
  FROM public.financial_transactions
  WHERE nullif(btrim(origin_type), '') IS NOT NULL
    AND nullif(btrim(origin_id), '') IS NOT NULL
  GROUP BY origin_type, origin_id
  HAVING count(*) > 1
),
invoice_ft AS (
  SELECT DISTINCT origin_id
  FROM public.financial_transactions
  WHERE origin_type = 'invoice'
),
billing_ft AS (
  SELECT DISTINCT origin_id
  FROM public.financial_transactions
  WHERE origin_type = 'escort_billing'
),
commercial_multi_writer AS (
  SELECT DISTINCT i.id
  FROM public.invoices i
  JOIN public.escort_billings eb ON eb.invoice_id = i.id
  JOIN invoice_ft fi ON fi.origin_id = i.id::text
  JOIN billing_ft fb ON fb.origin_id = eb.id::text
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  count(*)::bigint AS total_transactions,
  count(*) FILTER (
    WHERE nullif(btrim(origin_type), '') IS NULL
       OR nullif(btrim(origin_id), '') IS NULL
  )::bigint AS without_traceable_origin,
  (SELECT count(*) FROM duplicate_origin)::bigint
    AS duplicate_origin_groups,
  (SELECT coalesce(sum(n), 0) FROM duplicate_origin)::bigint
    AS rows_in_duplicate_origin_groups,
  (SELECT count(*) FROM commercial_multi_writer)::bigint
    AS suspected_invoice_and_billing_income_same_chain,
  count(*) FILTER (
    WHERE origin_type = 'invoice'
      AND origin_id ~ '^[0-9]+$'
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices i WHERE i.id = origin_id::integer
      )
  )::bigint AS invoice_origin_without_invoice,
  count(*) FILTER (
    WHERE origin_type = 'escort_billing'
      AND NOT EXISTS (
        SELECT 1 FROM public.escort_billings eb WHERE eb.id::text = origin_id
      )
  )::bigint AS billing_origin_without_billing
FROM public.financial_transactions;

-- Consulta 6.3 — Invoices pagas sem evento ledger de origem invoice
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  count(*) FILTER (
    WHERE upper(coalesce(i.status, '')) IN
      ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'PAID', 'PAGO')
  )::bigint AS paid_invoices,
  count(*) FILTER (
    WHERE upper(coalesce(i.status, '')) IN
      ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'PAID', 'PAGO')
      AND NOT EXISTS (
        SELECT 1
        FROM public.financial_transactions ft
        WHERE ft.origin_type = 'invoice'
          AND ft.origin_id = i.id::text
      )
  )::bigint AS paid_invoices_without_invoice_origin_transaction
FROM public.invoices i;

-- BLOCO 7 — RH e ponto
-- Consulta 7.1 — Contagens das fontes RH
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  (SELECT count(*) FROM public.control_id_punches)::bigint
    AS control_id_punches,
  (SELECT count(DISTINCT employee_id)
   FROM public.control_id_punches
   WHERE employee_id IS NOT NULL)::bigint
    AS employees_with_control_id,
  (SELECT count(*) FROM public.timesheets)::bigint
    AS timesheets,
  (SELECT count(DISTINCT employee_id) FROM public.timesheets)::bigint
    AS employees_with_timesheets,
  (SELECT count(*) FROM public.employee_timesheets)::bigint
    AS employee_timesheets,
  (SELECT count(DISTINCT employee_id)
   FROM public.employee_timesheets)::bigint
    AS employees_with_employee_timesheets,
  (SELECT count(*) FROM public.folha_historico_mensal)::bigint
    AS payroll_snapshots,
  (SELECT count(DISTINCT employee_id)
   FROM public.folha_historico_mensal)::bigint
    AS employees_with_payroll_snapshot;

-- Consulta 7.2 — Sobreposição por funcionário e competência
WITH source_periods AS (
  SELECT
    employee_id,
    to_char(
      punch_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo',
      'YYYY-MM'
    ) AS period,
    'control_id' AS source
  FROM public.control_id_punches
  WHERE employee_id IS NOT NULL

  UNION ALL

  SELECT employee_id, to_char(date, 'YYYY-MM'), 'timesheets'
  FROM public.timesheets

  UNION ALL

  SELECT employee_id, to_char(date, 'YYYY-MM'), 'employee_timesheets'
  FROM public.employee_timesheets
),
overlaps AS (
  SELECT
    employee_id,
    period,
    count(DISTINCT source)::integer AS source_count
  FROM source_periods
  GROUP BY employee_id, period
  HAVING count(DISTINCT source) > 1
),
snapshot_duplicates AS (
  SELECT employee_id, month_year, count(*)::bigint AS n
  FROM public.folha_historico_mensal
  GROUP BY employee_id, month_year
  HAVING count(*) > 1
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  count(*)::bigint AS employee_periods_in_multiple_sources,
  count(DISTINCT employee_id)::bigint AS employees_in_multiple_sources,
  count(*) FILTER (
    WHERE source_count = 3
  )::bigint AS employee_periods_in_all_three_sources,
  (SELECT count(*) FROM snapshot_duplicates)::bigint
    AS duplicate_payroll_snapshot_groups
FROM overlaps;

-- Consulta 7.3 — Períodos bloqueados e meses com batidas
WITH punch_months AS (
  SELECT DISTINCT
    date_trunc(
      'month',
      punch_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'
    )::date AS month_start
  FROM public.control_id_punches
),
month_flags AS (
  SELECT
    pm.month_start,
    EXISTS (
      SELECT 1
      FROM public.control_id_locked_periods lp
      WHERE lp.start_date <=
        (pm.month_start + INTERVAL '1 month - 1 day')::date
        AND lp.end_date >= pm.month_start
    ) AS has_overlapping_lock
  FROM punch_months pm
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  (SELECT count(*) FROM public.control_id_locked_periods)::bigint
    AS locked_periods,
  count(*)::bigint AS months_with_control_id_data,
  count(*) FILTER (
    WHERE has_overlapping_lock
  )::bigint AS months_with_overlapping_lock,
  count(*) FILTER (
    WHERE NOT has_overlapping_lock
  )::bigint AS months_without_overlapping_lock
FROM month_flags;

-- BLOCO 8 — Espelhos financeiros
WITH latest_billing AS (
  SELECT
    eb.*,
    row_number() OVER (
      PARTITION BY service_order_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.escort_billings eb
  WHERE service_order_id IS NOT NULL
),
snapshot_os AS (
  SELECT DISTINCT
    CASE
      WHEN item->>'service_order_id' ~ '^[0-9]+$'
        THEN (item->>'service_order_id')::integer
    END AS service_order_id
  FROM public.boletim_approvals ba
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(ba.billing_snapshot) = 'array'
        THEN ba.billing_snapshot
      ELSE '[]'::jsonb
    END
  ) AS item
),
classified AS (
  SELECT
    so.id,
    CASE
      WHEN sn.service_order_id IS NOT NULL THEN 'frozen'
      WHEN lb.id IS NULL
        AND (
          coalesce(so.fat_calculado, 0) <> 0
          OR coalesce(so.custo_total_alocado, 0) <> 0
        ) THEN 'legacy'
      WHEN lb.id IS NULL THEN 'not_comparable'
      WHEN abs(
        coalesce(so.fat_calculado, 0) - coalesce(lb.fat_total, 0)
      ) <= 0.01 THEN 'consistent'
      ELSE 'divergent'
    END AS fat_class,
    CASE
      WHEN lb.id IS NULL THEN 'not_comparable'
      WHEN abs(
        coalesce(so.custo_total_alocado, 0) -
        (
          coalesce(lb.pag_total, 0) +
          coalesce(
            nullif(lb.desp_total, 0),
            coalesce(lb.despesas_pedagio, 0) +
            coalesce(lb.despesas_combustivel, 0) +
            coalesce(lb.despesas_outras, 0)
          )
        )
      ) <= 0.01 THEN 'consistent'
      ELSE 'divergent'
    END AS cost_class,
    (
      coalesce(so.lucro_calculado, 0) <> 0
      OR coalesce(so.margem_calculada, 0) <> 0
    ) AS has_profit_mirrors
  FROM public.service_orders so
  LEFT JOIN latest_billing lb
    ON lb.service_order_id = so.id AND lb.rn = 1
  LEFT JOIN snapshot_os sn ON sn.service_order_id = so.id
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  fat_class,
  cost_class,
  has_profit_mirrors,
  count(*)::bigint AS service_orders
FROM classified
GROUP BY fat_class, cost_class, has_profit_mirrors
ORDER BY service_orders DESC, fat_class, cost_class
LIMIT 100;

-- BLOCO 9 — Cache
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  CASE
    WHEN position('?' IN key) > 0 THEN split_part(key, '?', 1)
    ELSE key
  END AS key_prefix,
  count(*)::bigint AS snapshots,
  min(at) AS oldest_at,
  max(at) AS newest_at,
  max(extract(epoch FROM (now() - at)))::bigint AS max_age_seconds,
  count(*) FILTER (
    WHERE now() - at > INTERVAL '3 hours'
  )::bigint AS older_than_3h,
  count(*) FILTER (
    WHERE now() - at > INTERVAL '24 hours'
  )::bigint AS older_than_24h
FROM public.swr_cache_snapshots
GROUP BY
  CASE
    WHEN position('?' IN key) > 0 THEN split_part(key, '?', 1)
    ELSE key
  END
ORDER BY snapshots DESC, key_prefix
LIMIT 100;

-- BLOCO 10 — Catálogo live
-- Consulta 10.1 — Objetos esperados no repositório e catálogo live
WITH expected(kind, object_name) AS (
  VALUES
    ('table', 'service_orders'),
    ('table', 'escort_billings'),
    ('table', 'boletim_approvals'),
    ('table', 'invoices'),
    ('table', 'financial_transactions'),
    ('table', 'control_id_punches'),
    ('table', 'timesheets'),
    ('table', 'employee_timesheets'),
    ('table', 'folha_historico_mensal'),
    ('table', 'swr_cache_snapshots'),
    ('view', 'v_resumo_financeiro'),
    ('function', 'calc_mission_elapsed_hours'),
    ('function', 'get_daily_fleet_summary'),
    ('function', 'get_fleet_totals'),
    ('function', 'exec_sql'),
    ('function', 'db_telemetry_snapshot'),
    ('function', 'db_table_sizes'),
    ('function', 'db_top_queries')
),
live_relations AS (
  SELECT
    CASE c.relkind
      WHEN 'r' THEN 'table'
      WHEN 'p' THEN 'table'
      WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized_view'
    END AS kind,
    c.relname AS object_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm')
),
live_functions AS (
  SELECT
    CASE p.prokind
      WHEN 'p' THEN 'procedure'
      ELSE 'function'
    END AS kind,
    p.proname AS object_name
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
)
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  e.kind AS expected_kind,
  e.object_name,
  CASE
    WHEN lr.object_name IS NOT NULL OR lf.object_name IS NOT NULL
      THEN 'confirmed_live'
    ELSE 'absent_live'
  END AS live_status
FROM expected e
LEFT JOIN live_relations lr
  ON lr.kind = e.kind AND lr.object_name = e.object_name
LEFT JOIN live_functions lf
  ON e.kind = 'function' AND lf.object_name = e.object_name
ORDER BY e.kind, e.object_name
LIMIT 100;

-- Consulta 10.2 — Tabelas, views e materialized views
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  n.nspname AS schema_name,
  c.relname AS object_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned_table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
    ELSE c.relkind::text
  END AS object_type
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm')
ORDER BY object_type, object_name
LIMIT 100;

-- Consulta 10.3 — Functions, procedures e RPCs
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  n.nspname AS schema_name,
  p.proname AS object_name,
  CASE p.prokind
    WHEN 'p' THEN 'procedure'
    ELSE 'function'
  END AS object_type,
  CASE p.provolatile
    WHEN 'i' THEN 'immutable'
    WHEN 's' THEN 'stable'
    ELSE 'volatile'
  END AS volatility
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY object_type, object_name
LIMIT 100;

-- Consulta 10.4 — Triggers
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  event_object_schema AS schema_name,
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY table_name, trigger_name, event_manipulation
LIMIT 100;

-- Consulta 10.5 — Policies
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  schemaname AS schema_name,
  tablename AS table_name,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY table_name, policyname
LIMIT 100;

-- Consulta 10.6 — Indexes das tabelas críticas
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  schemaname AS schema_name,
  tablename AS table_name,
  indexname,
  indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'service_orders',
    'escort_billings',
    'boletim_approvals',
    'invoices',
    'financial_transactions',
    'control_id_punches',
    'timesheets',
    'employee_timesheets',
    'folha_historico_mensal',
    'swr_cache_snapshots'
  )
ORDER BY table_name, indexname
LIMIT 100;

-- Consulta 10.7 — Constraints das tabelas críticas
SELECT
  now() AT TIME ZONE 'UTC' AS consulted_at_utc,
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'service_orders',
    'escort_billings',
    'boletim_approvals',
    'invoices',
    'financial_transactions',
    'control_id_punches',
    'timesheets',
    'employee_timesheets',
    'folha_historico_mensal',
    'swr_cache_snapshots'
  )
ORDER BY tc.table_name, tc.constraint_name
LIMIT 100;
