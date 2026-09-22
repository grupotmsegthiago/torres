drop table if exists public.patrimonial_proposal_events;

alter table public.patrimonial_price_proposals
  drop constraint if exists patrimonial_price_proposals_status_chk;

alter table public.patrimonial_price_proposals
  drop column if exists released_by,
  drop column if exists released_at,
  drop column if exists status,
  drop column if exists margin_percent,
  drop column if exists negotiated_price,
  drop column if exists list_price;
