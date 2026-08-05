-- =============================================================================
-- verify-plain-password-cleanup.sql — asserts pós-limpeza (sem dados pessoais)
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/verify-plain-password-cleanup.sql
-- Ou SQL Editor Supabase (após PR3B).
-- Esperado (baseline Torres 2026-08-05): total users = 36.
-- Sobrescrever: SET app.verify_expected_users = '36'; (opcional via GUC custom não padronizado)
-- Aqui usa constante 36 alinhada ao baseline; ajuste manual se o total mudar antes do PR3B.
-- =============================================================================

DO $$
DECLARE
  v_expected_total int := 36;
  v_total int;
  v_filled int;
  v_empty int;
  v_null int;
  v_without_uid int;
  v_without_auth int;
  v_rls boolean;
  v_using_true int;
  v_select_own int;
  v_select_policies int;
  v_anon_table int;
  v_anon_col int;
  v_plain_auth boolean;
  v_plain_col_grant int;
  v_col_exists boolean;
  v_sr_select boolean;
BEGIN
  SELECT COUNT(*)::int INTO v_total FROM public.users;
  IF v_total <> v_expected_total THEN
    RAISE EXCEPTION 'FAIL assert=total_users expected=% found=%', v_expected_total, v_total;
  END IF;
  RAISE NOTICE 'PASS assert=total_users expected=% found=%', v_expected_total, v_total;

  SELECT COUNT(*)::int INTO v_filled
  FROM public.users
  WHERE plain_password IS NOT NULL AND btrim(plain_password) <> '';
  IF v_filled <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_filled expected=0 found=%', v_filled;
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_filled expected=0 found=%', v_filled;

  SELECT COUNT(*)::int INTO v_empty
  FROM public.users
  WHERE plain_password IS NOT NULL AND plain_password = '';
  IF v_empty <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_empty expected=0 found=%', v_empty;
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_empty expected=0 found=%', v_empty;

  SELECT COUNT(*)::int INTO v_null
  FROM public.users
  WHERE plain_password IS NULL;
  IF v_null <> v_total THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_null expected=% found=%', v_total, v_null;
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_null expected=% found=%', v_total, v_null;

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

  SELECT has_column_privilege('authenticated', 'public.users', 'plain_password', 'SELECT')
    INTO v_plain_auth;
  IF COALESCE(v_plain_auth, false) THEN
    RAISE EXCEPTION 'FAIL assert=authenticated_plain_password_select expected=false found=%', v_plain_auth;
  END IF;
  RAISE NOTICE 'PASS assert=authenticated_plain_password_select expected=false found=%', v_plain_auth;

  SELECT COUNT(*)::int INTO v_plain_col_grant
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND grantee = 'authenticated'
    AND column_name = 'plain_password';
  IF v_plain_col_grant <> 0 THEN
    RAISE EXCEPTION 'FAIL assert=authenticated_plain_password_grants expected=0 found=%', v_plain_col_grant;
  END IF;
  RAISE NOTICE 'PASS assert=authenticated_plain_password_grants expected=0 found=%', v_plain_col_grant;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plain_password'
  ) INTO v_col_exists;
  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'FAIL assert=plain_password_column_exists expected=true found=false (DROP é PR4)';
  END IF;
  RAISE NOTICE 'PASS assert=plain_password_column_exists expected=true found=true';

  SELECT has_table_privilege('service_role', 'public.users', 'SELECT') INTO v_sr_select;
  IF NOT COALESCE(v_sr_select, false) THEN
    RAISE EXCEPTION 'FAIL assert=service_role_select expected=true found=%', v_sr_select;
  END IF;
  RAISE NOTICE 'PASS assert=service_role_select expected=true found=%', v_sr_select;

  RAISE NOTICE 'PASS verify-plain-password-cleanup: all asserts OK';
END $$;
