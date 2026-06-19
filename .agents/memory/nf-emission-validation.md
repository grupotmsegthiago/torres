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
