-- Diária manual da folha: origem, justificativa e quem lançou.
ALTER TABLE public.agent_daily_allowances
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS justificativa text,
  ADD COLUMN IF NOT EXISTS usuario_aprovador_id integer;

ALTER TABLE public.agent_daily_allowances
  DROP CONSTRAINT IF EXISTS agent_daily_allowances_origem_check;
ALTER TABLE public.agent_daily_allowances
  ADD CONSTRAINT agent_daily_allowances_origem_check
  CHECK (origem IS NULL OR origem IN ('PONTO_AUTOMATICO', 'MANUAL'));

ALTER TABLE public.agent_daily_allowances
  DROP CONSTRAINT IF EXISTS agent_daily_allowances_manual_justificativa_check;
ALTER TABLE public.agent_daily_allowances
  ADD CONSTRAINT agent_daily_allowances_manual_justificativa_check
  CHECK (
    origem IS DISTINCT FROM 'MANUAL'
    OR (justificativa IS NOT NULL AND length(btrim(justificativa)) >= 5)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_daily_allowances_usuario_aprovador_id_fkey'
  ) THEN
    ALTER TABLE public.agent_daily_allowances
      ADD CONSTRAINT agent_daily_allowances_usuario_aprovador_id_fkey
      FOREIGN KEY (usuario_aprovador_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
