---
name: OS Cancelada cobra pela tabela de 100 km
description: Regra de billing ao cancelar OS de escolta (recalcula via tabela de 100 km do cliente)
---

Ao **cancelar** uma OS de escolta, o sistema RECALCULA o billing pela "tabela de 100 km" do cliente — não preserva mais o valor antigo nem zera (zerar é só recusada, §8.1).

- **Tabela de 100 km** = contrato de escolta `Ativo` do cliente com `franquia_km=100` E `franquia_horas=3`. Fallback: `Ativo` com `franquia_km=100`. Senão, contrato vinculado à OS (`escort_contract_id`). Sem nada disso ⇒ só marca `status="CANCELADO"`.
- Recalcula via `calcularEscolta` com **km/tempo reais** (fotos em `step_logs`, `mission_started_at`/`completed_date`, `scheduled_date`). Dentro da franquia (≤100km E ≤3h) ou tudo zero ⇒ **só acionamento**; excedente ⇒ + km×valor_km_extra / HE fracionada.
- Billing **congelado** (status ∈ APROVADA/FATURADO/FATURADA/PAGO) NÃO recalcula — só marca CANCELADO.
- Escrita por upsert `onConflict: service_order_id` (§8.6). Espelha total em `service_orders.valor_estimado`/`fat_calculado`. **NÃO cria financial_transaction** (cancelamento nunca espelhou tx).

**Why:** Ordem explícita do dono (17/06/2026) mudando §8.1 cancelada. Antes "cancelada" preservava o valor herdado, o que deixava billings inflados (ex.: OS#TOR-0295 estava R$4.800 herdado da tabela de 1000 km, virou R$480). Tabela de 100 km é o piso de cobrança de cancelamento.

**How to apply:** Implementação em `server/lib/cancelada-billing.ts` (`getTabela100km` + `computeCanceladaBilling`), chamada em `POST /api/mission/cancel` e no branch cancelada do PATCH `/api/service-orders/:id`. Teste: `server/lib/cancelada-billing.test.ts`. Ajuste histórico: `.local/test_fix_canceladas_historico.mts` (DRY-RUN sem `--apply`). Detalhe pleno em SYSTEM_BRAIN §8.1b. É regra INTOCÁVEL (#1b) — não reverter sem ordem do dono.
