-- Cada cargo patrimonial guarda a própria composição.
-- A proposta lê esses campos. Não altera a área Comercial.
-- Rollback: supabase/migrations/rollback/20260922214000_rollback_patrimonial_role_calc.sql

alter table public.patrimonial_roles
  add column if not exists scale text not null default '6 x 1',
  add column if not exists armed boolean not null default false,
  add column if not exists night boolean not null default false,
  add column if not exists interval_indenizado boolean not null default false,
  add column if not exists gratification_percent numeric(6,2) not null default 0,
  add column if not exists he60_hours numeric(8,2) not null default 0,
  add column if not exists he100_hours numeric(8,2) not null default 0,
  add column if not exists holiday_hours numeric(8,2) not null default 0,
  add column if not exists holiday_dsr boolean not null default false;

insert into public.patrimonial_roles (
  name, salary, sort_order, scale, armed, night, interval_indenizado,
  gratification_percent, he60_hours, he100_hours, holiday_hours, holiday_dsr
)
select
  t.name,
  base.salary,
  t.sort_order,
  t.scale,
  t.armed,
  t.night,
  t.interval_indenizado,
  t.gratification_percent,
  0,
  t.he100_hours,
  t.holiday_hours,
  false
from (
  values
    ('Vigilante diurno'::text, 'VIGILANTE'::text, 10, '6 x 1'::text, false, false, true, 0::numeric, 8::numeric, 8::numeric),
    ('Vigilante noturno', 'VIGILANTE', 11, '12 x 36', false, true, false, 0::numeric, 0::numeric, 0::numeric),
    ('Vigilante condutor diurno', 'VIGILANTE', 12, '5 x 2', false, false, false, 10::numeric, 0::numeric, 0::numeric),
    ('Vigilante condutor noturno', 'VIGILANTE', 13, '6 x 1', false, true, false, 10::numeric, 0::numeric, 0::numeric),
    ('Vigilante líder diurno', 'VIGILANTE', 14, '12 x 36', false, false, false, 12::numeric, 0::numeric, 0::numeric),
    ('Vigilante líder noturno', 'VIGILANTE', 15, '12 x 36', false, true, false, 12::numeric, 0::numeric, 0::numeric),
    ('Operador de monitoramento diurno', 'OPERADOR DE MONITORAMENTO', 16, '12 x 36', false, false, false, 11.77::numeric, 0::numeric, 0::numeric),
    ('Operador de monitoramento noturno', 'OPERADOR DE MONITORAMENTO', 17, '12 x 36', false, true, false, 11.77::numeric, 0::numeric, 0::numeric),
    ('Supervisor diurno', 'SUPERVISOR', 18, '5 x 2', false, false, false, 20::numeric, 0::numeric, 0::numeric),
    ('Supervisor noturno', 'SUPERVISOR', 19, '12 x 36', false, true, false, 0::numeric, 0::numeric, 0::numeric),
    ('Inspetor diurno', 'INSPETOR', 20, '5 x 2', false, false, false, 0::numeric, 0::numeric, 0::numeric)
) as t(name, base_name, sort_order, scale, armed, night, interval_indenizado, gratification_percent, he100_hours, holiday_hours)
join lateral (
  select salary
  from public.patrimonial_roles
  where name = t.base_name
  order by sort_order
  limit 1
) as base on true
where not exists (
  select 1 from public.patrimonial_roles existing where existing.name = t.name
);
