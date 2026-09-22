-- Módulo Patrimonial, separado da área Comercial já existente.
-- Rollback: supabase/migrations/rollback/20260922183000_rollback_comercial_patrimonial.sql

create table if not exists public.financial_matrix_config (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default 'Grupo TM Seg',
  tax_percentage numeric(5,2) not null default 16.00,
  commission_percentage numeric(5,2) not null default 3.00,
  bonus_threshold_1 numeric(12,2) not null default 500000.00,
  bonus_value_1 numeric(12,2) not null default 5000.00,
  bonus_threshold_2 numeric(12,2) not null default 1000000.00,
  bonus_value_2 numeric(12,2) not null default 10000.00,
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.commercial_proposals (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  region text not null,
  service_type text not null,
  base_activation_value numeric(12,2) not null default 0,
  km_franchise integer not null default 0,
  extra_km_value numeric(12,2) not null default 0,
  extra_hour_value numeric(12,2) not null default 0,
  estimated_gross_value numeric(12,2) not null,
  calculated_tax numeric(12,2) not null,
  net_result numeric(12,2) not null,
  calculated_commission numeric(12,2) not null,
  calculated_bonus numeric(12,2) not null,
  total_payable_provider numeric(12,2) not null,
  created_by integer,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_commercial_proposals_created_at
  on public.commercial_proposals (created_at desc);

insert into public.financial_matrix_config (company_name)
select 'Grupo TM Seg'
where not exists (select 1 from public.financial_matrix_config);

alter table public.financial_matrix_config enable row level security;
alter table public.commercial_proposals enable row level security;

revoke all on public.financial_matrix_config from anon, authenticated;
revoke all on public.commercial_proposals from anon, authenticated;
