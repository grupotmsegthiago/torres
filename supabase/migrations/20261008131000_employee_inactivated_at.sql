-- Dia em que o funcionário foi inativado no cadastro.
-- Rollback: supabase/migrations/rollback/20261008131000_rollback_employee_inactivated_at.sql

alter table public.employees
  add column if not exists inactivated_at date;
