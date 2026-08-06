-- =============================================================================
-- homologate-drop-plain-password-baseline.sql
-- PR4B / 4.5B — homologação pré-DROP com asserts PASS/FAIL (somente leitura).
--
-- NÃO aplica DROP. NÃO altera dados. NÃO seleciona valores de senha/PII.
-- Uso: SQL Editor Supabase ou:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/homologate-drop-plain-password-baseline.sql
--
-- Esperado (Torres 2026-08-05):
--   total=36, filled=0, null=36, column_exists=true, dependency_total=0,
--   Auth match=36, without_supabase_uid=0, RLS OK.
--
-- Se TODOS os asserts PASS → artefatos PR4B aptos para janela controlada de DROP
-- (ainda exige backup nativo recente + autorização do proprietário).
-- =============================================================================

DO $$
DECLARE
  v_expected_total int := 36;
  v_total int;
  v_filled int;
  v_null int;
  v_empty int;
  v_with_uid int;
  v_without_uid int;
  v_auth_match int;
  v_without_auth int;
  v_col_exists boolean;
  v_rls boolean;
  v_rls_forced boolean;
  v_policy_count int;
  v_using_true int;
  v_select_own int;
  v_anon_table int;
  v_anon_col int;
  v_auth_pp_grant int;
  v_sr_select boolean;
  v_dep_catalog int;
  v_dep_views int;
  v_dep_matviews int;
  v_dep_functions int;
  v_dep_procedures int;
  v_dep_triggers int;
  v_dep_indexes int;
  v_dep_constraints int;
  v_dep_policies int;
  v_dep_generated int;
  v_dep_rules int;
  v_dependency_total int;
  v_col_grants int;
  v_relid oid;
  v_attnum smallint;
BEGIN
  -- 1) Contagens + existência da coluna
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (
      WHERE plain_password IS NOT NULL AND btrim(plain_password) <> ''
    )::int,
    COUNT(*) FILTER (WHERE plain_password IS NULL)::int,
    COUNT(*) FILTER (
      WHERE plain_password IS NOT NULL AND plain_password = ''
    )::int,
    COUNT(*) FILTER (
      WHERE supabase_uid IS NOT NULL AND btrim(supabase_uid) <> ''
    )::int,
    COUNT(*) FILTER (
      WHERE supabase_uid IS NULL OR btrim(supabase_uid) = ''
    )::int,
    COUNT(*) FILTER (
      WHERE supabase_uid IS NOT NULL
        AND btrim(supabase_uid) <> ''
        AND EXISTS (
          SELECT 1 FROM auth.users au
          WHERE au.id::text = public.users.supabase_uid
        )
    )::int,
    COUNT(*) FILTER (
      WHERE supabase_uid IS NOT NULL
        AND btrim(supabase_uid) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM auth.users au
          WHERE au.id::text = public.users.supabase_uid
        )
    )::int
  INTO
    v_total,
    v_filled,
    v_null,
    v_empty,
    v_with_uid,
    v_without_uid,
    v_auth_match,
    v_without_auth
  FROM public.users;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plain_password'
  ) INTO v_col_exists;

  IF v_total <> v_expected_total THEN
    RAISE EXCEPTION 'FAIL assert=total_users expected=% found=%', v_expected_total, v_total;
  END IF;
  RAISE NOTICE 'PASS assert=total_users expected=% found=%', v_expected_total, v_total;

  IF v_filled <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_filled expected=0 found=%', v_filled;
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_filled expected=0 found=%', v_filled;

  IF v_null <> v_total THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_null expected=% found=%', v_total, v_null;
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_null expected=% found=%', v_total, v_null;

  IF v_empty <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_empty expected=0 found=%', v_empty;
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_empty expected=0 found=%', v_empty;

  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_column_exists expected=true found=false';
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_column_exists expected=true found=true';

  IF v_without_uid <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=without_supabase_uid expected=0 found=%', v_without_uid;
  END IF;
  RAISE NOTICE 'PASS assert=without_supabase_uid expected=0 found=%', v_without_uid;

  IF v_auth_match <> v_total THEN
    RAISE EXCEPTION 'FAIL assert=auth_match expected=% found=%', v_total, v_auth_match;
  END IF;
  RAISE NOTICE 'PASS assert=auth_match expected=% found=%', v_total, v_auth_match;

  IF v_without_auth <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=public_users_without_auth_match expected=0 found=%', v_without_auth;
  END IF;
  RAISE NOTICE 'PASS assert=public_users_without_auth_match expected=0 found=%', v_without_auth;

  -- 2) RLS / policies / grants (sem PII)
  SELECT
    c.relrowsecurity,
    c.relforcerowsecurity
  INTO v_rls, v_rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users';

  SELECT COUNT(*)::int INTO v_policy_count
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass;

  SELECT COUNT(*)::int INTO v_using_true
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pg_get_expr(pol.polqual, pol.polrelid) = 'true';

  SELECT COUNT(*)::int INTO v_select_own
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pol.polname = 'users_select_own'
    AND pol.polcmd = 'r';

  SELECT COUNT(*)::int INTO v_anon_table
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon';

  SELECT COUNT(*)::int INTO v_anon_col
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon';

  SELECT COUNT(*)::int INTO v_auth_pp_grant
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND grantee = 'authenticated'
    AND column_name = 'plain_password';

  v_sr_select := has_table_privilege('service_role', 'public.users', 'SELECT');

  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'FAIL assert=rls_enabled expected=true found=false';
  END IF;
  RAISE NOTICE 'PASS assert=rls_enabled expected=true found=%', v_rls;

  IF v_using_true <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=policies_using_true expected=0 found=%', v_using_true;
  END IF;
  RAISE NOTICE 'PASS assert=policies_using_true expected=0 found=%', v_using_true;

  IF v_select_own <> 1 THEN
    RAISE EXCEPTION 'FAIL assert=users_select_own_present expected=1 found=%', v_select_own;
  END IF;
  RAISE NOTICE 'PASS assert=users_select_own_present expected=1 found=%', v_select_own;

  IF v_anon_table <> 0 OR v_anon_col <> 0 THEN
    RAISE EXCEPTION
      'FAIL assert=anon_grants_absent expected=0 found table=% col=%',
      v_anon_table, v_anon_col;
  END IF;
  RAISE NOTICE 'PASS assert=anon_grants_absent expected=0 found table=% col=%', v_anon_table, v_anon_col;

  IF v_auth_pp_grant <> 0 THEN
    RAISE EXCEPTION
      'FAIL assert=authenticated_plain_password_grant_absent expected=0 found=%',
      v_auth_pp_grant;
  END IF;
  RAISE NOTICE
    'PASS assert=authenticated_plain_password_grant_absent expected=0 found=%',
    v_auth_pp_grant;

  IF NOT COALESCE(v_sr_select, false) THEN
    RAISE EXCEPTION 'FAIL assert=service_role_select expected=true found=false';
  END IF;
  RAISE NOTICE 'PASS assert=service_role_select expected=true found=%', v_sr_select;

  RAISE NOTICE
    'INFO assert=rls_diagnostics policy_count=% rls_forced=% with_supabase_uid=%',
    v_policy_count, v_rls_forced, v_with_uid;

  -- 3) Dependências bloqueantes (mesma regra da migration PR4B)
  SELECT c.oid, a.attnum
  INTO v_relid, v_attnum
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND a.attname = 'plain_password'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_relid IS NULL OR v_attnum IS NULL THEN
    RAISE EXCEPTION 'FAIL assert=catalog_lookup expected=relid+attnum found=null';
  END IF;
  RAISE NOTICE 'PASS assert=catalog_lookup expected=relid+attnum found=ok';

  SELECT COUNT(*)::int INTO v_dep_catalog
  FROM pg_depend d
  WHERE d.refobjid = v_relid
    AND d.refobjsubid = v_attnum
    AND d.deptype = 'n';

  SELECT COUNT(*)::int INTO v_dep_views
  FROM information_schema.view_column_usage
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  SELECT COUNT(*)::int INTO v_dep_matviews
  FROM pg_matviews mv
  WHERE mv.schemaname = 'public'
    AND mv.definition ILIKE '%plain_password%';

  SELECT COUNT(*)::int INTO v_dep_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%plain_password%';

  SELECT COUNT(*)::int INTO v_dep_procedures
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'p'
    AND pg_get_functiondef(p.oid) ILIKE '%plain_password%';

  SELECT COUNT(*)::int INTO v_dep_triggers
  FROM pg_trigger tr
  JOIN pg_class t ON t.oid = tr.tgrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND NOT tr.tgisinternal
    AND pg_get_triggerdef(tr.oid) ILIKE '%plain_password%';

  SELECT COUNT(*)::int INTO v_dep_indexes
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND a.attname = 'plain_password'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  SELECT COUNT(*)::int INTO v_dep_constraints
  FROM information_schema.constraint_column_usage
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  SELECT COUNT(*)::int INTO v_dep_policies
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND (
      COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') ILIKE '%plain_password%'
      OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ILIKE '%plain_password%'
    );

  SELECT COUNT(*)::int INTO v_dep_generated
  FROM pg_attribute a
  JOIN pg_class t ON t.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND a.attname = 'plain_password'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attgenerated <> '';

  SELECT COUNT(*)::int INTO v_dep_rules
  FROM pg_rewrite r
  JOIN pg_class c ON c.oid = r.ev_class
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND r.rulename <> '_RETURN'
    AND pg_get_ruledef(r.oid) ILIKE '%plain_password%';

  SELECT COUNT(*)::int INTO v_col_grants
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  v_dependency_total :=
      v_dep_catalog
    + v_dep_views
    + v_dep_matviews
    + v_dep_functions
    + v_dep_procedures
    + v_dep_triggers
    + v_dep_indexes
    + v_dep_constraints
    + v_dep_policies
    + v_dep_generated
    + v_dep_rules;

  RAISE NOTICE
    'INFO assert=dependency_breakdown pg_depend=% views=% matviews=% functions=% procedures=% triggers=% indexes=% constraints=% policies=% generated=% rules=% grants_diag=%',
    v_dep_catalog,
    v_dep_views,
    v_dep_matviews,
    v_dep_functions,
    v_dep_procedures,
    v_dep_triggers,
    v_dep_indexes,
    v_dep_constraints,
    v_dep_policies,
    v_dep_generated,
    v_dep_rules,
    v_col_grants;

  IF v_dependency_total <> 0 THEN
    RAISE EXCEPTION
      'FAIL assert=dependency_total expected=0 found=% (grants are diagnostic-only and excluded)',
      v_dependency_total;
  END IF;
  RAISE NOTICE 'PASS assert=dependency_total expected=0 found=%', v_dependency_total;

  RAISE NOTICE
    'HOMOLOGAÇÃO PR4B / 4.5B BASELINE OK — DROP AINDA NÃO APLICADO; aguardar backup + autorização do proprietário.';
END $$;
