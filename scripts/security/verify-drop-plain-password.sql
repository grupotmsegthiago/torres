-- =============================================================================
-- verify-drop-plain-password.sql — asserts pós-DROP (sem dados pessoais)
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/verify-drop-plain-password.sql
-- Ou SQL Editor Supabase (após aplicação controlada da migration PR4B).
-- Esperado (baseline Torres 2026-08-05): total users = 36; coluna ausente.
-- Login/rotas dependem apenas de Supabase Auth (não desta coluna).
-- =============================================================================

DO $$
DECLARE
  v_expected_total int := 36;
  v_total int;
  v_col_exists boolean;
  v_missing_expected int;
  v_unexpected_extra int;
  v_rls boolean;
  v_using_true int;
  v_select_own int;
  v_select_policies int;
  v_anon_table int;
  v_anon_col int;
  v_auth_table_write int;
  v_sr_select boolean;
  v_without_uid int;
  v_without_auth int;
  v_auth_match int;
  v_col_grants int;
  v_dep_catalog int;
  v_dep_rules int;
  v_dep_procs int;
BEGIN
  SELECT COUNT(*)::int INTO v_total FROM public.users;
  IF v_total <> v_expected_total THEN
    RAISE EXCEPTION 'FAIL assert=total_users expected=% found=%', v_expected_total, v_total;
  END IF;
  RAISE NOTICE 'PASS assert=total_users expected=% found=%', v_expected_total, v_total;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plain_password'
  ) INTO v_col_exists;
  IF v_col_exists THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_column_absent expected=false found=true';
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_column_absent expected=false found=false';

  -- Colunas esperadas pós-DROP (schema de aplicação / USER_SAFE_SELECT)
  SELECT COUNT(*)::int INTO v_missing_expected
  FROM (
    VALUES
      ('id'),
      ('email'),
      ('username'),
      ('name'),
      ('role'),
      ('employee_id'),
      ('must_change_password'),
      ('supabase_uid'),
      ('avatar_url'),
      ('terms_accepted_at'),
      ('terms_ip_address'),
      ('terms_user_agent'),
      ('created_at')
  ) AS expected(col)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'users'
      AND c.column_name = expected.col
  );
  IF v_missing_expected <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=expected_columns_present expected=0 missing found=%', v_missing_expected;
  END IF;
  RAISE NOTICE 'PASS assert=expected_columns_present expected=0 missing found=%', v_missing_expected;

  -- Nenhuma coluna além das esperadas (protege contra DROP colateral)
  SELECT COUNT(*)::int INTO v_unexpected_extra
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'users'
    AND c.column_name NOT IN (
      'id',
      'email',
      'username',
      'name',
      'role',
      'employee_id',
      'must_change_password',
      'supabase_uid',
      'avatar_url',
      'terms_accepted_at',
      'terms_ip_address',
      'terms_user_agent',
      'created_at'
    );
  IF v_unexpected_extra <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=no_unexpected_users_columns expected=0 found=%', v_unexpected_extra;
  END IF;
  RAISE NOTICE 'PASS assert=no_unexpected_users_columns expected=0 found=%', v_unexpected_extra;

  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users';
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'FAIL assert=rls_enabled expected=true found=%', v_rls;
  END IF;
  RAISE NOTICE 'PASS assert=rls_enabled expected=true found=%', v_rls;

  SELECT COUNT(*)::int INTO v_using_true
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pg_get_expr(pol.polqual, pol.polrelid) = 'true';
  IF v_using_true <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=policies_using_true expected=0 found=%', v_using_true;
  END IF;
  RAISE NOTICE 'PASS assert=policies_using_true expected=0 found=%', v_using_true;

  SELECT COUNT(*)::int INTO v_select_own
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pol.polname = 'users_select_own'
    AND pol.polcmd = 'r';
  IF v_select_own <> 1 THEN
    RAISE EXCEPTION 'FAIL assert=users_select_own expected=1 found=%', v_select_own;
  END IF;
  RAISE NOTICE 'PASS assert=users_select_own expected=1 found=%', v_select_own;

  SELECT COUNT(*)::int INTO v_select_policies
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pol.polcmd = 'r';
  IF v_select_policies <> 1 THEN
    RAISE EXCEPTION 'FAIL assert=select_policies expected=1 found=%', v_select_policies;
  END IF;
  RAISE NOTICE 'PASS assert=select_policies expected=1 found=%', v_select_policies;

  SELECT COUNT(*)::int INTO v_anon_table
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon';
  IF v_anon_table <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=anon_table_grants expected=0 found=%', v_anon_table;
  END IF;
  RAISE NOTICE 'PASS assert=anon_table_grants expected=0 found=%', v_anon_table;

  SELECT COUNT(*)::int INTO v_anon_col
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon';
  IF v_anon_col <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=anon_column_grants expected=0 found=%', v_anon_col;
  END IF;
  RAISE NOTICE 'PASS assert=anon_column_grants expected=0 found=%', v_anon_col;

  SELECT COUNT(*)::int INTO v_auth_table_write
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND grantee = 'authenticated'
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_auth_table_write <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=authenticated_no_table_write expected=0 found=%', v_auth_table_write;
  END IF;
  RAISE NOTICE 'PASS assert=authenticated_no_table_write expected=0 found=%', v_auth_table_write;

  SELECT has_table_privilege('service_role', 'public.users', 'SELECT') INTO v_sr_select;
  IF NOT COALESCE(v_sr_select, false) THEN
    RAISE EXCEPTION 'FAIL assert=service_role_select expected=true found=%', v_sr_select;
  END IF;
  RAISE NOTICE 'PASS assert=service_role_select expected=true found=%', v_sr_select;

  SELECT COUNT(*)::int INTO v_without_uid
  FROM public.users
  WHERE supabase_uid IS NULL OR btrim(supabase_uid) = '';
  IF v_without_uid <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=without_supabase_uid expected=0 found=%', v_without_uid;
  END IF;
  RAISE NOTICE 'PASS assert=without_supabase_uid expected=0 found=%', v_without_uid;

  SELECT COUNT(*)::int INTO v_without_auth
  FROM public.users u
  WHERE u.supabase_uid IS NOT NULL
    AND btrim(u.supabase_uid) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM auth.users au WHERE au.id::text = u.supabase_uid
    );
  IF v_without_auth <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=public_without_auth_match expected=0 found=%', v_without_auth;
  END IF;
  RAISE NOTICE 'PASS assert=public_without_auth_match expected=0 found=%', v_without_auth;

  SELECT COUNT(*)::int INTO v_auth_match
  FROM public.users u
  WHERE u.supabase_uid IS NOT NULL
    AND btrim(u.supabase_uid) <> ''
    AND EXISTS (
      SELECT 1 FROM auth.users au WHERE au.id::text = u.supabase_uid
    );
  IF v_auth_match <> v_expected_total THEN
    RAISE EXCEPTION 'FAIL assert=auth_match expected=% found=%', v_expected_total, v_auth_match;
  END IF;
  RAISE NOTICE 'PASS assert=auth_match expected=% found=%', v_expected_total, v_auth_match;

  -- Grants da coluna devem ser 0 (coluna ausente)
  SELECT COUNT(*)::int INTO v_col_grants
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';
  IF v_col_grants <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_column_grants_absent expected=0 found=%', v_col_grants;
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_column_grants_absent expected=0 found=%', v_col_grants;

  -- Nenhuma dependência catalogada residual na coluna (inexistente)
  SELECT COUNT(*)::int INTO v_dep_catalog
  FROM pg_depend d
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  JOIN pg_class t ON t.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND a.attname = 'plain_password'
    AND NOT a.attisdropped
    AND d.deptype = 'n';
  IF v_dep_catalog <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=no_pg_depend_on_plain_password expected=0 found=%', v_dep_catalog;
  END IF;
  RAISE NOTICE 'PASS assert=no_pg_depend_on_plain_password expected=0 found=%', v_dep_catalog;

  IF EXISTS (
    SELECT 1
    FROM information_schema.view_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plain_password'
  ) THEN
    RAISE EXCEPTION 'FAIL assert=no_view_deps_on_plain_password expected=0 found>0';
  END IF;
  RAISE NOTICE 'PASS assert=no_view_deps_on_plain_password expected=0 found=0';

  SELECT COUNT(*)::int INTO v_dep_rules
  FROM pg_rewrite r
  JOIN pg_class c ON c.oid = r.ev_class
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND r.rulename <> '_RETURN'
    AND pg_get_ruledef(r.oid) ILIKE '%plain_password%';
  IF v_dep_rules <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=no_rules_on_plain_password expected=0 found=%', v_dep_rules;
  END IF;
  RAISE NOTICE 'PASS assert=no_rules_on_plain_password expected=0 found=%', v_dep_rules;

  SELECT COUNT(*)::int INTO v_dep_procs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND pg_get_functiondef(p.oid) ILIKE '%plain_password%';
  IF v_dep_procs <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=no_functions_procedures_on_plain_password expected=0 found=%', v_dep_procs;
  END IF;
  RAISE NOTICE 'PASS assert=no_functions_procedures_on_plain_password expected=0 found=%', v_dep_procs;

  RAISE NOTICE 'PASS verify-drop-plain-password: all asserts OK (Auth-only login path)';
END $$;
