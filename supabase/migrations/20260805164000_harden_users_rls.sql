-- =============================================================================
-- harden_users_rls — Torres P0 / C3
-- Remove SELECT irrestrito em public.users; restringe grants.
--
-- Modelo final:
--   - admin/diretoria usam API backend + service_role (nunca PostgREST amplo)
--   - frontend NÃO deve listar users diretamente
--   - authenticated só pode ler a própria linha (users_select_own)
--   - plain_password é legado sensível: sem SELECT para anon/authenticated
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

-- 3) Grants: mínimo necessário
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.users FROM authenticated;

-- SELECT de tabela necessário para a policy own; linhas limitadas por RLS
GRANT SELECT ON TABLE public.users TO authenticated;

-- Coluna legado: nunca exposta a anon/authenticated
REVOKE SELECT (plain_password) ON TABLE public.users FROM anon;
REVOKE SELECT (plain_password) ON TABLE public.users FROM authenticated;

-- service_role permanece com privilégios completos (não revogar aqui)

COMMENT ON TABLE public.users IS
  'Perfis da aplicação. Admin via API+service_role. authenticated: SELECT own only. plain_password legado — não expor.';

COMMIT;
