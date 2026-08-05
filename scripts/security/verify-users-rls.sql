-- =============================================================================
-- verify-users-rls.sql — asserts pós-migration (sem dados pessoais)
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/verify-users-rls.sql
-- Ou SQL Editor Supabase (homologação controlada).
-- Falha com EXCEPTION se algum requisito não for atendido.
-- =============================================================================

DO $$
DECLARE
  v_rls boolean;
  v_forced boolean;
  v_using_true int;
  v_select_own int;
  v_select_policies int;
  v_anon_privs int;
  v_auth_bad_privs int;
  v_auth_table_select int;
  v_plain_auth boolean;
  v_plain_anon boolean;
  v_plain_col_grant int;
  v_sr_select boolean;
  v_safe text;
  v_policies text;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO v_rls, v_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users';

  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'FAIL: RLS não está enabled em public.users';
  END IF;

  SELECT COUNT(*)::int INTO v_using_true
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pg_get_expr(pol.polqual, pol.polrelid) = 'true';

  IF v_using_true > 0 THEN
    RAISE EXCEPTION 'FAIL: ainda existem % policies com USING (true)', v_using_true;
  END IF;

  SELECT COUNT(*)::int INTO v_select_own
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pol.polname = 'users_select_own'
    AND pol.polcmd = 'r';

  IF v_select_own <> 1 THEN
    RAISE EXCEPTION 'FAIL: esperado exatamente 1 policy users_select_own SELECT, encontrado %', v_select_own;
  END IF;

  SELECT COUNT(*)::int INTO v_select_policies
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND pol.polcmd = 'r';

  IF v_select_policies <> 1 THEN
    RAISE EXCEPTION 'FAIL: esperado exatamente 1 policy SELECT, encontrado %', v_select_policies;
  END IF;

  SELECT COUNT(*)::int INTO v_anon_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon';

  IF v_anon_privs > 0 THEN
    RAISE EXCEPTION 'FAIL: anon ainda tem % privilégios em public.users', v_anon_privs;
  END IF;

  SELECT COUNT(*)::int INTO v_anon_privs
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'anon';

  IF v_anon_privs > 0 THEN
    RAISE EXCEPTION 'FAIL: anon ainda tem % privilégios de coluna em public.users', v_anon_privs;
  END IF;

  SELECT COUNT(*)::int INTO v_auth_bad_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND grantee = 'authenticated'
    AND privilege_type IN ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'INSERT', 'UPDATE');

  IF v_auth_bad_privs > 0 THEN
    RAISE EXCEPTION 'FAIL: authenticated ainda tem privilégios mutáveis/excessivos (%)', v_auth_bad_privs;
  END IF;

  -- SELECT de tabela (não confundir com has_table_privilege: este retorna true
  -- se houver SELECT em qualquer coluna). Aqui exigimos ausência de grant de tabela.
  SELECT COUNT(*)::int INTO v_auth_table_select
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND grantee = 'authenticated'
    AND privilege_type = 'SELECT';

  IF v_auth_table_select > 0 THEN
    RAISE EXCEPTION 'FAIL: authenticated ainda tem SELECT de tabela em public.users (esperado só colunas seguras)';
  END IF;

  SELECT has_column_privilege('authenticated', 'public.users', 'plain_password', 'SELECT')
    INTO v_plain_auth;
  SELECT has_column_privilege('anon', 'public.users', 'plain_password', 'SELECT')
    INTO v_plain_anon;

  IF COALESCE(v_plain_auth, false) THEN
    RAISE EXCEPTION 'FAIL: authenticated ainda pode SELECT plain_password';
  END IF;
  IF COALESCE(v_plain_anon, false) THEN
    RAISE EXCEPTION 'FAIL: anon ainda pode SELECT plain_password';
  END IF;

  SELECT COUNT(*)::int INTO v_plain_col_grant
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND grantee = 'authenticated'
    AND column_name = 'plain_password'
    AND privilege_type = 'SELECT';

  IF v_plain_col_grant > 0 THEN
    RAISE EXCEPTION 'FAIL: plain_password está nos grants por coluna de authenticated';
  END IF;

  FOREACH v_safe IN ARRAY ARRAY[
    'id',
    'supabase_uid',
    'email',
    'username',
    'name',
    'role',
    'employee_id',
    'must_change_password',
    'avatar_url',
    'terms_accepted_at',
    'terms_ip_address',
    'terms_user_agent',
    'created_at'
  ]
  LOOP
    IF NOT has_column_privilege('authenticated', 'public.users', v_safe, 'SELECT') THEN
      RAISE EXCEPTION 'FAIL: authenticated sem SELECT na coluna segura %', v_safe;
    END IF;
  END LOOP;

  SELECT has_table_privilege('service_role', 'public.users', 'SELECT') INTO v_sr_select;
  IF NOT COALESCE(v_sr_select, false) THEN
    RAISE EXCEPTION 'FAIL: service_role perdeu SELECT em public.users';
  END IF;

  SELECT string_agg(pol.polname, ', ' ORDER BY pol.polname) INTO v_policies
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass;

  RAISE NOTICE 'OK users RLS: policies=[%], rls_enabled=%, rls_forced=%', v_policies, v_rls, v_forced;
END $$;

-- Helpers DEFINER devem continuar existindo
DO $$
BEGIN
  IF to_regprocedure('public.is_app_user(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL: is_app_user ausente';
  END IF;
  IF to_regprocedure('public.get_app_user_id(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL: get_app_user_id ausente';
  END IF;
  IF to_regprocedure('public.get_app_user_role(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL: get_app_user_role ausente';
  END IF;
  RAISE NOTICE 'OK helpers DEFINER presentes';
END $$;
