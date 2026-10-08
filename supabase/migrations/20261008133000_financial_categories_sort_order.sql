-- Ordem da planilha de categorias (08/10/2026).
-- Rollback: supabase/migrations/rollback/20261008133000_rollback_financial_categories_sort_order.sql

alter table public.financial_categories
  add column if not exists sort_order integer;
