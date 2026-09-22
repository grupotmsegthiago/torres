-- Precificação do módulo Patrimonial (cargos, matriz e propostas).
-- Não altera a área Comercial já existente.
-- Rollback: supabase/migrations/rollback/20260922193000_rollback_patrimonial_precificacao.sql

create table if not exists public.patrimonial_pricing_matrix (
  id uuid primary key default gen_random_uuid(),
  city text not null default 'São Paulo',
  uf text not null default 'SP',
  iss_percent numeric(5,2) not null default 5.00,
  pis_percent numeric(5,2) not null default 0,
  cofins_percent numeric(5,2) not null default 0,
  taxa_adm_percent numeric(5,2) not null default 4.00,
  lucro_percent numeric(5,2) not null default 8.00,
  periculosidade_percent numeric(5,2) not null default 30.00,
  night_hours numeric(6,2) not null default 8,
  night_percent numeric(5,2) not null default 20.00,
  dsr_percent numeric(5,2) not null default 20.00,
  he60_percent numeric(6,2) not null default 160.00,
  he100_percent numeric(6,2) not null default 100.00,
  holiday_percent numeric(6,2) not null default 200.00,
  hour_divisor numeric(6,2) not null default 220,
  vr_daily numeric(12,2) not null default 42.00,
  vr_discount_percent numeric(5,2) not null default 18.00,
  convenio numeric(12,2) not null default 200.00,
  va_complement numeric(12,2) not null default 0,
  life_insurance numeric(12,2) not null default 40.00,
  vt_daily numeric(12,2) not null default 20.00,
  vt_discount_percent numeric(5,2) not null default 6.00,
  uniform_unarmed numeric(12,2) not null default 80.00,
  uniform_armed numeric(12,2) not null default 100.00,
  analise_risco numeric(12,2) not null default 20.00,
  reciclagem numeric(12,2) not null default 25.00,
  rh numeric(12,2) not null default 15.00,
  ppra numeric(12,2) not null default 12.00,
  ajuda_custo numeric(12,2) not null default 500.00,
  ppr numeric(12,2) not null default 47.00,
  charge_items jsonb not null default '[{"name":"INSS patronal","percent":22},{"name":"FGTS","percent":12}]'::jsonb,
  provision_items jsonb not null default '[{"name":"FGTS rescisão","percent":5},{"name":"Férias + 1/3","percent":11.11},{"name":"INSS férias","percent":2.87},{"name":"FGTS férias","percent":1.33},{"name":"SAT férias","percent":0.33},{"name":"13º","percent":8.33},{"name":"INSS 13º","percent":2.15},{"name":"SAT 13º","percent":0.25},{"name":"FGTS 13º","percent":1}]'::jsonb,
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.patrimonial_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  salary numeric(12,2) not null,
  sort_order integer not null default 0
);

create table if not exists public.patrimonial_iss_cities (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  city_name text not null,
  uf text not null,
  ibge_code text,
  iss_percent numeric(5,2) not null,
  unique (city_key, uf)
);

create table if not exists public.patrimonial_price_proposals (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  city text not null,
  uf text not null,
  iss_percent numeric(5,2) not null,
  lines jsonb not null,
  total_cost numeric(14,2) not null,
  total_tax numeric(14,2) not null,
  total_margin numeric(14,2) not null,
  total_price numeric(14,2) not null,
  created_by integer,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

insert into public.patrimonial_pricing_matrix (city)
select 'São Paulo'
where not exists (select 1 from public.patrimonial_pricing_matrix);

insert into public.patrimonial_roles (name, salary, sort_order)
select v.name, v.salary, v.sort_order
from (values
  ('SUPERVISOR'::text, 3969.05::numeric, 1),
  ('VIGILANTE', 2271.74, 2),
  ('INSPETOR', 3287.45, 3),
  ('OPERADOR DE MONITORAMENTO', 2271.74, 4)
) as v(name, salary, sort_order)
where not exists (select 1 from public.patrimonial_roles);

insert into public.patrimonial_iss_cities (city_key, city_name, uf, iss_percent)
select 'sao paulo', 'São Paulo', 'SP', 5.00
where not exists (
  select 1 from public.patrimonial_iss_cities where city_key = 'sao paulo' and uf = 'SP'
);

alter table public.patrimonial_pricing_matrix enable row level security;
alter table public.patrimonial_roles enable row level security;
alter table public.patrimonial_iss_cities enable row level security;
alter table public.patrimonial_price_proposals enable row level security;

revoke all on public.patrimonial_pricing_matrix from anon, authenticated;
revoke all on public.patrimonial_roles from anon, authenticated;
revoke all on public.patrimonial_iss_cities from anon, authenticated;
revoke all on public.patrimonial_price_proposals from anon, authenticated;
