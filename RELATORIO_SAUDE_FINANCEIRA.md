# RELATÓRIO DE SAÚDE FINANCEIRA — Torres Vigilância Patrimonial
## Auditoria Técnica do Módulo Financeiro Pós-Migração
**Data**: 08/04/2026

---

## 1. CÁLCULOS DE MISSÃO (mission_costs e trips)

### Tipos de Dados no Banco

| Tabela | Campo | Tipo no PostgreSQL | Seguro para dinheiro? |
|--------|-------|-------------------|----------------------|
| `mission_costs` | `amount` | `DECIMAL(10,2)` | ✅ SIM |
| `vehicle_fueling` | `total_cost` | `DECIMAL(10,2)` | ✅ SIM |
| `vehicle_fueling` | `cost_per_liter` | `DECIMAL(10,2)` | ✅ SIM |
| `vehicle_fueling` | `liters` | `DECIMAL(10,2)` | ✅ SIM |
| `vehicle_maintenance` | `cost` | `DECIMAL(10,2)` | ✅ SIM |
| `employee_salaries` | `base_salary` | `DECIMAL(10,2)` | ✅ SIM |
| `employee_salary_discounts` | `amount` | `DECIMAL(10,2)` | ✅ SIM |
| `invoices` | `value` | `DECIMAL(12,2)` | ✅ SIM |
| `invoices` | `net_value` | `DECIMAL(12,2)` | ✅ SIM |
| `jornada_calculos` | `total_bruto` | `DECIMAL(12,2)` | ✅ SIM |
| `jornada_calculos` | `valor_hora_normal` | `DECIMAL(10,2)` | ✅ SIM |

### ⚠️ ALERTA: Campos com tipo `real` (float4) em tabelas financeiras

| Tabela | Campo | Tipo | Risco |
|--------|-------|------|-------|
| `service_orders` | `valor_estimado` | `REAL` | ⚠️ MÉDIO — Usado apenas como estimativa, não para faturamento real |
| `service_orders` | `pedagio_estimado` | `REAL` | ⚠️ MÉDIO — Idem, é só estimativa |
| `employee_payslips` | `salario_base` | `REAL` | ⚠️ ALTO — Usado para holerites |
| `employee_payslips` | `horas_extras` | `REAL` | ⚠️ ALTO — Idem |
| `employee_payslips` | `adicional_noturno` | `REAL` | ⚠️ ALTO — Idem |
| `employee_payslips` | `periculosidade` | `REAL` | ⚠️ ALTO — Idem |
| `employee_payslips` | `gross_salary` | `REAL` | ⚠️ ALTO — Idem |
| `employee_payslips` | `net_salary` | `REAL` | ⚠️ ALTO — Idem |
| `employee_payslips` | `deductions` | `REAL` | ⚠️ ALTO — Idem |
| `employee_payslips` | `benefits` | `REAL` | ⚠️ ALTO — Idem |
| `employee_fines` | `amount` | `REAL` | ⚠️ MÉDIO — Valores de multas |

**Diagnóstico**: Os campos da tabela `employee_payslips` (holerites) usam `REAL` (float4), que tem precisão limitada (~7 dígitos). Para salários abaixo de R$ 99.999,99 não há problema prático, mas é uma vulnerabilidade teórica para valores maiores ou somas acumuladas.

**Recomendação**: Migrar `employee_payslips` para `DECIMAL(10,2)` em uma janela de manutenção futura. Por enquanto, o risco é baixo pois os valores são individuais (não somas cumulativas).

### Verificação de Cálculo Total

O faturamento (`escort_billings`) é calculado em dois locais:
1. **`server/billing-calc.ts`** → função `calcularEscolta()` — engine central
2. **`server/cron.ts`** → job CRON a cada 30 min recalcula billings de OS ativas

O cálculo usa a fórmula:
```
fat_total = fat_acionamento + fat_hora_extra + fat_km_carregado + fat_km_vazio
          + fat_pernoite + fat_noturno + fat_pedagio + fat_diarias + fat_estadia
          + fat_armamento + fat_alimentacao + fat_outros
```

Cada componente é calculado individualmente e somado. Os valores intermediários são armazenados em colunas separadas no `escort_billings` para auditabilidade.

**Resultado**: ✅ O cálculo total é a soma das partes. Não há risco de divergência entre o total e os componentes.

---

## 2. INTEGRAÇÃO ASAAS (invoices e escort_billings)

### Proteção contra Duplicação de Boletos

| Cenário | Proteção | Status |
|---------|----------|--------|
| Clique duplo no botão de gerar boleto | ❌ **NÃO HÁ** proteção de idempotência no frontend | ⚠️ RISCO |
| Mesmo serviceOrderId gera 2 boletos | ❌ **NÃO HÁ** verificação de boleto existente antes de criar | ⚠️ RISCO |
| `externalReference` duplicado no Asaas | O Asaas **aceita** duplicados (externalReference não é unique key) | ⚠️ RISCO |

**Detalhes do risco**: Na rota `POST /api/invoices` (server/asaas.ts), ao criar uma cobrança:
```typescript
const paymentPayload = {
  customer: asaasCustomerId,
  billingType: "BOLETO",
  value: parseFloat(value),
  externalReference: serviceOrderId ? `OS-${serviceOrderId}` : undefined,
  // NÃO verifica se já existe boleto para esta OS
};
const payment = await asaasRequest("POST", "/payments", paymentPayload);
```

**Não existe nenhuma verificação** se já foi criado um boleto para a mesma OS/fatura. Se o usuário clicar duas vezes, **DOIS boletos serão gerados no Asaas**.

**Recomendação URGENTE**: Adicionar verificação antes de criar:
```typescript
const { data: existing } = await supabaseAdmin.from("invoices")
  .select("id, asaas_payment_id")
  .eq("service_order_id", serviceOrderId)
  .eq("status", "PENDING")
  .limit(1);
if (existing?.length) {
  return res.status(409).json({ message: "Já existe boleto pendente para esta OS" });
}
```

### Status de Pagamento

O status é atualizado via **webhook Asaas** → rota `POST /api/asaas/webhook`:
- Quando o Asaas notifica pagamento, o sistema atualiza `invoices.status` e `invoices.payment_date`
- ✅ O webhook está implementado e funcional

**MAS**: Se o webhook falhar (Asaas não conseguir entregar), o sistema **NÃO** faz polling ativo para verificar status. O pagamento só seria descoberto manualmente.

**Recomendação**: Implementar um CRON job que consulta `GET /payments?status=RECEIVED` no Asaas periodicamente para reconciliar.

---

## 3. CONSISTÊNCIA APÓS MIGRAÇÃO

### Filtros de ID nas queries Supabase

Todas as chamadas `supabaseAdmin.from('invoices')` usam filtros adequados:

| Operação | Filtro | Seguro? |
|----------|--------|---------|
| Listar faturas do cliente | `.eq("client_id", clientId)` | ✅ |
| Buscar fatura por ID | `.eq("id", invoiceId).single()` | ✅ |
| Atualizar status | `.eq("id", invoiceId)` | ✅ |
| Deletar fatura | `.eq("id", invoiceId)` | ✅ |
| Webhook atualizar | `.eq("asaas_payment_id", paymentId)` | ✅ |

**Resultado**: ✅ Não há risco de misturar cobranças de clientes diferentes. Todas as queries filtram por `client_id` ou `id` específico.

### Billings (escort_billings)

| Operação | Filtro | Seguro? |
|----------|--------|---------|
| Listar billings | `.eq("client_id", clientId)` ou sem filtro (admin vê tudo) | ✅ |
| Atualizar billing | `.eq("id", billingId).single()` | ✅ |
| Auto-billing (CRON) | `.eq("service_order_id", osId).limit(1)` — verifica existência antes de inserir | ✅ |
| Lock de status | Verifica `LOCKED_STATUSES = ["APROVADA", "FATURADO", "PAGO"]` antes de permitir edição | ✅ |

**Resultado**: ✅ Billings protegidos contra edição após aprovação.

---

## 4. LOGS FINANCEIROS

### Transações Financeiras

A função `createAutoTransaction()` em `_helpers.ts` cria registros em `financial_transactions` com:
- `origin_type`: tipo da origem (ex: "fueling", "mission_cost")
- `origin_id`: ID único da origem
- `created_by`: nome do operador ou "SISTEMA"

| Ação | Gera log em financial_transactions? | Gera audit_log? |
|------|-------------------------------------|-----------------|
| Abastecimento | ✅ via createAutoTransaction() | ✅ via logSystemAudit() |
| Billing aprovado | ✅ via createAutoTransaction() | ✅ |
| Fatura criada no Asaas | ✅ insere na tabela invoices | ✅ via logSystemAudit() |
| Fatura cancelada | ✅ atualiza invoices + remove transaction | ✅ via logSystemAudit() |
| Missão encerrada | ✅ billing criado automaticamente | ✅ |
| Edição manual de billing | ✅ billing atualizado | ✅ com "antes/depois" |

**Resultado**: ✅ Todas as operações financeiras geram logs de auditoria com ID do operador.

---

## RESUMO DE DISCREPÂNCIAS ENCONTRADAS

| # | Severidade | Descrição | Ação Recomendada |
|---|-----------|-----------|------------------|
| 1 | 🔴 ALTA | **Sem proteção contra duplicação de boletos no Asaas** — clique duplo gera 2 boletos | Adicionar verificação de existência antes de criar pagamento |
| 2 | 🟡 MÉDIA | **employee_payslips usa REAL (float4)** para valores financeiros | Migrar para DECIMAL(10,2) em janela de manutenção |
| 3 | 🟡 MÉDIA | **Sem reconciliação ativa** de pagamentos Asaas (depende 100% do webhook) | Implementar CRON de reconciliação com API Asaas |
| 4 | 🟢 BAIXA | `valor_estimado` e `pedagio_estimado` em service_orders usam REAL | Aceitável — são apenas estimativas, não valores de faturamento |
| 5 | 🟢 INFORMATIVO | Valores de CCT (jornada_calculos) usam DECIMAL(10,2) corretamente | Nenhuma ação necessária |

### Itens Confirmados OK ✅
- mission_costs usa DECIMAL(10,2) — ✅ Seguro
- invoices usa DECIMAL(12,2) — ✅ Seguro
- Cálculo total bate com soma das partes — ✅
- Queries filtram por client_id/id — ✅ Sem mistura de dados
- Todas as transações geram audit_log — ✅
- Billings protegidos por lock de status — ✅
- Auto-billing verifica existência antes de inserir — ✅ Idempotente no CRON
