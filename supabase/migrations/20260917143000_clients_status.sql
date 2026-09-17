-- Cadastro de clientes: status ativo/inativo (desativar em vez de excluir).
-- Idempotente. Não apaga linhas nem altera fatos financeiros.
-- Rollback: supabase/migrations/rollback/20260917143000_rollback_clients_status.sql

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';

UPDATE public.clients
   SET status = 'ativo'
 WHERE status IS NULL OR btrim(status) = '';

CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients (status);
