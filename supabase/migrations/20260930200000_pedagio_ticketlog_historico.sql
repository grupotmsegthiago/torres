-- Histórico de cada gravação da fatura Ticketlog (quinzena), com o anexo da fatura.
-- O valor vigente do período continua em pedagio_ticketlog_periodo (custo do Balanço).
create table if not exists public.pedagio_ticketlog_historico (
  id uuid primary key default gen_random_uuid(),
  periodo_inicio date not null,
  periodo_fim date not null,
  valor numeric(14,2) not null,
  arquivo_path text,
  arquivo_nome text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists pedagio_ticketlog_historico_periodo_idx
  on public.pedagio_ticketlog_historico (periodo_inicio, periodo_fim, created_at desc);

alter table public.pedagio_ticketlog_historico enable row level security;
