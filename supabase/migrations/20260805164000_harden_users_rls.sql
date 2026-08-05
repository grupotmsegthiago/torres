-- =============================================================================
-- harden_users_rls — Torres P0 / C3
-- Remove SELECT irrestrito em public.users; restringe grants.
--
-- Modelo final:
--   - admin/diretoria usam API backend + service_role (nunca PostgREST amplo)
--   - frontend NÃO deve listar users diretamente
--   - authenticated: SELECT somente colunas seguras + RLS users_select_own
--   - plain_password é legado sensível: nunca concedida a anon/authenticated
--   - coluna plain_password NÃO é removida neste PR (compatibilidade)
--
-- Aplicação: NÃO rodar em produção compartilhada sem janela autorizada.
-- Ver: docs/security/RUNBOOK-USERS-RLS.md
-- =============================================================================

BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- FORCE RLS intencionalmente NÃO ativado neste PR (service_role / owners).

-- 1) Remover policies permissivas e administrativas via JWT (nomes reais)
DROP POLICY IF EXISTS "Acesso Total Emergencial" ON public.users;
DROP POLICY IF EXISTS "Acesso público aos perfis" ON public.users;
DROP POLICY IF EXISTS "Usuários podem ver apenas seus próprios dados" ON public.users;
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;
DROP POLICY IF EXISTS "Apenas usuários autenticados podem inserir" ON public.users;

-- UPDATE próprio removido: terms_* e demais mutações passam pelo backend (service_role)
DROP POLICY IF EXISTS "users_update_own" ON public.users;

-- 2) Consolidar SELECT próprio (única policy SELECT)
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  TO authenticated
  USING (supabase_uid = (SELECT auth.uid())::text);

-- 3) Grants: mínimo necessário (sem SELECT de tabela)
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.users FROM authenticated;

-- Colunas reais mapeadas (schema + DB); plain_password excluída deliberadamente.
-- Não conceder colunas desconhecidas automaticamente.
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

-- service_role permanece com privilégios completos (não revogar aqui)

COMMENT ON TABLE public.users IS
  'Perfis da aplicação. Admin via API+service_role. authenticated: SELECT colunas seguras + own row. plain_password legado — não expor.';

COMMIT;
