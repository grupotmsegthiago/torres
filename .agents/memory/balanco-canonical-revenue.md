---
name: Receita do Balanço + Relatório de OS = CANÔNICO ao vivo (calcularEscolta)
description: Decisão revertida 29/06/2026 — Balanço Gerencial E Relatório de OS mostram receita pelo motor canônico ao vivo (km/horas reais), por scheduled_date; cancelada=boletim, recusada=0.
---

# Balanço Gerencial E Relatório de OS usam o CANÔNICO ao vivo (NÃO o boletim congelado)

Decisão do dono (ordem explícita **29/06/2026**, via user_query): **as DUAS telas** — Relatório de OS e Balanço Gerencial — mostram a receita pelo **motor CANÔNICO ao vivo** (`calcularEscolta`, exposto em `liveCost.canonico.faturamento` pelo grid `/api/operational-grid`): km/horas reais, HE fracionada por minuto (regra #5), km misto carregado/vazio, adicional noturno.

**Why:** o dono quis as duas telas batendo no MESMO número, recalculado de verdade (não o boletim congelado nem o `faturamento_live` simplificado, que subfaturava). Isto REVERTE a decisão anterior (que punha o Balanço no `escort_billings.fat_total_boletim` persistido).

**RECONCILIAÇÃO 29/06/2026 (mesma data, ordem posterior — RECOMENDADA pelo dono):** o "ao vivo sempre" superfaturava OS cujo boletim já foi CONFERIDO E CONGELADO por uma pessoa. Regra final: **boletim aprovado/faturado/pago manda; só boletim NÃO aprovado (A_VERIFICAR) recalcula ao vivo.**
- `FROZEN_BILLING_STATUSES = {APROVADA, FATURADO, FATURADA, PAGO}` (Set local em CADA tela client; status reais em prod: FATURADO/A_VERIFICAR/APROVADA/CANCELADO/REJEITADA — REJEITADA=recusada=R$0). `billFrozen = bill && FROZEN.has(bill.status.toUpperCase())`. `useBoletim = (isCancelada || billFrozen) && bill && fat_total_boletim>0`. Senão ⇒ canônico ao vivo.
- O `status` do BOLETIM vem de `byMission` (`/api/financial/dashboard`, `escort_billings.status`), NÃO confundir com `service_orders.status`. No relatorio-os o map `billingByOsId` precisou ganhar o campo `status` (e o tipo do Map).
- **Root cause que motivou:** grid lia foto `km_final` com `.find` (primeira) — quando o agente bate km errado e corrige, existem 2 fotos `km_final`; a 1ª (stale) inflava o live (TOR-0334: 38.829 errado vs 27.046 correção → R$61k vs boletim APROVADA R$5.144). Fix: `latestPhotoByStep` em operational.ts pega o `km_final` de maior `created_at` (fetch passou a trazer `created_at`); aplicado SÓ a km_final.
- **Fonte única de receita (boletins não-aprovados)** = `(liveCost as any)?.canonico?.faturamento`. Fallback IDÊNTICO nas duas telas: `canonico?.faturamento ?? faturamento_live ?? faturamento`.
- **EXCEÇÃO cancelada:** OS `status==="cancelada"` usa o BOLETIM congelado (`fat_total_boletim`) QUANDO existe — §8.1b (tabela 100 km, que o motor canônico do grid NÃO aplica). ATENÇÃO: o dashboard EXCLUI cancelada de `byMission` (recusadaOsIds inclui cancelada), então na prática cancelada cai no canônico via fallback. Não é o foco desta ordem (frozen=aprovado).
- **Recusada = R$0:** filtrada por `service_orders.status==="recusada"` (liveCost nulo ⇒ 0). Nunca entra.
- "Só exibição": NÃO recalcula nem grava billing. O canônico já é computado pelo grid (`/api/operational-grid`) e exposto em `liveCost.canonico`; backend intocado.
- NUNCA remover/alterar `faturamento_live` do grid nem `fat_total`/`fat_total_boletim` do byMission — outros consumidores dependem. Só se troca QUAL campo a tela lê.
- `faturamento_live` (motor simplificado) SUBFATURA vs `canonico.faturamento` (subestima HE/km misto) — nunca tratar os dois como equivalentes; canônico é a fonte boa.
- Paridade exige migrar TODOS os pontos de exibição da tela, não só o total: linha da tabela, popover de detalhe, modal por-OS, KPIs e export. Resíduo em qualquer um quebra a paridade visível.

## Atribuição por data de agendamento + projeção

- Cada missão pertence ao dia do seu `scheduled_date` (BRT). O grid (`/api/operational-grid`) e o Balanço atribuem por `scheduled_date` primeiro (fallback `mission_started_at`/`completed_date`/`created_at` só se nulo). Missão multi-dia conta SÓ no dia do agendamento; nunca deslocada pra "hoje" nem duplicada.
- **Consequência legítima:** no 1º dia de um período, Semanal/Mensal pode ser MAIOR que o Diário porque inclui missões `agendada` pra dias seguintes do período (não é bug). Auditar via `scheduled_date` antes de tratar como erro.
- **Projeção (card Faturamento):** a média diária deve usar SÓ o `realizadoFat` (missões com `data <= hoje`), não `totals.fat` (que inclui agendamentos futuros do período) — senão divide total por 1 dia decorrido e infla. Núcleo puro/testável em `client/src/lib/balanco-projection.ts` (`computeProjection`), teste `.local/balanco-projection.test.mts`. Projeção nunca abaixo de realizado+agendado (Math.max).
