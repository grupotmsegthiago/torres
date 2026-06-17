---
name: Invariante recusada=R$0 em TODOS os writers de billing
description: §8.1 (OS recusada => faturamento zero, SEMPRE) precisa de guard em cada caminho de escrita de escort_billings, não só nos óbvios.
---

# Invariante §8.1 recusada=R$0 cobre TODO writer de escort_billings

**Regra:** `service_orders.status === "recusada"` => o billing vinculado é R$0 incondicional (status CANCELADO + todos `fat_*`/resultado/margem = 0). Isso vale em CADA endpoint que escreve `escort_billings`, não só na conclusão da OS.

**Why:** TOR-0255 (recusada) ressuscitou para R$ 2.921,67 porque "salvar" e "aprovar boletim" recalculavam pelo contrato sem checar recusada. Havia ~7 writers; bloquear só 1-2 deixa buracos — qualquer recálculo restante reintroduz a cobrança e ainda gera `financial_transaction` INCOME fantasma no Balanço.

**How to apply:**
- Guard central: `osIsRecusada(supabaseAdmin, serviceOrderId)` + `buildRecusadaZeroPayload()` em `server/lib/recusada-guard.ts` (helper puro p/ payload; `osIsRecusada` é fail-open — never throws, false em erro de leitura para não travar billing avulso).
- Padrão fail-closed nos writers: `if (await osIsRecusada(...)) payload = { ...payload, ...buildRecusadaZeroPayload(null, obs) }` (spread por cima do cálculo) e zerar `service_orders.fat_calculado`.
- Writers que precisam do guard (todos em `server/routes/escort.ts`): `POST /billings` (upsert), `PUT/:id`, `PATCH/:id`, `submit-os`, `recalcular-lote`, `salvar` (force-zero+return), `revisar` APROVADA (400, não recalcula nem marca concluida). `/calcular` (service-orders.ts) e o cron já eram seguros (FROZEN_STATUSES + exclui recusada).
- Ao criar QUALQUER novo endpoint que escreva `escort_billings`, aplicar o mesmo guard — senão reabre o buraco.
- Ao corrigir dado de OS recusada já cobrada em prod: além de zerar OS+billing, remover a `financial_transaction` INCOME (origin_type `escort_billing`/`service_order`) criada pela aprovação indevida.
