-- Margem de negociação e linha do tempo da proposta patrimonial.
-- Não altera Comercial, boletim, fatura nem ledger.
-- Rollback: supabase/migrations/rollback/20260922220000_rollback_patrimonial_proposal_negotiation.sql

alter table public.patrimonial_price_proposals
  add column if not exists list_price numeric(14,2),
  add column if not exists negotiated_price numeric(14,2),
  add column if not exists margin_percent numeric(6,2),
  add column if not exists status text not null default 'aguardando_diretoria',
  add column if not exists released_at timestamp with time zone,
  add column if not exists released_by integer;

update public.patrimonial_price_proposals p
set
  list_price = coalesce(p.list_price, p.total_price),
  negotiated_price = coalesce(p.negotiated_price, p.total_price),
  margin_percent = coalesce(p.margin_percent, (
    select m.lucro_percent
    from public.patrimonial_pricing_matrix m
    order by m.updated_at desc
    limit 1
  ))
where p.list_price is null
   or p.negotiated_price is null
   or p.margin_percent is null;

update public.patrimonial_price_proposals
set status = case when margin_percent > 10 then 'liberada' else 'aguardando_diretoria' end
where released_at is null;

alter table public.patrimonial_price_proposals
  alter column list_price set not null,
  alter column negotiated_price set not null,
  alter column margin_percent set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'patrimonial_price_proposals_status_chk'
  ) then
    alter table public.patrimonial_price_proposals
      add constraint patrimonial_price_proposals_status_chk
      check (status in ('aguardando_diretoria', 'liberada'));
  end if;
end $$;

create table if not exists public.patrimonial_proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.patrimonial_price_proposals(id) on delete cascade,
  kind text not null,
  list_price numeric(14,2),
  negotiated_price numeric(14,2),
  margin_percent numeric(6,2),
  note text,
  actor_id integer,
  actor_name text,
  actor_role text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint patrimonial_proposal_events_kind_chk check (
    kind in ('criada', 'preco_negociado', 'liberada_automatica', 'liberada_diretoria', 'reaberta_diretoria')
  )
);

create index if not exists patrimonial_proposal_events_proposal_idx
  on public.patrimonial_proposal_events (proposal_id, created_at);

insert into public.patrimonial_proposal_events (
  proposal_id, kind, list_price, negotiated_price, margin_percent, note, actor_role, created_at
)
select
  p.id,
  'criada',
  p.list_price,
  p.negotiated_price,
  p.margin_percent,
  'Proposta registrada antes da linha do tempo.',
  'sistema',
  p.created_at
from public.patrimonial_price_proposals p
where not exists (
  select 1 from public.patrimonial_proposal_events e where e.proposal_id = p.id
);

alter table public.patrimonial_proposal_events enable row level security;
revoke all on public.patrimonial_proposal_events from anon, authenticated;
