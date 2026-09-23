---
name: Boleto líquido com retenção de INSS
description: Cliente com retem_inss (ou emite_nf) recebe boleto Asaas LÍQUIDO (bruto − INSS); ISS retido desligado (ISS_RETAIN=false). NF e invoices.value continuam BRUTOS.
---

# Boleto líquido com retenção de INSS (sem ISS retido)

Para clientes com `clients.retem_inss = true` ou `emite_nf`, a cobrança Asaas (`POST /payments`) sai pelo valor **LÍQUIDO**. A **NF Focus e `invoices.value` permanecem BRUTOS**.

Pedido do dono em 2026-09-23: **desligar retenção de ISS 5%** na Focus e no boleto Asaas.

- **INSS na NF/boleto:** alíquota legal integral (`INSS_BASE_FRACTION = 1`). Padrão **11% do bruto** quando emite NF. Cadastro `clients.inss_aliquota` continua a alíquota legal.
- **ISS:** `ISS_RETAIN = false`. Focus manda `iss_retido: false` (sem `valor_iss_retido`). Boleto **não** desconta ISS (`boletoRetentionOpts.retainIss = false`).

**Cálculo:** `netBoletoValue(gross, boletoRetentionOpts(emiteNf, retemInss, inssAliquota))` em `server/lib/asaas-helpers.ts`.

**How to apply:** os 5 caminhos em `server/asaas.ts`. E-mail/relatório mostram ISS só se houver valor retido persistido (legado).

**Consistência:** `invoices.value` BRUTO. Boletos já emitidos com ISS descontado **não** são reescritos automaticamente.
