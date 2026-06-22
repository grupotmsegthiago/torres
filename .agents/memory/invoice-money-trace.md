---
name: Rastreio de fatura (rota do dinheiro)
description: Como remontar a timeline completa de uma fatura/NF a partir de fontes espalhadas que NÃO se referenciam diretamente.
---

# Rastreio "rota do dinheiro" de uma fatura

O histórico completo de uma fatura (quem criou, quem deu baixa manual, quando o dinheiro caiu) NÃO existe em uma tabela única — precisa ser agregado de 5 fontes que não compartilham FK consistente:

1. **Criação** — `invoices.created_by` → `users.name` + `invoices.created_at`.
2. **`system_audit_logs`** — filtrar por `target_type="invoice"` e `target_id = String(id)` (target_id é texto).
3. **`invoices.nfse_observations`** — coluna REAL no banco mas AUSENTE do schema Drizzle; é um log append-only separado por `" | "`. As baixas manuais (DINHEIRO/PIX/TRANSFERENCIA) e alterações de vencimento ficam SÓ aqui, em texto livre. Parse por regex: `por (.+?) em `, ` em (ISO)`, `R\$([\d.]+)`. Notas geradas pelo sistema usam ponto decimal (`R$588.80`), não vírgula.
4. **`inter_extrato_lancamentos`** — TEM `invoice_id`; é quando o dinheiro efetivamente caiu na conta Inter.
5. **`financial_transactions`** — NÃO tem `invoice_id`; vincular por `origin_type="invoice"` + `origin_id`. (Tabela não está no schema Drizzle; DDL em db-init.ts.)

**Why:** a baixa manual de dinheiro/PIX é gravada apenas como texto em `nfse_observations`, então sem fazer o parse dessa coluna o "quem recebeu em dinheiro e quando" some do rastreio. E como as fontes usam chaves diferentes (target_id texto, invoice_id, origin_id), juntar tudo exige normalizar timestamps BRT (sem offset⇒-03:00; date-only⇒T12:00:00-03:00) para ordenar cronologicamente.

**How to apply:** endpoint read-only `GET /api/invoices/:id/rastreio` em server/asaas.ts (helper `toMs()` para normalizar BRT). Frontend: `InvoiceTraceDialog` em faturas.tsx, queryKey `['/api/invoices', id, 'rastreio']`. Puramente leitura/exibição — não recalcula billing (regras INTOCÁVEIS §8 intactas).
