-- =============================================================================
-- rollback estrutural — DROP de plain_password (PR4B)
--
-- Pode recriar a coluna como text NULL se houver necessidade operacional.
-- NÃO repopula valores.
-- NÃO restaura senhas.
-- Auth (Supabase) continua sendo a única fonte de autenticação.
-- Reexecução exige autorização explícita.
-- =============================================================================

-- Estrutural apenas — nunca copiar senhas do backup para esta coluna.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS plain_password text NULL;

-- Documentação viva: após este rollback estrutural, a coluna volta vazia.
-- Corrigir acesso de usuários via Supabase Auth Admin API.
-- Restore completo de backup = último recurso, autorização expressa.
