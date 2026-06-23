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

**Trade-off da chave PIX estática (decisão de negócio do financeiro):**
o e-mail mostra a chave PIX aleatória da empresa (`EMPRESA_PIX_ALEATORIA`) em vez do
`pix_copia_e_cola` dinâmico do Asaas. Pagamento nessa chave **não** carrega
identificador/valor da cobrança ⇒ vira "PIX órfão" e exige baixa manual
(reconciliação já existe em asaas.ts, mas não é automática como no boleto/PIX Asaas).
**Por quê:** foi o modelo explícito enviado pelo financeiro. Quem paga via Boleto
(link Asaas) ainda concilia automático.

**How to apply:** mudou o texto/campos do e-mail ao cliente? Edite `buildNfClientEmail`
e os testes em `asaas-helpers.test.ts`. Não recalcular billing aqui — é só e-mail
(regras §8 INTOCÁVEIS não são tocadas).
