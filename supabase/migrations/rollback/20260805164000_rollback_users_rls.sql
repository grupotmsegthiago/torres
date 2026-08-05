-- =============================================================================
-- ROLLBACK (emergência) — harden_users_rls
--
-- NÃO recria USING (true).
-- NÃO restaura SELECT público / anon.
-- NÃO devolve plain_password a authenticated.
-- NÃO concede SELECT de tabela a authenticated.
--
-- Restaura apenas:
--   - RLS enabled
--   - users_select_own
--   - SELECT nas colunas seguras para authenticated (sem plain_password)
--
-- Admin JWT NÃO é restaurado — administração permanece via service_role/API.
-- =============================================================================

BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Remover qualquer vestígio permissivo se alguém tiver recriado
DROP POLICY IF EXISTS "Acesso Total Emergencial" ON public.users;
DROP POLICY IF EXISTS "Acesso público aos perfis" ON public.users;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  TO authenticated
  USING (supabase_uid = (SELECT auth.uid())::text);

REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.users FROM authenticated;

GRANT SELECT (
  id,
  supabase_uid,
  email,
  username,
  name,
  role,
  employee_id,
  must_change_password,
  avatar_url,
  terms_accepted_at,
  terms_ip_address,
  terms_user_agent,
  created_at
) ON TABLE public.users TO authenticated;

COMMIT;
