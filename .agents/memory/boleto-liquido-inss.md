---
name: Boleto líquido com retenção de INSS
description: Cliente com retem_inss recebe boleto Asaas LÍQUIDO (bruto − INSS); NF e invoices.value continuam BRUTOS.
---

# Boleto líquido com retenção de INSS

Para clientes com `clients.retem_inss = true`, a cobrança Asaas (`POST /payments`) deve sair pelo valor **LÍQUIDO** = bruto − INSS retido. A **NF (`emitNfseImmediate`) e `invoices.value` permanecem BRUTOS** (regra fiscal: NF sempre cheia; quem retém é o tomador).

**Cálculo:** helper `netBoletoValue(gross, { retemInss, inssAliquota })` em `server/lib/asaas-helpers.ts` → `{ boleto, inssValor, inssAliquota }`. `inssValor = round(gross*aliquota/100, 2)`, `boleto = round(gross − inssValor, 2)`. Alíquota default = 11.

**Why:** o tomador (cliente) recolhe o INSS direto à Receita; se o boleto cobrasse o bruto, a Torres receberia a mais e haveria acerto manual. NF bruta é exigência fiscal — não pode ser reduzida.

**How to apply:** TODO endpoint que cria cobrança Asaas e seja para cliente que possa reter INSS precisa: (1) carregar `retem_inss`/`inss_aliquota` do cliente; (2) `payment.value = netBoletoValue(...).boleto`; (3) NF e `invoices.value` com o BRUTO; (4) persistir `valor_inss_retido`/`inss_aliquota` na invoice; (5) `fiscalObservations` com `buildInssObservation(...)`. São **5** caminhos em `server/asaas.ts`: emitInvoiceAuto, `POST /api/invoices`, split por CNPJ, consolidado gerar-fatura, e `POST /api/invoices/:id/emitir` (esse último foi o que ficou esquecido na 1ª passada — sempre conferir todos). E-mail `sendBillingEmail` mostra bruto / (−) INSS / líquido quando há retenção.

**Consistência:** manter `invoices.value` BRUTO é proposital — `autoLinkOrphanBillingsForInvoice` casa `invoice.value` com a soma de billings brutos (tol. 2%); reconcile de PIX órfão usa `livePayment.value` (líquido) só para casar pagamentos por valor.
