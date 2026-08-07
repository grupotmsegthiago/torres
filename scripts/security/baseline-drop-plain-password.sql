-- =============================================================================
-- baseline-drop-plain-password.sql
-- Somente leitura — pré-DROP de public.users.plain_password (D13 / PR4B).
-- NÃO seleciona valores de plain_password, email, nome ou username.
-- NÃO altera dados. NÃO aplica DROP.
-- Uso: SQL Editor Supabase ou psql (homologação controlada).
-- Esperado (baseline Torres 2026-08-05): total=36, filled=0, null=36, Auth=36.
-- =============================================================================

-- 1) Contagens principais + existência da coluna
SELECT
  COUNT(*)::int AS total_users,
  COUNT(*) FILTER (
    WHERE plain_password IS NOT NULL AND btrim(plain_password) <> ''
  )::int AS plain_password_filled,
  COUNT(*) FILTER (
    WHERE plain_password IS NULL
  )::int AS plain_password_null,
  COUNT(*) FILTER (
    WHERE plain_password IS NOT NULL AND plain_password = ''
  )::int AS plain_password_empty,
  COUNT(*) FILTER (
    WHERE supabase_uid IS NOT NULL AND btrim(supabase_uid) <> ''
  )::int AS with_supabase_uid,
  COUNT(*) FILTER (
    WHERE supabase_uid IS NULL OR btrim(supabase_uid) = ''
  )::int AS without_supabase_uid,
  COUNT(*) FILTER (
    WHERE supabase_uid IS NOT NULL
      AND btrim(supabase_uid) <> ''
      AND EXISTS (
        SELECT 1 FROM auth.users au
        WHERE au.id::text = public.users.supabase_uid
      )
  )::int AS auth_match,
  COUNT(*) FILTER (
    WHERE supabase_uid IS NOT NULL
      AND btrim(supabase_uid) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM auth.users au
        WHERE au.id::text = public.users.supabase_uid
      )
  )::int AS public_users_without_auth_match,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plain_password'
  ) AS plain_password_column_exists,
  NOW() AT TIME ZONE 'UTC' AS consulted_at_utc
FROM public.users;

-- 2) RLS / policies / grants (sem PII)
SELECT
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (
    SELECT COUNT(*)::int
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.users'::regclass
  ) AS policy_count,
  (
    SELECT COUNT(*)::int
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.users'::regclass
      AND pg_get_expr(pol.polqual, pol.polrelid) = 'true'
  ) AS policies_using_true,
  (
    SELECT COUNT(*)::int
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.users'::regclass
      AND pol.polname = 'users_select_own'
      AND pol.polcmd = 'r'
  ) AS users_select_own_present,
  (
    SELECT COUNT(*)::int
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon'
  ) AS anon_table_grants,
  (
    SELECT COUNT(*)::int
    FROM information_schema.role_column_grants
    WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon'
  ) AS anon_column_grants,
  (
    SELECT COUNT(*)::int
    FROM information_schema.role_column_grants
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND grantee = 'authenticated'
      AND column_name = 'plain_password'
  ) AS authenticated_plain_password_column_grants,
  has_table_privilege('service_role', 'public.users', 'SELECT') AS service_role_select,
  has_table_privilege('service_role', 'public.users', 'UPDATE') AS service_role_update,
  NOW() AT TIME ZONE 'UTC' AS consulted_at_utc
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'users';

-- 3) Dependências da coluna (contagens — sem nomes de usuários / PII)
SELECT
  (
    SELECT COUNT(*)::int
    FROM pg_depend d
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    JOIN pg_class t ON t.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND a.attname = 'plain_password'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND d.deptype = 'n'
  ) AS dep_pg_depend_external,
  (
    SELECT COUNT(*)::int
    FROM information_schema.view_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plain_password'
  ) AS dep_views,
  (
    SELECT COUNT(*)::int
    FROM pg_matviews mv
    WHERE mv.definition ILIKE '%plain_password%'
      AND mv.schemaname = 'public'
  ) AS dep_matviews,
  (
    SELECT COUNT(*)::int
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ILIKE '%plain_password%'
  ) AS dep_functions,
  (
    SELECT COUNT(*)::int
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'p'
      AND pg_get_functiondef(p.oid) ILIKE '%plain_password%'
  ) AS dep_procedures,
  (
    SELECT COUNT(*)::int
    FROM pg_trigger tr
    JOIN pg_class t ON t.oid = tr.tgrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND NOT tr.tgisinternal
      AND pg_get_triggerdef(tr.oid) ILIKE '%plain_password%'
  ) AS dep_triggers,
  (
    SELECT COUNT(*)::int
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND a.attname = 'plain_password'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) AS dep_indexes,
  (
    SELECT COUNT(*)::int
    FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plain_password'
  ) AS dep_constraints,
  (
    SELECT COUNT(*)::int
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.users'::regclass
      AND (
        COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') ILIKE '%plain_password%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ILIKE '%plain_password%'
      )
  ) AS dep_policies,
  (
    SELECT COUNT(*)::int
    FROM pg_attribute a
    JOIN pg_class t ON t.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND a.attname = 'plain_password'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attgenerated <> ''
  ) AS dep_generated_columns,
  (
    SELECT COUNT(*)::int
    FROM pg_rewrite r
    JOIN pg_class c ON c.oid = r.ev_class
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND r.rulename <> '_RETURN'
      AND pg_get_ruledef(r.oid) ILIKE '%plain_password%'
  ) AS dep_rules,
  NOW() AT TIME ZONE 'UTC' AS consulted_at_utc;

-- 4) Grants da coluna (diagnóstico — NÃO bloqueiam DROP; somem com a coluna)
SELECT
  COUNT(*)::int AS plain_password_column_grants_total,
  COUNT(*) FILTER (WHERE grantee = 'anon')::int AS grants_anon,
  COUNT(*) FILTER (WHERE grantee = 'authenticated')::int AS grants_authenticated,
  COUNT(*) FILTER (WHERE grantee = 'service_role')::int AS grants_service_role,
  COUNT(*) FILTER (WHERE grantee = 'postgres')::int AS grants_postgres,
  NOW() AT TIME ZONE 'UTC' AS consulted_at_utc
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'plain_password';

-- 5) Soma de dependências bloqueantes (deve ser 0 antes do DROP; grants excluídos)
SELECT
  (
    (
      SELECT COUNT(*)::int
      FROM pg_depend d
      JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
      JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'users'
        AND a.attname = 'plain_password'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND d.deptype = 'n'
    )
    + (
      SELECT COUNT(*)::int
      FROM information_schema.view_column_usage
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'plain_password'
    )
    + (
      SELECT COUNT(*)::int
      FROM pg_matviews mv
      WHERE mv.definition ILIKE '%plain_password%'
        AND mv.schemaname = 'public'
    )
    + (
      SELECT COUNT(*)::int
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prokind IN ('f', 'p')
        AND pg_get_functiondef(p.oid) ILIKE '%plain_password%'
    )
    + (
      SELECT COUNT(*)::int
      FROM pg_trigger tr
      JOIN pg_class t ON t.oid = tr.tgrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'users'
        AND NOT tr.tgisinternal
        AND pg_get_triggerdef(tr.oid) ILIKE '%plain_password%'
    )
    + (
      SELECT COUNT(*)::int
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
      WHERE n.nspname = 'public'
        AND t.relname = 'users'
        AND a.attname = 'plain_password'
        AND a.attnum > 0
        AND NOT a.attisdropped
    )
    + (
      SELECT COUNT(*)::int
      FROM information_schema.constraint_column_usage
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'plain_password'
    )
    + (
      SELECT COUNT(*)::int
      FROM pg_policy pol
      WHERE pol.polrelid = 'public.users'::regclass
        AND (
          COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') ILIKE '%plain_password%'
          OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ILIKE '%plain_password%'
        )
    )
    + (
      SELECT COUNT(*)::int
      FROM pg_attribute a
      JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'users'
        AND a.attname = 'plain_password'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attgenerated <> ''
    )
    + (
      SELECT COUNT(*)::int
      FROM pg_rewrite r
      JOIN pg_class c ON c.oid = r.ev_class
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND r.rulename <> '_RETURN'
        AND pg_get_ruledef(r.oid) ILIKE '%plain_password%'
    )
  )::int AS dependency_total,
  NOW() AT TIME ZONE 'UTC' AS consulted_at_utc;
