---
name: Balanço Gerencial — receita = BOLETIM congelado (fat_total persistido)
description: O Balanço reflete o fat_total persistido do escort_billings (= Boletim de Medição 1:1); como bater e o que NÃO confundir com o motor ao vivo.
---

# Balanço Gerencial usa o BOLETIM DE MEDIÇÃO (fat_total persistido), NÃO o cálculo ao vivo

Decisão do dono (ordem explícita): o Balanço Gerencial deve mostrar **o que está no Boletim de Medição** — o `escort_billings.fat_total` PERSISTIDO (congelado). Antes ele usava receita AO VIVO (`canonico.faturamento`/`faturamento_live` do grid); isso foi trocado.

**Como bater 1:1 com o boletim:** o boletim (`boletim-medicao.tsx`) e o `escort_billings.fat_total` persistido são idênticos (medido: 0 divergência em 288 billings). O `calcFat` do dashboard (`/api/financial/dashboard` → byMission) **NÃO** bate: ele soma componentes mas **omite `receitas_os`** (divergiu em 115/288, até R$2.050). Por isso o byMission expõe um campo separado **`fat_total_boletim` = `b.fat_total` persistido**, e o Balanço usa ESSE campo (não `bill.fat_total`/calcFat).

**Why:** "o que tiver no boletim de medição é o que precisa trazer no balanço" — fonte de verdade é o documento de medição aprovado/congelado, não recomputo ao vivo (que sub/superfaturava por receitas_os e por divergência do motor ao vivo).

**How to apply / invariantes:**
- Balanço (`balanco-gerencial.tsx`): receita da missão = `bill.fat_total_boletim` (persistido). Fallback ao vivo (`canonico.faturamento`) SÓ quando a OS não tem boletim (ex.: agendada futura). Cobertura medida: 100% das OS do período já têm boletim → fallback raríssimo.
- Recusada continua FORA por `service_orders.status==="recusada"` (filtro no map). Existem billings recusados com rótulo antigo/fat>0 persistido (ex.: 36) — não importam, são excluídos pelo status, não pelo billing.
- NUNCA trocar o `fat_total` (calcFat) do byMission nem o `faturamento_live` do grid — outros consumidores (Relatório de OS, dashboard financeiro) dependem deles. Sempre ADICIONAR campo novo (`fat_total_boletim`).
- Drill-down do Balanço usa `bill.*` (acionamento, HE, km, adic.noturno, pedágio, estadia, pernoite, receitas_os) p/ somar ~igual ao total; km carregado/vazio em R$ não existem no boletim (mostra tudo como "KM Extra"); `despesas_outras` não tem linha no drill-down (1 OS afetada, só cosmético).
- Custos/pagamento no Balanço já vinham do billing; só a RECEITA mudou de fonte (ao vivo → boletim congelado). Decisão "só exibição": não recalcula nem grava billing.

## Atribuição por data de agendamento + projeção

- Cada missão pertence ao dia do seu `scheduled_date` (BRT). O grid (`/api/operational-grid`) e o Balanço já atribuem por `scheduled_date` primeiro (fallback `mission_started_at`/`completed_date`/`created_at` só se nulo). Missão multi-dia conta SÓ no dia do agendamento; nunca deslocada pra "hoje" nem duplicada.
- **Consequência legítima:** no 1º dia de um período, Semanal/Mensal pode ser MAIOR que o Diário porque inclui missões `agendada` pra dias seguintes do período (não é bug). Auditar via `scheduled_date` antes de tratar como erro.
- **Projeção (card Faturamento):** a média diária deve usar SÓ o `realizadoFat` (missões com `data <= hoje`), não `totals.fat` (que inclui agendamentos futuros do período) — senão divide total por 1 dia decorrido e infla. Núcleo puro/testável em `client/src/lib/balanco-projection.ts` (`computeProjection`), teste `.local/balanco-projection.test.mts`. Projeção nunca abaixo de realizado+agendado (Math.max).
