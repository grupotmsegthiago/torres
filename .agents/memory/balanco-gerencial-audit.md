---
name: Auditoria do Balanço Gerencial
description: Onde vivem e como reconciliar os números do painel "Balanço Gerencial" (eficiência km/L, RH, Estrutura, Operacional).
---

## Eficiência km/L é calculada no FRONTEND, não no backend
O `/api/financial/dashboard` (server/routes/escort.ts) NÃO devolve eficiência — ela é
computada num `useMemo` em `client/src/pages/admin/balanco-gerencial.tsx` a partir de
`vehicle_fueling` (km entre abastecimentos consecutivos por viatura ÷ litros do
abastecimento corrente).

**Por que importa:** é sensível a outliers de `vehicle_fueling.liters`. Um único erro de
digitação (ex.: 42400 no lugar de 42,40) derruba a média de TODA a frota.
**Travas de sanidade no loop:** descarta `kmGap<=0 || kmGap>3000` (hodômetro/troca de
viatura) e `liters<=0 || liters>1000` (erro de digitação). Não há validação equivalente
no backend de `vehicle_fueling` — dado corrompido pode contaminar outros relatórios.

## Como auditar os 3 buckets de custo (reconciliação confiável)
Sempre via script `.local/test_*.mts` com `supabaseAdmin` (executeSql do agente aponta pro
Neon, não pro Supabase — não confiar).
- **Estrutura (rateado):** `Σ fixed_costs.monthly_value WHERE active`. Bate 1:1 com o card.
- **RH·Folha Real:** `Σ buildFolhaStats(emp.id, "YYYY-MM", { multiplicadorHE: 1.6 }).custoTotalEstimado`
  pros `employees` ativos (mesma fonte do Ponto Eletrônico / control-id.ts; sem provisões —
  é fluxo de caixa). `import { buildFolhaStats } from "server/control-id"`. Endpoint:
  `GET /api/fixed-costs/rh-summary` em server/routes/fixed-costs.ts.
- **Custos Fixos+RH = Estrutura + RH** = base da meta (`calcMeta`).
- **Operacional:** `pag (VRP) + (fueling + mission_cost + maintenance)` de
  `financial_transactions` (EXPENSE) no período. RH/Estrutura/`payroll`/`fixed`/`other` são
  subtraídos de `despReaisOperacional` pra não duplicar.
- **costDays:** custos fixos/RH são rateados por mês comercial (30 dias), não pelo calendário
  (`Math.min(daysInPeriod, FIXED[period])`).

## Faturamento de OS recusada (regra INTOCÁVEL nº1) — auditoria recorrente
OS `status="recusada"` deve ter TODOS os `fat_*` do billing = 0, `status=CANCELADO`,
`observacoes="OS RECUSADA — <cancellation_reason>"`. Auditoria de Maio/2026 achou 7 billings
recusados não-zerados (faturamento indevido) — sintoma de billing dessincronizado do status
da OS. Vale re-checar periodicamente: `escort_billings` cujo `service_order_id` aponta pra OS
recusada mas `fat_total != 0`. Lógica oficial de zeragem: server/routes/service-orders.ts
branch `isRecusada`.
