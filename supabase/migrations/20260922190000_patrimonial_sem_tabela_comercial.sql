-- O módulo Patrimonial não usa franquia, acionamento nem km da tabela comercial.
alter table public.commercial_proposals
  drop column if exists base_activation_value,
  drop column if exists km_franchise,
  drop column if exists extra_km_value,
  drop column if exists extra_hour_value;
