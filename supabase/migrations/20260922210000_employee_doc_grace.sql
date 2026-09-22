-- Prazo da Diretoria para reciclagem não travar a escala do funcionário.
-- Rollback: supabase/migrations/rollback/20260922210000_rollback_employee_doc_grace.sql

alter table public.employees
  add column if not exists doc_grace_until date;
