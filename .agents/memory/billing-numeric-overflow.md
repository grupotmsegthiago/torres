---
name: Overflow numérico ao aprovar boletim
description: "numeric field overflow" na aprovação = coluna NUMERIC estreita em prod (margem_percentual) + despesa fantasma congelada no billing
---

Regra: erro 500 `numeric field overflow` ao aprovar/salvar billing quase sempre é uma coluna NUMERIC de prod mais estreita do que o db-init declara (o `ADD COLUMN IF NOT EXISTS` não corrige tipo de coluna já existente) combinada com um valor absurdo congelado no billing (ex.: despesas_combustivel de dezenas de milhares vindo de custo deletado depois).

**Why:** TOR-0436 (jul/2026): `margem_percentual` nasceu NUMERIC(6,2) em prod (db-init dizia 10,2 mas era no-op); combustível fantasma de R$157k gerou margem −13.702% → overflow na aprovação.

**How to apply:**
- Diagnóstico: recalcular via `calcularEscolta` com os dados do billing e comparar cada saída com `information_schema.columns` (precision/scale reais de prod, via pg.Client — PostgREST não faz introspecção).
- Correção: `ALTER COLUMN ... TYPE NUMERIC(maior)` no db-init (widening é seguro) + corrigir o dado fantasma no billing; validar com UPDATE em BEGIN/ROLLBACK.
- `ADD COLUMN IF NOT EXISTS tipo` NÃO garante o tipo em prod — se o db-init declara um tipo, confira o tipo real antes de confiar.
