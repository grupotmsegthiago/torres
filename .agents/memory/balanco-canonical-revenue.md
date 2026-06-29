---
name: Receita do Balanço + Relatório de OS = CANÔNICO ao vivo (calcularEscolta)
description: Decisão revertida 29/06/2026 — Balanço Gerencial E Relatório de OS mostram receita pelo motor canônico ao vivo (km/horas reais), por scheduled_date; cancelada=boletim, recusada=0.
---

# Balanço Gerencial E Relatório de OS usam o CANÔNICO ao vivo (NÃO o boletim congelado)

Decisão do dono (ordem explícita **29/06/2026**, via user_query): **as DUAS telas** — Relatório de OS e Balanço Gerencial — mostram a receita pelo **motor CANÔNICO ao vivo** (`calcularEscolta`, exposto em `liveCost.canonico.faturamento` pelo grid `/api/operational-grid`): km/horas reais, HE fracionada por minuto (regra #5), km misto carregado/vazio, adicional noturno.

**Why:** o dono quis as duas telas batendo no MESMO número, recalculado de verdade (não o boletim congelado nem o `faturamento_live` simplificado, que subfaturava). Isto REVERTE a decisão anterior (que punha o Balanço no `escort_billings.fat_total_boletim` persistido).

**How to apply / invariantes:**
- Fonte única de receita = `(liveCost as any)?.canonico?.faturamento`. Fallback em cadeia IDÊNTICA nas duas telas: `canonico?.faturamento ?? faturamento_live ?? faturamento`. Como a cadeia e a janela (por `scheduled_date`) são iguais, as duas telas somam EXATAMENTE o mesmo total.
- **EXCEÇÃO cancelada:** OS `status==="cancelada"` usa o BOLETIM congelado (`fat_total_boletim`) QUANDO existe — §8.1b (tabela 100 km, que o motor canônico do grid NÃO aplica, pois roda o contrato da OS). Sem boletim ⇒ cai no canônico (fallback seguro; cancelada com km=0/h=0 dá só acionamento ~R$140, sem superfaturar).
- **Recusada = R$0:** filtrada por `service_orders.status==="recusada"` (liveCost nulo ⇒ 0). Nunca entra.
- "Só exibição": NÃO recalcula nem grava billing. O canônico já é computado pelo grid (`/api/operational-grid`) e exposto em `liveCost.canonico`; backend intocado.
- NUNCA remover/alterar `faturamento_live` do grid nem `fat_total`/`fat_total_boletim` do byMission — outros consumidores dependem. Só se troca QUAL campo a tela lê.
- `faturamento_live` (motor simplificado) SUBFATURA vs `canonico.faturamento` (subestima HE/km misto) — nunca tratar os dois como equivalentes; canônico é a fonte boa.
- Paridade exige migrar TODOS os pontos de exibição da tela, não só o total: linha da tabela, popover de detalhe, modal por-OS, KPIs e export. Resíduo em qualquer um quebra a paridade visível.

## Atribuição por data de agendamento + projeção

- Cada missão pertence ao dia do seu `scheduled_date` (BRT). O grid (`/api/operational-grid`) e o Balanço atribuem por `scheduled_date` primeiro (fallback `mission_started_at`/`completed_date`/`created_at` só se nulo). Missão multi-dia conta SÓ no dia do agendamento; nunca deslocada pra "hoje" nem duplicada.
- **Consequência legítima:** no 1º dia de um período, Semanal/Mensal pode ser MAIOR que o Diário porque inclui missões `agendada` pra dias seguintes do período (não é bug). Auditar via `scheduled_date` antes de tratar como erro.
- **Projeção (card Faturamento):** a média diária deve usar SÓ o `realizadoFat` (missões com `data <= hoje`), não `totals.fat` (que inclui agendamentos futuros do período) — senão divide total por 1 dia decorrido e infla. Núcleo puro/testável em `client/src/lib/balanco-projection.ts` (`computeProjection`), teste `.local/balanco-projection.test.mts`. Projeção nunca abaixo de realizado+agendado (Math.max).
