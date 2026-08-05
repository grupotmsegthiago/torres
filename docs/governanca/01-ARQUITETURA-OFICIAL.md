# 01 — Arquitetura Oficial do Sistema Torres

**Natureza:** Constituição do projeto (normativa)  
**Origem:** Fase 0.3  
**Precedência:** ver [`README.md`](./README.md)

Este documento define **como o sistema DEVE funcionar**, não apenas como está hoje.

---

## Princípios constitucionais

1. Uma informação, um dono.
2. Fato ≠ Resultado ≠ Cache ≠ Snapshot ≠ Projeção ≠ Espelho ≠ Satélite.
3. Camada superior não altera camada inferior.
4. Um motor oficial de faturamento de missão: `calcularEscolta` (+ `computeCanceladaBilling` e recusada = R$ 0).
5. Após aprovação comercial, o snapshot do boletim é lei.
6. `financial_transactions` é a razão financeira da empresa.
7. IA é assistente, nunca fonte de verdade.
8. Gateways externos (Asaas, Inter, Z-API, RHID, OpenAI) são satélites.
9. Projeção pode divergir de snapshot só se rotulada.
10. Nenhuma tela recalcula regra de negócio em paralelo ao motor oficial para número que vá a cliente, fatura ou balanço.

---

## Hierarquia oficial (mão única)

```text
0. SATÉLITES EXTERNOS
   Asaas · Inter · Z-API · RHID · APIBrasil · SSX · OpenAI
        ↓ só sincronizam para dentro

1. FATOS MESTRES
   clients · employees · vehicles · escort_contracts · service_contracts (documental)
        ↓
2. FATOS OPERACIONAIS
   service_orders
        ↓
3. FATOS DE CAMPO
   mission_* · vehicle_fueling · vehicle_maintenance · control_id_punches
        ↓
4. CÁLCULO DETERMINÍSTICO OFICIAL
   calcularEscolta · computeCanceladaBilling · billingTotalForBoletim (recusada=0)
   calcularFolha (custo RH)
   ⚠ calcularFaturamentoLive = NÃO OFICIAL (estimativa rotulada)
        ↓
5. SNAPSHOT FINANCEIRO POR OS
   escort_billings
        ↓
6. SNAPSHOT COMERCIAL
   boletim_approvals.billing_snapshot
        ↓
7. COBRANÇA
   invoices
        ↓
8. LEDGER
   financial_transactions
        ↓
9. INDICADORES
   balanco-calc (fórmula oficial de margem/resultado)
        ↓
10. PROJEÇÕES / CACHE / ESPELHOS
    operational-grid · SWR · fat_calculado na OS · memCache
        ↓
11. APRESENTAÇÃO
    React · Excel · e-mail · WhatsApp UI
```

**Lei:** camadas 9–11 não escrevem fatos/snapshots comerciais (1–8), exceto invalidação de cache.  
Camada 7–8 não reabre componentes do boletim aprovado.

---

## Fonte única por estágio

| Estágio | Dono |
|---------|------|
| Cadastro cliente/frota/pessoa | `clients`, `vehicles`, `employees` |
| Preço de escolta | `escort_contracts` |
| Contrato documental/UI | `service_contracts` (não precifica) |
| Operação | `service_orders` |
| Evidência de campo | `mission_*` |
| Cálculo de missão | `calcularEscolta` (+ cancelada/recusada) |
| Snapshot financeiro OS | `escort_billings` |
| Snapshot comercial | `boletim_approvals.billing_snapshot` |
| Cobrança / NFS-e | `invoices` |
| Caixa / P&L ledger | `financial_transactions` |
| KPI gerencial | `client/src/lib/balanco-calc.ts` |
| Batida ponto | `control_id_punches` |
| Histórico WhatsApp produto | `whatsapp_chats` / `whatsapp_messages` |

---

## Responsabilidades dos domínios (resumo)

Detalhamento RACI em [`08-MATRIZ-RACI.md`](./08-MATRIZ-RACI.md). SSOT expandido em [`03-FONTES-DA-VERDADE.md`](./03-FONTES-DA-VERDADE.md).

### Motor oficial
- **Arquivo:** `server/billing-calc.ts` — função `calcularEscolta`
- **Cancelada:** `server/lib/cancelada-billing.ts` — `computeCanceladaBilling`
- **Totais boletim / recusada:** `server/lib/boletim-totals.ts` — `billingTotalForBoletim`
- **Estimativa NÃO oficial:** `calcularFaturamentoLive` — só projeção rotulada

### Billing
- Tabela `escort_billings` — um por OS
- Congelados contra recálculo automático: `APROVADA`, `FATURADO`, `FATURADA`, `PAGO`

### Boletim
- Após envio/aprovação: `billing_snapshot` + `total_value` são lei comercial
- Resync apenas em aprovações **PENDENTES** (`server/lib/boletim-resync.ts`)

### Invoice
- Nasce do boletim aprovado; gateways atualizam status, não o valor comercial de origem

### Financeiro (ledger)
- `financial_transactions` — razão; origens operacionais emitem lançamentos idempotentes

### Balanço
- Fórmula oficial em `balanco-calc.ts`
- Receita: canônico (abertas) ou boletim/billing congelado (aprovadas/canceladas)
- Custos: ledger + RH oficial + fixos — não motor live

### IA
- Assistente (OCR sugestão, texto, classificação). Nunca grava `fat_*`, boletim, invoice ou margem.

### Integrações
- Satélites: sincronizam status/eventos para dentro; autenticados; fail-closed.

### Módulos órfãos (fora da arquitetura ativa)
Código/UI sem rota registrada no app **não é arquitetura ativa** até admissão formal:
- `gestor-medicao` / `gestor-dados` / `os-financeiro` (rotas não registradas em `server/routes.ts` no estado auditado)
- página `consultas` sem rota em `App.tsx` (estado auditado)

---

## Artigos (texto constitucional)

### Artigo I — Propósito
Operar escoltas, medir com evidência, faturar com rastreabilidade e apresentar indicadores confiáveis.

### Artigo II — Fonte por estágio
Cadeia obrigatória da hierarquia; todo desenvolvimento declara o estágio.

### Artigo III — Motor único
Somente `calcularEscolta` (+ satélites cancelada/recusada) para valor oficial de missão.

### Artigo IV — Boletim é lei comercial
Snapshot aprovado prevalece; invoice nasce dele.

### Artigo V — Ledger é lei financeira empresarial
`financial_transactions` é a razão.

### Artigo VI — Separação de dashboards
Caixa ≠ Resultado operacional ≠ Contagens. Sem motor próprio paralelo.

### Artigo VII — RH e ponto
Batida: Control iD. Custo Balanço: uma engine (`calcularFolha`).

### Artigo VIII — Integrações
Fail-closed. Heurísticas de vínculo são reparo, não fluxo normal.

### Artigo IX — IA
Sugere; humano/regra decide.

### Artigo X — Cache e projeção
Fato vence cache. Writer invalida.

### Artigo XI — Módulos órfãos
Só entram completos (lib + registro + UI ou contrato interno).

### Artigo XII — Evolução
Mudança cita dono, tipo de dado, e atualiza esta Constituição se mudar a regra.

### Artigo XIII — Intocável sem processo formal
- `calcularEscolta` e testes de pedágio/HE  
- `billingTotalForBoletim` (recusada = 0)  
- `computeCanceladaBilling`  
- Congelamento de boletim aprovado  
- Cadeia Boletim → Invoice → FT  
- Separação service_role (backend) vs anon (frontend)
