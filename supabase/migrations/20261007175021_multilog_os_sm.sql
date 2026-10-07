-- Referências da viagem exigidas pela MULTILOG na medição, cobrança, e-mail e NFS-e.
-- Não participam do cálculo financeiro.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS multilog_os text,
  ADD COLUMN IF NOT EXISTS multilog_sm text;

COMMENT ON COLUMN public.service_orders.multilog_os IS
  'Número da OS do cliente MULTILOG, discriminado na medição, cobrança, e-mail e NFS-e.';
COMMENT ON COLUMN public.service_orders.multilog_sm IS
  'SM da viagem MULTILOG, discriminada na medição, cobrança, e-mail e NFS-e.';
