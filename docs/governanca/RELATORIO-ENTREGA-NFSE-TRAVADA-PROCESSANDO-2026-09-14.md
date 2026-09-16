## Relatório de Entrega — NFS-e Asaas travada em processamento

**Data:** 2026-09-14
**Branch:** `dev`
**Commit(s):** (pendente até o proprietário pedir commit/publicação)
**Ambiente validado:** [x] local (testes unitários)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `emitNfseImmediate`, `enqueueIsolatedNfse`, `retryNfseForInvoice`, `reconcileStuckNfses`, `POST /api/nf/retry/:invoiceId`, `classifyIssuedOrProcessing`, `shouldNudgeNfseAuthorize`.
- Aproveitado: motor único `server/asaas.ts` + `server/lib/asaas-helpers.ts`. Sem segundo POST de NF. Sem PlugNotas.
- Algo novo criado? [x] Não — extensão do fluxo isolado que já existia.

### ★ Problema
A NFS-e via Asaas não concluía. A tela ficava em “processando / na prefeitura” e a nota não saía.

### ★ Causa raiz (produção, leitura 2026-09-14)
Faturas abertas com `emite_nf`:
- #172 OMEGA e #170 RFM: `ERROR` + `inv_*` + “Falha ao comunicar com o sistema da prefeitura”.
- #171 Pacheco: `ERROR` + `_NFe002` “Código de Serviço municipal deve ser informado”.
- Worker isolado usava `setTimeout(400ms)` (Vercel mata após o response), timeout Asaas 8s abortava `POST /invoices`, PROCESSING local escondia o botão Emitir, e SYNCHRONIZED com falha de portal não chamava `/authorize`.

### O que foi alterado
- `await emitIsolatedNfse` na mesma isolate do boleto (não `setTimeout`).
- Timeout Asaas `/invoices` 45s; demais 20s.
- `municipalServiceId` 402 padrão (código 07870).
- `effectiveDate` em data civil BRT.
- Authorize na mesma `inv_*` sem segundo POST; nudge também em “falha ao comunicar” e `_NFe002`.
- Cron NF primeiro no bucket de 5 min.
- UI: PROCESSING sem `inv_*` não é fila da prefeitura.

### O que NÃO foi alterado
- `calcularEscolta`, boletim aprovado, ledger, valor bruto da NF, boleto líquido, código municipal `07870`.
- Webhook de pagamento continua só baixa.
- TM SEG: zero diff. Sem publicação.

### Arquivos modificados
- `shared/nfse-status.ts`
- `server/lib/asaas-helpers.ts`
- `server/lib/asaas-helpers.test.ts`
- `server/asaas.ts`
- `server/cron-buckets.ts`
- `client/src/pages/admin/faturas.tsx`
- `.agents/memory/nf-emission-validation.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts server/lib/asaas-nfse-validation.test.ts` | **112/112** pass |

### Resultados (negócio)
Novas cobranças com `emite_nf` passam a chamar `POST /invoices` de fato. #170/#172 voltam a tentar a mesma `inv_*` (transporte). #171 reenvia o código municipal 07870/402 na mesma nota. MULTILOG (#165) continua recusa de CCM da **empresa** no painel Asaas — código não resolve.

### Riscos
- Authorize em SYNCHRONIZED pode retornar erro inócuo do Asaas (já é non-blocking).
- Sem publicação, produção continua com o travamento.
- Painel fiscal Asaas (CCM da empresa, certificado, login CCM) continua obrigatório.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter os arquivos acima.

### Gates G1–G16
- [x] Atendidos / N/A — satélite Asaas; sem mudança de valor de billing; testes de helper; rollback = revert.

### Resumo executivo
1. A NFS-e não ia ao Asaas (timeout + setTimeout no Vercel) e a tela fingia que já estava na prefeitura.
2. O código agora emite na mesma request do boleto, com o serviço 07870/402, e reprocessa falha de portal na mesma `inv_*`.
3. Só entra no ar depois de publicar.
