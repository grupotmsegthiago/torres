-- Rollback de Comercial > Patrimonial. Apaga propostas e a matriz salvas neste módulo.
drop table if exists public.commercial_proposals;
drop table if exists public.financial_matrix_config;
