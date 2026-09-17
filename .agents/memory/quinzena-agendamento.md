---
name: Quinzena segue agendamento da OS
description: Filtros de boletim/faturamento e envio ao cliente usam scheduled_date (1–15 / 16–fim), nunca data_missao do billing.
---

**Regra:** a quinzena comercial de uma OS é o dia do **agendamento** (`service_orders.scheduled_date`). Dias 1–15 entram na 1ª quinzena; 16 até o último dia do mês, na 2ª. `escort_billings.data_missao` pode ser o instante do lançamento (ex.: cancelada 14/09 gravada em 17/09) e **não** move a missão de quinzena.

**Why:** TM SEG 1ª quinzena set/2026 listava TOR-0833/0845 (missões 14–15) mas o envio ao cliente falhava com “quinzenas diferentes (2026-09-01 a 2026-09-17)” porque o gate lia `data_missao`. Na 2ª quinzena as mesmas OS reapareciam pelo filtro de `data_missao`.

**How to apply:** GET `/api/escort/billings?from&to`, `gerar-fatura` e `enviar-aprovacao` passam por `fetchBillingsByScheduledWindow` / `missionDateYmd`. Não filtrar o período por `escort_billings.data_missao`. Excel e tela preferem `scheduled_date`.
