# 03 — Fontes da Verdade (SSOT)

**Natureza:** normativo  
**Origem:** Fases 0.2 e 0.3  
**Tipos de dado:** `FATO` · `RESULTADO` · `SNAPSHOT` · `PROJECAO` · `ESPELHO` · `CACHE` · `SATELITE`

---

## Cadastros e operação

| Domínio | Dono oficial | Tipo | Tabela / função | Escritores autorizados | Consumidores | Caches / espelhos | Fontes concorrentes atuais | Risco |
|---------|--------------|------|-----------------|------------------------|--------------|-------------------|----------------------------|-------|
| Clientes | `clients` | FATO | `clients` | `routes/clients`, storage | OS, contratos, invoices, WhatsApp | `memCache["clients"]` | — | Baixo |
| Contrato tarifário | `escort_contracts` | FATO (regra de preço) | `escort_contracts` | rotas escort/clients | motor, OS, billing, cancelada | cache in-memory no grid | `service_contracts` (outro papel) | Médio (nomenclatura) |
| Contrato documental | `service_contracts` | FATO documental | `service_contracts` | `/api/service-contracts` | UI cliente / PDF | — | confundido com tarifa | Médio |
| Funcionários | `employees` | FATO | `employees` | `routes/employees` | OS, RH, missão, Control iD | `memCache["employees"]` | `users.employee_id` | Baixo |
| Veículos frota | `vehicles` | FATO | `vehicles` | `routes/vehicles` | OS, grid, fueling | memCache; telemetria | `client_vehicles` (cliente) | Baixo |
| OS | `service_orders` | FATO operacional | `service_orders` | service-orders, mission | quase todos | **`fat_calculado`, `custo_*_alocado`, `margem_calculada` = ESPELHOS** | billing, live, canônico | **Alto** |
| Missões | `mission_*` | FATO de campo | photos, positions, updates, costs, acceptances | mission, mobile, operational GPS | motor, billing, grid | FT via `createAutoTransaction` | pedágio expense+revenue | Médio |

---

## Cálculo e financeiro

| Domínio | Dono oficial | Tipo | Tabela / função | Escritores | Consumidores | Caches / espelhos | Concorrentes | Risco |
|---------|--------------|------|-----------------|------------|--------------|-------------------|--------------|-------|
| Motor escolta | `calcularEscolta` | RESULTADO | `server/billing-calc.ts` | — (puro) | billing, boletim, balanço, gestor | — | **`calcularFaturamentoLive`** | **Crítico** |
| Cancelada | `computeCanceladaBilling` | RESULTADO | `server/lib/cancelada-billing.ts` | mission/service-orders cancel | billing | — | snapshot diretoria zera cancelada | **Alto** |
| Recusada | `billingTotalForBoletim` | RESULTADO | `server/lib/boletim-totals.ts` | refuse flow | boletim, e-mail, Excel | — | billing sujo se não limpar | Médio |
| Billing | `escort_billings` | SNAPSHOT | 1 por OS | calcular endpoints, cron, escort | boletim, faturas, balanço | espelho OS `fat_calculado` | live calc | **Alto** |
| Boletim comercial | `boletim_approvals.billing_snapshot` | SNAPSHOT | `boletim_approvals` | enviar-aprovação; resync só PENDENTE | invoice, cliente | `total_value` | billing live pós-envio | **Crítico** |
| Invoices | `invoices` | FATO de cobrança | `invoices` | boletim aprovado, Asaas, Inter | financeiro, NF | gateway IDs | auto-link heurístico | Médio |
| Ledger | `financial_transactions` | FATO ledger | `financial_transactions` | `createAutoTransaction`, webhooks, manual | balanço, dashboard caixa | — | billing.despesas_*, OS alocada | **Alto** |
| Balanço / margem | `balanco-calc` | RESULTADO (KPI) | `client/src/lib/balanco-calc.ts` | — | UI Balanço, Gestor (quando ativo) | SWR inputs | margem billing, margem OS, snapshot diretoria | **Crítico** |
| Pedágio fato | expense `mission_costs` | FATO | category Pedágio | mobile pedágio, OS create estimado | splitMissionCostsForBilling | revenue pair, FT, `pedagio_estimado` | 4 camadas | **Alto** |
| HE / KM missão | `calcularEscolta` | RESULTADO | inputs: timestamps + fotos + contrato | — | billing/balanço | live HE/KM | live engine | **Crítico** |

---

## RH, canais, satélites

| Domínio | Dono oficial | Tipo | Tabela / função | Escritores | Consumidores | Caches / espelhos | Concorrentes | Risco |
|---------|--------------|------|-----------------|------------|--------------|-------------------|--------------|-------|
| Batida ponto | `control_id_punches` | FATO (espelho local do dispositivo) | `control_id_*` | sync RHID, punch manual | `calcularFolha` | RHID externo | `employee_timesheets`, `timesheets`, `jornada_calculos` | **Alto** |
| Custo RH Balanço | `calcularFolha` / `calculateAgentMonthlyCost` | RESULTADO | `server/lib/*` | — | balanço, rh-summary | `folha_historico_mensal` | `buildFolhaStats` | **Alto** |
| Holerite | `employee_payslips` | FATO documental | payslips | routes/hr | FT se pago | OCR transitório | — | Baixo |
| WhatsApp | `whatsapp_messages` / `whatsapp_chats` | FATO de produto | tabelas locais | webhook + send | UI, Agent Central | caches Z-API identity | Z-API parcial | Médio |
| Asaas | API Asaas → `invoices` | SATELITE → FATO interno | `server/asaas.ts` | emit/reconcile/webhook | faturas, NF | customer/payment ids | Inter no mesmo invoice | Médio |
| Inter | API Inter → `invoices` + `inter_*` | SATELITE → espelhos | `routes/inter.ts` | cobrança/webhook | extrato, FT | `inter_extrato_*`, `inter_pagamentos`, `inter_webhook_events` | Asaas | Médio |
| IA / OpenAI | nenhum (assistente) | PROJECAO auxiliar | `openai` SDK, campos `ai_*` | endpoints OCR/agent | UI/WhatsApp | — | uso como SSOT (proibido) | Médio |
| Operational Grid | — | PROJECAO | `/api/operational-grid` | side-effects GPS/freeze | UI ops, balanço (canônico) | SWR 3h / `swr_cache_snapshots` | dual live+canônico | **Alto** |
| Dashboard financeiro | — | PROJECAO | várias APIs | — | UI | SWR | resumo-diretoria ≠ financial/dashboard | **Alto** |

---

## Regras de leitura

1. Para **cobrar cliente** → boletim snapshot (se enviado/aprovado) senão billing canônico.  
2. Para **KPI diretoria / margem** → `balanco-calc` + inputs oficiais.  
3. Para **caixa** → `financial_transactions`.  
4. Para **operar campo** → `service_orders` + `mission_*`.  
5. Nunca usar `calcularFaturamentoLive` ou `fat_calculado` da OS como valor comercial oficial.
