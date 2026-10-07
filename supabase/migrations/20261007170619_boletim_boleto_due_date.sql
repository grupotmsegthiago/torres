-- Vencimento escolhido ao enviar a medição ao cliente.
ALTER TABLE public.boletim_approvals
  ADD COLUMN IF NOT EXISTS boleto_due_date date;

COMMENT ON COLUMN public.boletim_approvals.boleto_due_date IS
  'Vencimento do boleto informado no envio da medição.';
