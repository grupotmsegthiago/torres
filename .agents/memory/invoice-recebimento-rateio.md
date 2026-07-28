---
name: Recebimento por OS (rateio de fatura)
description: Etapa 2 do vínculo OS↔Fatura — como pagamento parcial/estorno mexem em status e o que todo novo caminho de pagamento/exclusão deve chamar.
---

**Regra:** todo caminho que registra recebimento de fatura (webhook Asaas, webhook Inter, baixa manual) deve passar por `applyPaymentToInvoice` (server/lib/invoice-payment.ts) com `eventKey` idempotente; todo caminho que estorna/cancela/exclui fatura deve chamar `revertInvoicePayment` + limpar `invoice_billing_items`. Existem DOIS endpoints de exclusão de fatura (DELETE /api/invoices/:id e /api/relatorio-nf/delete-row) — os dois precisam da reversão.

**Why:** review pegou dupla contagem por webhook reenviado e um caminho alternativo de exclusão que deixava OS "PAGA" órfã. O acúmulo de `invoices.valor_recebido` é atômico via RPC `os_fin_registrar_recebimento` (dedup em `os_financeiro_events` por event_key) — nunca fazer read-modify-write no valor_recebido.

**How to apply:** novo gateway/fluxo de pagamento → gerar eventKey estável (gateway:idPagamento:evento[:valor p/ parciais]) e chamar apply; retorno `null` = fatura sem billings (fallback legado de marcar PAGO em massa é permitido só aí). OS só vira PAGO quando alocado ≥ valor do item − 5 centavos; parcial mantém FATURADO. `escort_billings.id` é UUID (TEXT) — nunca BIGINT em tabelas novas que o referenciam.
