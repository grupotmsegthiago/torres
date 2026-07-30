-- =============================================================================
-- PARTE B — Correção 1 / FASE 5
-- Consultas SOMENTE LEITURA — executar no Supabase SQL Editor
-- NÃO exibir biometria, documentos, tokens ou payload pessoal completo.
--
-- Executar UM bloco por vez (SQL 1 → SQL 8).
-- SQL 5 só se SQL 4 indicar algum campo candidato > 0.
-- Competência: punch_at >= 2026-06-26 00:00 BRT AND punch_at < 2026-07-26 00:00 BRT
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SQL 1 — Device #1 é rhid_cloud? (qual path de fetch)
-- CUIDADO: não compartilhar base_url publicamente.
-- ---------------------------------------------------------------------------
SELECT id, nome, tipo, base_url, last_sync_at, last_sync_status, last_sync_message
FROM control_id_devices
ORDER BY id;

-- ---------------------------------------------------------------------------
-- SQL 2 — Breakdown direction × source × padrão de external_id (competência)
-- ---------------------------------------------------------------------------
SELECT
  direction,
  COALESCE(source, '(null)') AS source,
  CASE
    WHEN external_id ~ '^[0-9]+$' THEN 'pure_numeric'
    WHEN external_id ~ '^rhid_' THEN 'rhid'
    WHEN external_id IS NULL OR external_id = '' THEN 'empty'
    ELSE 'other'
  END AS ext_pattern,
  COUNT(*) AS n
FROM control_id_punches
WHERE employee_id IN (14,16,18,21,22,25,26,27,31,36,44,45,47,48,51,52,53)
  AND punch_at >= '2026-06-26 00:00:00-03'
  AND punch_at < '2026-07-26 00:00:00-03'
GROUP BY 1, 2, 3
ORDER BY n DESC;

-- ---------------------------------------------------------------------------
-- SQL 3 — Chaves do raw_event (estrutura) em amostra de unknown rhid_*
--          NÃO retorna o JSON completo — só lista de chaves.
-- ---------------------------------------------------------------------------
SELECT
  id,
  employee_id,
  punch_at,
  direction,
  COALESCE(source, '(null)') AS source,
  left(external_id, 24) AS external_id_prefix,
  (
    SELECT array_agg(key_name ORDER BY key_name)
    FROM jsonb_object_keys(COALESCE(raw_event, '{}'::jsonb))
         AS keys(key_name)
  ) AS raw_keys
FROM control_id_punches
WHERE direction = 'unknown'
  AND external_id LIKE 'rhid_%'
  AND punch_at >= '2026-06-26 00:00:00-03'
  AND punch_at < '2026-07-26 00:00:00-03'
ORDER BY punch_at
LIMIT 30;

-- ---------------------------------------------------------------------------
-- SQL 4 — Frequência de chaves candidatas a direção no raw_event (unknown AFD)
-- ---------------------------------------------------------------------------
WITH unk AS (
  SELECT id, raw_event
  FROM control_id_punches
  WHERE direction = 'unknown'
    AND external_id LIKE 'rhid_%'
    AND punch_at >= '2026-06-26 00:00:00-03'
    AND punch_at < '2026-07-26 00:00:00-03'
)
SELECT
  COUNT(*) AS total_unknown_rhid,
  COUNT(*) FILTER (WHERE raw_event ? 'direction') AS has_direction,
  COUNT(*) FILTER (WHERE raw_event ? 'flow') AS has_flow,
  COUNT(*) FILTER (WHERE raw_event ? 'tipo') AS has_tipo,
  COUNT(*) FILTER (WHERE raw_event ? 'Tipo') AS has_Tipo,
  COUNT(*) FILTER (WHERE raw_event ? 'event') AS has_event,
  COUNT(*) FILTER (WHERE raw_event ? 'inOut') AS has_inOut,
  COUNT(*) FILTER (WHERE raw_event ? 'InOut') AS has_InOut,
  COUNT(*) FILTER (WHERE raw_event ? 'status') AS has_status,
  COUNT(*) FILTER (WHERE raw_event ? 'faceScore') AS has_faceScore,
  COUNT(*) FILTER (WHERE raw_event ? 'idPerson' OR raw_event ? 'IdPerson') AS has_idPerson,
  COUNT(*) FILTER (WHERE raw_event ? 'dateTime' OR raw_event ? 'DateTime') AS has_dateTime
FROM unk;

-- ---------------------------------------------------------------------------
-- SQL 5 — Valores distintos (anonimizados) de campos candidatos, se existirem
--          Só corre se SQL 4 indicar presença > 0.
-- ---------------------------------------------------------------------------
SELECT
  key,
  left(value, 40) AS value_sample,
  COUNT(*) AS n
FROM control_id_punches
CROSS JOIN LATERAL jsonb_each_text(COALESCE(raw_event, '{}'::jsonb)) AS e(key, value)
WHERE direction = 'unknown'
  AND external_id LIKE 'rhid_%'
  AND punch_at >= '2026-06-26 00:00:00-03'
  AND punch_at < '2026-07-26 00:00:00-03'
  AND key IN (
    'direction', 'flow', 'tipo', 'Tipo', 'event', 'inOut', 'InOut', 'status'
  )
GROUP BY 1, 2
ORDER BY 1, n DESC
LIMIT 100;

-- ---------------------------------------------------------------------------
-- SQL 6 — Unknown nos últimos 7 e 30 dias (volume atual)
-- ---------------------------------------------------------------------------
SELECT
  COUNT(*) FILTER (
    WHERE direction = 'unknown'
      AND punch_at >= NOW() - INTERVAL '7 days'
  ) AS unknown_last_7d,
  COUNT(*) FILTER (
    WHERE direction = 'unknown'
      AND punch_at >= NOW() - INTERVAL '30 days'
  ) AS unknown_last_30d,
  COUNT(*) FILTER (
    WHERE direction = 'unknown'
      AND source IS NULL
      AND external_id LIKE 'rhid_%'
      AND punch_at >= NOW() - INTERVAL '7 days'
  ) AS unk_afd_puro_7d,
  COUNT(*) FILTER (
    WHERE direction = 'unknown'
      AND source IN ('admin_manual', 'self_manual', 'manual')
      AND punch_at >= NOW() - INTERVAL '7 days'
  ) AS unk_manual_7d,
  COUNT(*) FILTER (
    WHERE direction = 'unknown'
      AND source IS NULL
      AND external_id LIKE 'rhid_%'
      AND punch_at >= NOW() - INTERVAL '30 days'
  ) AS unk_afd_puro_30d,
  COUNT(*) FILTER (
    WHERE direction = 'unknown'
      AND source IN ('admin_manual', 'self_manual', 'manual')
      AND punch_at >= NOW() - INTERVAL '30 days'
  ) AS unk_manual_30d
FROM control_id_punches;

-- ---------------------------------------------------------------------------
-- SQL 7 — Últimas 50 batidas (só metadados; sem raw_event)
-- ---------------------------------------------------------------------------
SELECT id, employee_id, punch_at, direction, source,
       left(COALESCE(external_id, ''), 32) AS external_id_prefix,
       created_at
FROM control_id_punches
ORDER BY id DESC
LIMIT 50;

-- ---------------------------------------------------------------------------
-- SQL 8 — Por funcionário na competência (C1 AFD vs C2 manual)
-- ---------------------------------------------------------------------------
SELECT
  employee_id,
  COUNT(*) FILTER (
    WHERE direction = 'unknown' AND source IS NULL AND external_id LIKE 'rhid_%'
  ) AS c1_afd_parser,
  COUNT(*) FILTER (
    WHERE direction = 'unknown' AND source IN ('admin_manual', 'self_manual', 'manual')
  ) AS c2_manual,
  COUNT(*) FILTER (WHERE direction = 'unknown') AS unknown_total,
  COUNT(*) FILTER (WHERE direction = 'in') AS in_n,
  COUNT(*) FILTER (WHERE direction = 'out') AS out_n,
  COUNT(*) AS total
FROM control_id_punches
WHERE employee_id IN (14,16,18,21,22,25,26,27,31,36,44,45,47,48,51,52,53)
  AND punch_at >= '2026-06-26 00:00:00-03'
  AND punch_at < '2026-07-26 00:00:00-03'
GROUP BY employee_id
ORDER BY employee_id;
