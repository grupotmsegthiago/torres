-- Custo real do pedágio (fatura Ticketlog) lançado à mão em Pedágio: Pago × Cobrado.
-- O Balanço usa este valor como custo do período. O pedágio do boletim permanece receita/lucro.
create table if not exists public.pedagio_ticketlog_periodo (
  id uuid primary key default gen_random_uuid(),
  periodo_inicio date not null,
  periodo_fim date not null,
  valor numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (periodo_inicio, periodo_fim)
);

alter table public.pedagio_ticketlog_periodo enable row level security;
