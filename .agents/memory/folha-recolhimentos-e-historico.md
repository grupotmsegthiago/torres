---
name: Recolhimentos patronais fora do custo geral + histórico mensal da folha
description: Decisões duráveis da folha Torres — o que entra/não entra no "custo geral" do funcionário e como o histórico mensal é congelado.
---

# Recolhimentos patronais NÃO somam no custo geral (item 4, ordem do dono jun/2026)

O "Custo Real do funcionário" / custo de RH no Balanço Gerencial = **vencimentos + benefícios**. Os recolhimentos patronais (**FGTS, INSS patronal, seguro de vida**) são **informativos**: continuam calculados e exibidos, mas NÃO entram no total.

**Why:** o dono quer o "geral" como o desembolso de folha (o que o funcionário recebe + benefícios), com os encargos patronais visíveis à parte para conferência, não embutidos no número que ele compara com a planilha dele.

**How to apply:** `custoTotalEstimado` em `buildFolhaStats` (`server/control-id.ts`) = `vencimentosTotal + beneficiosTotal`. Esse campo propaga para card "Custo Real", ranking, lucro (`margemLiquida − custoTotalEstimado`) e `rh-summary.monthly` → Balanço. Se for adicionar QUALQUER novo consumidor de custo de RH, somar só venc+benef; recolhimentos só como linha separada rotulada "informativo · não soma". Os textos do front (`control-id.tsx`) devem dizer isso explicitamente — não reintroduzir "+ recolhimentos" na fórmula exibida.

# Histórico mensal da folha — snapshot automático (item 5)

Tabela `folha_historico_mensal` (`UNIQUE(employee_id, month_year)`): 1 linha por funcionário ativo por mês fechado, com pacote completo (horas, vencimentos, benefícios, recolhimentos, líquido) + `stats_json` JSONB cru. `custo_real` segue a regra acima (venc+benef).

**Why:** os números da folha são recalculados ao vivo (`buildFolhaStats`); sem congelar no fim do mês, mudanças futuras de cadastro/CCT reescreveriam o passado. O dono pediu "salvar automático no fim do mês".

**How to apply:** `snapshotFolhaMes(mesRef, {source})` em `server/lib/folha-historico.ts` (concorrência inline 6, upsert idempotente onConflict employee_id,month_year — NÃO usar pacote ESM-only de limiter, quebra no bundle CJS). Cron `0 5 1 * *` BRT grava o mês civil fechado (`prevMonthRef()`); cron `0 6 2-5 * *` é catch-up via `snapshotFolhaMesIfMissing` (só roda se o mês ainda não tem linha — cobre Supabase fora no dia 1). Backfill manual: POST `/api/control-id/folha-historico/snapshot` (admin); leitura: GET `/api/control-id/folha-historico`. Snapshot de ~21 ativos leva ~30s (ok p/ endpoint). UI de visualização do histórico ainda NÃO existe (só backend/saving) — construir quando o dono pedir.
