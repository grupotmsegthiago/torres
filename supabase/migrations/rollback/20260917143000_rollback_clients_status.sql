-- Rollback da coluna clients.status. Não reativa exclusão física.
DROP INDEX IF EXISTS public.idx_clients_status;
ALTER TABLE public.clients DROP COLUMN IF EXISTS status;
