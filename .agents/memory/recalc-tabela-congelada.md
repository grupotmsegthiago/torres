---
name: Recalcular billing pela tabela cadastrada (contract_id congelado)
description: Por que trocar a tabela da OS não recalcula o billing sozinho, e por que o endpoint /calcular é arriscado para recálculo em massa.
---

## Problema
Quando se troca `service_orders.escort_contract_id` DEPOIS que o `escort_billings` já foi criado, o billing **não recalcula sozinho** — ele congela o `contract_id` no momento do cálculo. Resultado: a OS aponta pra tabela nova, mas o faturamento continua com os valores da tabela antiga.

**Por que nem na conclusão propaga:** o auto-recalc de conclusão (PATCH OS, em `service-orders.ts`) lê o contrato por `bill.contract_id` (o congelado), **não** por `so.escort_contract_id`. Então a troca de tabela na OS nunca chega ao billing por esse caminho.

## Regra ao recalcular billing pela tabela cadastrada
NÃO usar o endpoint `POST /api/boletim-medicao/calcular/:osId` para recálculo em massa de OS já concluídas:
1. Ele **relê o KM das fotos** (`km_chegada`/`km_final`). Fotos podem estar corrompidas/zeradas — caso real: TOR-0211 tinha foto `km_chegada=0`, e o endpoint usaria km_total≈17.769 em vez de 2.710, explodindo o KM excedente (~R$85 mil indevidos).
2. Ele **zera billing de cancelada/recusada** (branch `isCanceladaOuRecusada` → CANCELADO, fat_*=0). Isso conflita com a regra de cancelada = acionamento+extras (§8.1). Nunca recalcular cancelada por ele.

**Caminho seguro (contract-only):** chamar `calcularEscolta` (server/billing-calc.ts) com o **KM/horários reais que já estão no `escort_billings`** (não reler fotos) + os timestamps reais da OS (`mission_started_at`/`completed_date`/`scheduled_date` em ISO, §8.5) + o contrato ALVO (`so.escort_contract_id`). Depois `UPDATE escort_billings ... .eq("id", bill.id)` (update por id = sem risco de duplicar, §8.6). Só tocar billings `A_VERIFICAR`/`REJEITADA` (nunca APROVADA/FATURADO/PAGO). Excluir OS em andamento ou só corrigir o `contract_id` pointer pra fechar pela tabela certa.

**Why:** o KM real fica salvo no billing; reler foto é fonte instável. Trocar só o contrato e manter KM/timestamps dá o valor correto da tabela sem efeitos colaterais.

## Efeito esperado de aplicar a tabela certa
Acionamento sobe, mas KM excedente cai (tabelas de rota longa têm franquia_km grande, ex. 200/1000/2600 km, que absorve o KM). Pode reduzir o total líquido. Ex. real (jun/2026): 5 OS do cliente TM SEGURANCA passaram de R$59.379,50 → R$45.616,30 ao trocar da tabela errada "100KM - SUDESTE" (franquia 100) pelas tabelas ORIGEM/rota corretas.
