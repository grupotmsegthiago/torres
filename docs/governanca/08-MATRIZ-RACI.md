# 08 — Matriz RACI (responsabilidades)

**Natureza:** normativo
**Origem:** Fase 0.3
**Legenda:** **D** Dono · **C** Calcula · **O** Consome · **S** Sincroniza · **E** Apenas Exibe · **—** não atua

| Domínio | Dono (dado/fórmula) | Calcula | Consome | Sincroniza | Apenas Exibe |
|---------|---------------------|---------|---------|------------|--------------|
| Clientes | `clients` | — | OS, Contratos, Invoices | APIBrasil (opc.) | UI Clients |
| Contrato tarifário | `escort_contracts` | — | Billing, OS, Motor | — | UI tabelas |
| Contrato documental | `service_contracts` | — | UI cliente | — | UI Clients |
| Funcionários | `employees` | — | OS, RH, Missão | users / RHID | UI Employees |
| Veículos | `vehicles` | — | OS, Grid, Frota | SSX (sat.) | UI Vehicles |
| OS | `service_orders` | estimativa criação | Missão, Billing | — | Service Orders |
| Missões | `mission_*` | — | Motor, Billing | → FT (emissão) | Mobile / Grid |
| Motor faturamento | `calcularEscolta` | **C** | Billing | — | — |
| Cancelada | `computeCanceladaBilling` | **C** | Billing | — | — |
| Totais boletim | `billingTotalForBoletim` | **C** | Boletim / Excel | — | — |
| Billing | `escort_billings` | via motor | Boletim, Balanço | bust cache | Auditoria |
| Boletim | `boletim_approvals` | `boletim-totals` | Invoices | resync pendente | Aprovação / Excel |
| Invoices | `invoices` | — | Financeiro | Asaas / Inter | Faturas |
| Financeiro (ledger) | `financial_transactions` | agregações caixa | Balanço, Dashboard Caixa | webhooks | Financeiro UI |
| Custos (fato) | origem (`mission_costs` etc.) | — | Billing / FT | → FT | — |
| Margens | fórmula Balanço | **Balanço** | Diretoria | — | cards oficiais |
| Pedágios (fato) | `mission_costs` expense | markup no motor | Billing | → FT | Mobile / Conferência |
| HE missão | motor oficial | **calcularEscolta** | Billing / Balanço | — | Grid rotulado |
| KM excedente | motor oficial | **calcularEscolta** | Billing / Balanço | — | Grid / Boletim |
| Operational Grid | — (projeção) | projeção | UI Ops | GPS / geocode | Grid UI |
| Dashboard | — | só apresentação | usuário | — | Dashboard(s) |
| Balanço Gerencial | `balanco-calc` | **C** | Diretoria | cache bust | UI Balanço |
| RH custo | `calcularFolha` | **C** | Balanço | payslip → FT | RH UI |
| Control iD | `control_id_punches` | projeções ponto | RH | RHID | Control iD UI |
| WhatsApp | `whatsapp_*` | — | Agent / UI | Z-API | WhatsApp UI |
| IA | — | inferência | UI / WhatsApp | — | respostas |
| Banco Inter | satélite / espelhos | — | Invoices / FT | webhook API | Extrato |
| Asaas | satélite | — | Invoices / FT | webhook / reconcile | Faturas / NF |

## Regra de ouro

Quem **apenas exibe** não redefine fórmula.
Quem **sincroniza** não vira dono do valor comercial.
Quem **calcula** oficialmente está nomeado nesta matriz — qualquer outro cálculo é estimativa rotulada.
