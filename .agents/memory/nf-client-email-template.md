---
name: E-mail padrão de NF ao cliente (Escolta Armada)
description: Qual função monta o e-mail de NF ao cliente, quando dispara, e o trade-off da chave PIX estática.
---

# E-mail padrão de NF de Escolta Armada ao cliente

O e-mail que vai ao cliente "na aprovação/envio da NF" é o mesmo `sendBillingEmail`
(server/asaas.ts) — NÃO existe um e-mail separado de "aprovação de NF". Ele dispara
**somente após anexar a NF** (política existente: `attach-nf` quando `!email_sent`,
e o endpoint manual `resend-email`). O conteúdo é montado pela função pura
`buildNfClientEmail` em `server/lib/asaas-helpers.ts` (testável, sem SMTP).

O modelo do financeiro (Beatriz, jun/2026) define os campos fixos: Competência,
Data de Execução, Nº da Nota Fiscal, "Serviço Prestado: Escolta Armada", Valor Total,
opções Boleto Bancário **ou** PIX (chave aleatória) e o fecho "Permanecemos à
disposição...". Competência/Data de Execução são extraídas da descrição da fatura
(`parseInvoicePeriodInfo`), que segue o formato fixo de `buildInvoiceDescription`.

**PIX = copia-e-cola DINÂMICO do Asaas (baixa automática).** O e-mail mostra
`invoice.pix_copia_e_cola` (código dinâmico da cobrança Asaas), NÃO a chave aleatória
estática. **Por quê:** o dono reverteu a chave estática (23/06/2026) — pagamento na
chave estática vira "PIX órfão" (baixa manual); o copia-e-cola dinâmico carrega
identificador/valor e **reconcilia automático**, igual ao boleto. Quando a fatura não
tem `pix_copia_e_cola`, a seção PIX é omitida (fica só o Boleto). A const
`EMPRESA_PIX_ALEATORIA` ainda existe no código mas NÃO é usada no e-mail.

**How to apply:** mudou o texto/campos do e-mail ao cliente? Edite `buildNfClientEmail`
e os testes em `asaas-helpers.test.ts`. Não recalcular billing aqui — é só e-mail
(regras §8 INTOCÁVEIS não são tocadas).
