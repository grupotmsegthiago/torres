drop index if exists public.patrimonial_price_proposals_client_id_idx;
alter table public.patrimonial_price_proposals drop column if exists client_id;
