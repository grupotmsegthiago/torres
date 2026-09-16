---
name: Boleto líquido com retenção de INSS
description: Cliente com retem_inss recebe boleto Asaas LÍQUIDO (bruto − INSS efetivo − ISS se emite NF); NF e invoices.value continuam BRUTOS.
---

# Boleto líquido com retenção de INSS + ISS na NF

Para clientes com `clients.retem_inss = true`, a cobrança Asaas (`POST /payments`) sai pelo valor **LÍQUIDO**. A **NF (`emitNfseImmediate`) e `invoices.value` permanecem BRUTOS**.

Pedido do dono em 2026-09-10 (substitui “não mexer no ISS” de 23/06/2026 e o desconto integral de 11% no boleto):

- **INSS na NF/boleto:** 50% da alíquota legal (`INSS_BASE_FRACTION = 0.5`). Padrão 11% → **5,5% do bruto**. Cadastro `clients.inss_aliquota` continua a alíquota legal.
- **ISS na NF:** **2%** com `retainIss: true`. No boleto, o ISS só entra se `emite_nf` (`retainIss: true` no helper).

**Cálculo:** `netBoletoValue(gross, { retemInss, inssAliquota, retainIss })` em `server/lib/asaas-helpers.ts`. `inssAliquota` de retorno é a **efetiva** (5,5). `buildNfseInvoicePayload` recebe a alíquota **legal** e aplica a fração internamente — não passar 5,5 de novo (dobraria).

**How to apply:** os 5 caminhos em `server/asaas.ts`: emitInvoiceAuto, `POST /api/invoices`, split por CNPJ, consolidado gerar-fatura, `POST /api/invoices/:id/emitir`. Persistência: `valor_inss_retido` = valor efetivo; `invoices.inss_aliquota` = efetiva. E-mail mostra bruto / (−) INSS / (−) ISS / líquido.

**Observação da NF (≤250):** `buildNfseObservations` no mesmo helper. Discriminacao = texto CNAE oficial. Não concatenar `buildInssObservation` + Simples longo.

**Consistência:** `invoices.value` BRUTO. Boletos já emitidos com 11% líquido **não** são reescritos automaticamente.
