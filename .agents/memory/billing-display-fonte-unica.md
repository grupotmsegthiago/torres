---
name: Fonte única de exibição financeira do billing
description: oficialBillingView é a única regra de exibição de valores de escort_billings; telas não podem ter fórmula própria
---

Regra: qualquer tela que exiba valores de um escort_billing consome a visão do
servidor — `oficialBillingView` (server/lib/billing-display.ts), anexada como
`_oficial` em GET /api/escort/billings e `total_oficial`/`_oficial_billing` em
GET /api/boletim-medicao/os-concluidas. Snapshot congelado de boletim enviado
(dado persistido) ainda tem precedência na tela do boletim.

**Why:** boletim, relatório de faturamento e o export Excel tinham cada um sua
cópia das fórmulas (fallback de hora extra/km, recusada/cancelada) e divergiam
entre si e do servidor (Etapa 1 do plano de sincronismo, aprovada 28/07/2026).

**How to apply:** tela nova ou coluna nova = consumir `_oficial`, nunca somar
fat_* localmente. Fallbacks do helper espelham calcularEscolta (fracionada =
horasExc × valor; cheia = ceil × valor). Precedência de contrato:
OS.escort_contract_id > billing.contract_id > contrato Ativo do cliente.
Testes: server/lib/billing-display.test.ts. É SÓ leitura — nunca grava.

Bônus da mesma etapa: o auto-recálculo do PATCH de OS falhava mudo com "osId is
not defined" (custos de missão não entravam no billing ao editar OS) — corrigido
para data.id; se a edição de OS parar de propagar custos, olhar esse bloco.
