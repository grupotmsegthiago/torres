-- =============================================================================
-- baseline-plain-password-cleanup.sql
-- Somente leitura — contagens e metadados de public.users / Auth / RLS.
-- NÃO seleciona valores de plain_password, email, nome ou username.
-- NÃO calcula hash/fingerprint derivado de senha.
-- Uso: SQL Editor Supabase ou psql (homologação controlada).
-- =============================================================================

-- 1) Contagens principais
SELECT
  COUNT(*)::int AS total_users,
  COUNT(*) FILTER (
    WHERE plain_password IS NOT NULL
  )::int AS plain_password_not_null,
  COUNT(*) FILTER (
    WHERE plain_password IS NULL
  )::int AS plain_password_is_null,
  COUNT(*) FILTER (
    WHERE plain_password IS NOT NULL AND plain_password = ''
  )::int AS plain_password_empty_string,
  COUNT(*) FILTER (
    WHERE plain_password IS NOT NULL AND btrim(plain_password) <> ''
  )::int AS plain_password_filled,
  COUNT(*) FILTER (
    WHERE supabase_uid IS NOT NULL AND btrim(supabase_uid) <> ''
  )::int AS with_supabase_uid,
  COUNT(*) FILTER (
    WHERE supabase_uid IS NULL OR btrim(supabase_uid) = ''
  )::int AS without_supabase_uid,
  COUNT(*) FILTER (
    WHERE employee_id IS NOT NULL
  )::int AS with_employee_id,
  COUNT(*) FILTER (
    WHERE employee_id IS NULL
  )::int AS without_employee_id,
  COUNT(*) FILTER (
    WHERE coalesce(must_change_password, 0) = 1
  )::int AS must_change_active,
  COUNT(*) FILTER (
    WHERE coalesce(must_change_password, 0) = 0
  )::int AS must_change_done,
  COUNT(*) FILTER (
    WHERE supabase_uid IS NOT NULL
      AND btrim(supabase_uid) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM auth.users au
        WHERE au.id::text = public.users.supabase_uid
      )
  )::int AS public_users_without_auth_match,
  (
    SELECT COUNT(*)::int
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.users pu
      WHERE pu.supabase_uid IS NOT NULL
        AND btrim(pu.supabase_uid) <> ''
        AND pu.supabase_uid = au.id::text
    )
  ) AS auth_users_without_public_match,
  NOW() AT TIME ZONE 'UTC' AS consulted_at_utc
FROM public.users;

-- 2) Contagem por role
SELECT coalesce(role, '(null)') AS role, COUNT(*)::int AS n
FROM public.users
GROUP BY role
ORDER BY n DESC, role;

-- 3) Contagem por must_change_password
SELECT coalesce(must_change_password, 0)::int AS must_change_password, COUNT(*)::int AS n
FROM public.users
GROUP BY coalesce(must_change_password, 0)
ORDER BY 1;

-- 4) RLS / policies / grants (sem dados pessoais)
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
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'authenticated'
  ) AS authenticated_table_grants,
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
