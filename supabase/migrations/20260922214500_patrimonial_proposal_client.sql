-- Liga a proposta patrimonial ao cliente do cadastro.
-- Rollback: supabase/migrations/rollback/20260922214500_rollback_patrimonial_proposal_client.sql

alter table public.patrimonial_price_proposals
  add column if not exists client_id integer;

create index if not exists patrimonial_price_proposals_client_id_idx
  on public.patrimonial_price_proposals (client_id);
