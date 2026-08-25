-- PR5B.1-TX — introspecção live de proteção atômica de billing
-- Projeto esperado: Torres (project_ref erjhxwbutjyylxdthuuz)
-- SOMENTE LEITURA. Executar cada consulta isoladamente e exportar o resultado.

-- TX-01 — contexto técnico seguro
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  current_database() AS database_name,
  current_schema() AS current_schema_name,
  current_user AS current_role_name,
  current_setting('server_version') AS postgres_version;

-- TX-02 — definição dos triggers validate_* conhecidos
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  trigger_ns.nspname AS trigger_schema,
  table_ns.nspname AS table_schema,
  table_class.relname AS table_name,
  trigger_row.tgname AS trigger_name,
  CASE
    WHEN (trigger_row.tgtype & 2) <> 0 THEN 'BEFORE'
    WHEN (trigger_row.tgtype & 64) <> 0 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS trigger_timing,
  concat_ws(
    ',',
    CASE WHEN (trigger_row.tgtype & 4) <> 0 THEN 'INSERT' END,
    CASE WHEN (trigger_row.tgtype & 8) <> 0 THEN 'DELETE' END,
    CASE WHEN (trigger_row.tgtype & 16) <> 0 THEN 'UPDATE' END,
    CASE WHEN (trigger_row.tgtype & 32) <> 0 THEN 'TRUNCATE' END
  ) AS trigger_events,
  proc_ns.nspname AS function_schema,
  proc_row.proname AS function_name,
  pg_get_function_identity_arguments(proc_row.oid) AS function_arguments,
  proc_row.prosecdef AS security_definer,
  pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition,
  pg_get_functiondef(proc_row.oid) AS function_definition
FROM pg_catalog.pg_trigger AS trigger_row
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = trigger_row.tgrelid
JOIN pg_catalog.pg_namespace AS table_ns
  ON table_ns.oid = table_class.relnamespace
JOIN pg_catalog.pg_proc AS proc_row
  ON proc_row.oid = trigger_row.tgfoid
JOIN pg_catalog.pg_namespace AS proc_ns
  ON proc_ns.oid = proc_row.pronamespace
JOIN pg_catalog.pg_namespace AS trigger_ns
  ON trigger_ns.oid = table_class.relnamespace
WHERE NOT trigger_row.tgisinternal
  AND (
    trigger_row.tgname IN (
      'trg_validate_escort_billing_approval',
      'trg_validate_service_order_approval'
    )
    OR trigger_row.tgname ILIKE 'trg_validate_%'
  )
ORDER BY table_ns.nspname, table_class.relname, trigger_row.tgname
LIMIT 100;

-- TX-03 — todos os triggers das tabelas críticas
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  table_ns.nspname AS table_schema,
  table_class.relname AS table_name,
  trigger_row.tgname AS trigger_name,
  proc_ns.nspname AS function_schema,
  proc_row.proname AS function_name,
  trigger_row.tgenabled AS enabled_mode,
  pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition
FROM pg_catalog.pg_trigger AS trigger_row
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = trigger_row.tgrelid
JOIN pg_catalog.pg_namespace AS table_ns
  ON table_ns.oid = table_class.relnamespace
JOIN pg_catalog.pg_proc AS proc_row
  ON proc_row.oid = trigger_row.tgfoid
JOIN pg_catalog.pg_namespace AS proc_ns
  ON proc_ns.oid = proc_row.pronamespace
WHERE NOT trigger_row.tgisinternal
  AND table_ns.nspname = 'public'
  AND table_class.relname IN (
    'escort_billings',
    'boletim_approvals',
    'service_orders',
    'invoices',
    'financial_transactions'
  )
ORDER BY table_class.relname, trigger_row.tgname
LIMIT 100;

-- TX-04 — funções diretamente associadas aos triggers críticos
WITH trigger_functions AS (
  SELECT DISTINCT trigger_row.tgfoid AS function_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS table_class
    ON table_class.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS table_ns
    ON table_ns.oid = table_class.relnamespace
  WHERE NOT trigger_row.tgisinternal
    AND table_ns.nspname = 'public'
    AND (
      table_class.relname IN ('escort_billings', 'boletim_approvals', 'service_orders')
      OR trigger_row.tgname ILIKE 'trg_validate_%'
    )
)
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  proc_ns.nspname AS function_schema,
  proc_row.proname AS function_name,
  pg_get_function_identity_arguments(proc_row.oid) AS function_arguments,
  CASE proc_row.prokind
    WHEN 'p' THEN 'PROCEDURE'
    WHEN 'f' THEN 'FUNCTION'
    ELSE proc_row.prokind::text
  END AS routine_kind,
  proc_row.prosecdef AS security_definer,
  proc_row.provolatile AS volatility,
  proc_row.proconfig AS function_configuration,
  pg_get_functiondef(proc_row.oid) AS function_definition
FROM trigger_functions
JOIN pg_catalog.pg_proc AS proc_row
  ON proc_row.oid = trigger_functions.function_oid
JOIN pg_catalog.pg_namespace AS proc_ns
  ON proc_ns.oid = proc_row.pronamespace
ORDER BY proc_ns.nspname, proc_row.proname
LIMIT 100;

-- TX-05 — catálogo de functions/procedures candidatas por nome
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  proc_ns.nspname AS routine_schema,
  proc_row.proname AS routine_name,
  pg_get_function_identity_arguments(proc_row.oid) AS routine_arguments,
  CASE proc_row.prokind
    WHEN 'p' THEN 'PROCEDURE'
    WHEN 'f' THEN 'FUNCTION'
    ELSE proc_row.prokind::text
  END AS routine_kind,
  proc_row.prosecdef AS security_definer,
  proc_row.provolatile AS volatility,
  pg_get_functiondef(proc_row.oid) AS routine_definition
FROM pg_catalog.pg_proc AS proc_row
JOIN pg_catalog.pg_namespace AS proc_ns
  ON proc_ns.oid = proc_row.pronamespace
WHERE proc_ns.nspname = 'public'
  AND proc_row.prokind IN ('f', 'p')
  AND (
    proc_row.proname ILIKE '%validate%'
    OR proc_row.proname ILIKE '%billing%'
    OR proc_row.proname ILIKE '%boletim%'
    OR proc_row.proname ILIKE '%approval%'
    OR proc_row.proname ILIKE '%snapshot%'
    OR proc_row.proname = 'exec_sql'
  )
ORDER BY proc_row.proname, pg_get_function_identity_arguments(proc_row.oid)
LIMIT 100;

-- TX-06 — constraints críticas e respectivas definições
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  table_ns.nspname AS table_schema,
  table_class.relname AS table_name,
  constraint_row.conname AS constraint_name,
  CASE constraint_row.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE constraint_row.contype::text
  END AS constraint_type,
  pg_get_constraintdef(constraint_row.oid, true) AS constraint_definition
FROM pg_catalog.pg_constraint AS constraint_row
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = constraint_row.conrelid
JOIN pg_catalog.pg_namespace AS table_ns
  ON table_ns.oid = table_class.relnamespace
WHERE table_ns.nspname = 'public'
  AND table_class.relname IN (
    'escort_billings',
    'boletim_approvals',
    'service_orders',
    'invoices',
    'financial_transactions'
  )
ORDER BY table_class.relname, constraint_row.conname
LIMIT 100;

-- TX-07 — índices das tabelas críticas
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  index_row.schemaname AS table_schema,
  index_row.tablename AS table_name,
  index_row.indexname AS index_name,
  index_row.indexdef AS index_definition
FROM pg_catalog.pg_indexes AS index_row
WHERE index_row.schemaname = 'public'
  AND index_row.tablename IN (
    'escort_billings',
    'boletim_approvals',
    'service_orders',
    'invoices',
    'financial_transactions'
  )
ORDER BY index_row.tablename, index_row.indexname
LIMIT 100;

-- TX-08 — RLS e policies das tabelas críticas
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  class_ns.nspname AS table_schema,
  class_row.relname AS table_name,
  class_row.relrowsecurity AS rls_enabled,
  class_row.relforcerowsecurity AS rls_forced,
  policy_row.polname AS policy_name,
  policy_row.polpermissive AS policy_permissive,
  pg_get_expr(policy_row.polqual, policy_row.polrelid) AS using_expression,
  pg_get_expr(policy_row.polwithcheck, policy_row.polrelid) AS with_check_expression
FROM pg_catalog.pg_class AS class_row
JOIN pg_catalog.pg_namespace AS class_ns
  ON class_ns.oid = class_row.relnamespace
LEFT JOIN pg_catalog.pg_policy AS policy_row
  ON policy_row.polrelid = class_row.oid
WHERE class_ns.nspname = 'public'
  AND class_row.relname IN (
    'escort_billings',
    'boletim_approvals',
    'service_orders',
    'invoices',
    'financial_transactions'
  )
ORDER BY class_row.relname, policy_row.polname
LIMIT 100;

-- TX-09 — privilégios efetivos nas tabelas e rotinas candidatas
WITH table_grants AS (
  SELECT
    grant_row.table_schema AS object_schema,
    grant_row.table_name AS object_name,
    'TABLE'::text AS object_kind,
    grant_row.grantee,
    grant_row.privilege_type
  FROM information_schema.role_table_grants AS grant_row
  WHERE grant_row.table_schema = 'public'
    AND grant_row.table_name IN ('escort_billings', 'boletim_approvals')
),
routine_grants AS (
  SELECT
    grant_row.routine_schema AS object_schema,
    grant_row.routine_name AS object_name,
    'ROUTINE'::text AS object_kind,
    grant_row.grantee,
    grant_row.privilege_type
  FROM information_schema.role_routine_grants AS grant_row
  WHERE grant_row.routine_schema = 'public'
    AND (
      grant_row.routine_name ILIKE '%validate%'
      OR grant_row.routine_name ILIKE '%billing%'
      OR grant_row.routine_name ILIKE '%boletim%'
      OR grant_row.routine_name ILIKE '%approval%'
      OR grant_row.routine_name ILIKE '%snapshot%'
      OR grant_row.routine_name = 'exec_sql'
    )
)
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  combined.object_schema,
  combined.object_name,
  combined.object_kind,
  combined.grantee,
  combined.privilege_type
FROM (
  SELECT object_schema, object_name, object_kind, grantee, privilege_type
  FROM table_grants
  UNION ALL
  SELECT object_schema, object_name, object_kind, grantee, privilege_type
  FROM routine_grants
) AS combined
ORDER BY combined.object_kind, combined.object_name, combined.grantee, combined.privilege_type
LIMIT 100;

-- TX-10 — dependências catalogadas das funções candidatas
WITH candidate_functions AS (
  SELECT proc_row.oid AS function_oid
  FROM pg_catalog.pg_proc AS proc_row
  JOIN pg_catalog.pg_namespace AS proc_ns
    ON proc_ns.oid = proc_row.pronamespace
  WHERE proc_ns.nspname = 'public'
    AND (
      proc_row.proname ILIKE '%validate%'
      OR proc_row.proname ILIKE '%billing%'
      OR proc_row.proname ILIKE '%boletim%'
      OR proc_row.proname ILIKE '%approval%'
      OR proc_row.proname ILIKE '%snapshot%'
      OR proc_row.proname = 'exec_sql'
    )
)
SELECT
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS consulted_at_utc,
  proc_ns.nspname AS function_schema,
  proc_row.proname AS function_name,
  pg_get_function_identity_arguments(proc_row.oid) AS function_arguments,
  dependency_row.deptype AS dependency_type,
  referenced_ns.nspname AS referenced_schema,
  referenced_class.relname AS referenced_object
FROM candidate_functions
JOIN pg_catalog.pg_proc AS proc_row
  ON proc_row.oid = candidate_functions.function_oid
JOIN pg_catalog.pg_namespace AS proc_ns
  ON proc_ns.oid = proc_row.pronamespace
LEFT JOIN pg_catalog.pg_depend AS dependency_row
  ON dependency_row.classid = 'pg_proc'::regclass
  AND dependency_row.objid = proc_row.oid
LEFT JOIN pg_catalog.pg_class AS referenced_class
  ON dependency_row.refclassid = 'pg_class'::regclass
  AND referenced_class.oid = dependency_row.refobjid
LEFT JOIN pg_catalog.pg_namespace AS referenced_ns
  ON referenced_ns.oid = referenced_class.relnamespace
ORDER BY proc_row.proname, referenced_ns.nspname, referenced_class.relname
LIMIT 100;
