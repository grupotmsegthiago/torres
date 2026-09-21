---
name: Boleto líquido com retenção de INSS
description: Cliente com retem_inss recebe boleto Asaas LÍQUIDO (bruto − INSS efetivo − ISS se emite NF); NF e invoices.value continuam BRUTOS.
---

# Boleto líquido com retenção de INSS + ISS na NF

Para clientes com `clients.retem_inss = true`, a cobrança Asaas (`POST /payments`) sai pelo valor **LÍQUIDO**. A **NF (`emitNfseImmediate`) e `invoices.value` permanecem BRUTOS**.

Pedido do dono em 2026-09-21 (substitui 5,5% + ISS 2% de 10/09):

- **INSS na NF/boleto:** alíquota legal integral (`INSS_BASE_FRACTION = 1`). Padrão **11% do bruto**. Cadastro `clients.inss_aliquota` continua a alíquota legal.
- **ISS na NF:** **5%** com `retainIss: true`. No boleto, o ISS só entra se `emite_nf` (`boletoRetentionOpts`).

**Cálculo:** `netBoletoValue(gross, boletoRetentionOpts(emiteNf, retemInss, inssAliquota))` em `server/lib/asaas-helpers.ts`. `inssAliquota` de retorno é a **efetiva** (11). `buildNfseInvoicePayload` manda `taxes.inss = 11` e `taxes.iss = 5`.

**How to apply:** os 5 caminhos em `server/asaas.ts`: emitInvoiceAuto, `POST /api/invoices`, split por CNPJ, consolidado gerar-fatura, `POST /api/invoices/:id/emitir`. Persistência: `valor_inss_retido` = valor efetivo; `invoices.inss_aliquota` = efetiva. E-mail mostra bruto / (−) INSS / (−) ISS / líquido.

**Observação da NF (≤250):** `buildNfseObservations` no mesmo helper. Discriminacao = texto CNAE oficial. Não concatenar `buildInssObservation` + Simples longo.

**Consistência:** `invoices.value` BRUTO. Boletos já emitidos com 5,5% / 2% **não** são reescritos automaticamente.
