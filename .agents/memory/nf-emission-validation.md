---
name: NF (Asaas) — validação preventiva de e-mail e captura de erro
description: Padrões invariantes ao mexer em emissão de NFS-e via Asaas (validação pré-Asaas e mensagem de erro).
---

# Emissão de NFS-e (Asaas) — invariantes ao alterar

A NF sai pelo próprio Asaas (não PlugNotas). Há ~7 call-sites de emissão que
chamam `emitNfseImmediate` (auto-aprovação, individual, manual `emit-nfse`,
`resolver-nf-erro`, manual gerar, split, consolidado) e ~4 fluxos de
sync/reconcile que leem o status da NF.

## Regra 1 — validação preventiva de e-mail é por call-site
`emitNfseImmediate` aceita `clientEmail?` e bloqueia ANTES de chamar o Asaas
via `shouldBlockNfEmission` (helper puro em `server/lib/asaas-helpers.ts`).
É **opt-in**: `undefined` = caller legado ⇒ não valida (preserva comportamento).
**Why:** o erro de NF mais comum é e-mail do tomador inválido; falhar cedo com
`MISSING_EMAIL_NF_MSG` evita rejeição muda no Asaas. **How to apply:** qualquer
NOVO call-site de emissão precisa resolver e passar `clientEmail` (senão reabre
o buraco, igual ao padrão de recusada-billing-write-paths). O endpoint manual
`emit-nfse` resolve o e-mail do cliente por `invoice.client_id`.

## Regra 2 — nunca gravar "erro mudo"
Nos fluxos de sync/reconcile, quando a NF está em status de erro, gravar
`nfse_error_message` via `resolveNfErrorMessage(obj, status, existing)`:
prioriza a mensagem concreta do Asaas; se não houver, **preserva** a mensagem
específica já gravada; só cai no genérico (`genericNfErrorMessage`, nunca vazio)
se não houver nada. Limpa para `null` quando o status volta a OK.
**Why:** `extractNfErrorMessage` sozinho tem fallback genérico que sobrescrevia
uma mensagem específica antiga (ex.: "E-mail do cliente incompleto"), perdendo
o detalhe. **How to apply:** em capture sites use `resolveNfErrorMessage`, não
`extractNfErrorMessage` cru.

## Escopo financeiro
Estas mudanças NÃO tocam cálculo de valor de billing (INTOCÁVEL §8). São só
validação + captura de mensagem. Helpers cobertos por
`server/lib/asaas-nfse-validation.test.ts`.

## NF travada em "processando"
AUTHORIZED/SCHEDULED/ERROR sem número municipal **não** é emitida. O Torres deve:
1. `GET /invoices/{inv_id}` se `nfse_number` começa com `inv_`;
2. senão `GET /invoices?payment={asaas_payment_id}`;
3. persistir o `inv_...` até chegar o nº municipal;
4. persistir `statusDescription` do Asaas em `nfse_error_message` quando status = ERROR;
5. cron e Sincronizar **só consultam** (GET). Nunca `POST /invoices/{id}/authorize` nem auto-emit — cada authorize manda e-mail ao cliente. Reprocessar só nos botões emit-nfse / resolver-nf-erro;
6. cron a cada 5 min (`reconcileStuckNfses`) nas faturas em aberto incompletas; full reconcile a cada 15 min;
7. cron **não** auto-emite se a lista vier vazia; emissão só na criação da fatura ou ação explícita;
8. se cobrança em aberto, status processando, >2h e **nenhuma** NFS-e no Asaas → gravar ERRO com motivo visível.

A UI do Relatório de NF mostra o status bruto do Asaas, o motivo e o botão **Sincronizar** por linha (`POST /api/invoices/:id/sync`).

## E-mail Asaas (cliente)
O cliente recebe **um** e-mail na criação da cobrança (`PAYMENT_CREATED`) e o e-mail da NFS-e quando a nota **realmente sai**. Lembretes de vencimento, atraso, atualização, SMS e WhatsApp do Asaas ficam **desligados** (`applyAsaasCustomerEmailPolicy` / `applyAsaasPaymentEmailPolicy`). Reprocessar authorize em NF já AUTHORIZED também disparava e-mail — não fazer isso.

## Vencimento
Alteração **manual** (`[Vencimento alterado`): a data do Torres é a do boleto — grava nos dois lados; se o Asaas recusar, não altera o Torres. O reconcile **empurra** essa data para o Asaas e **não** puxa outra data por cima.
Sem alteração manual: `invoices.due_date` espelha o boleto vivo (`payments.dueDate`).
Data-pura na UI: `formatDateOnlyBR`, nunca `new Date("YYYY-MM-DD")` (recua 1 dia no BRT).
