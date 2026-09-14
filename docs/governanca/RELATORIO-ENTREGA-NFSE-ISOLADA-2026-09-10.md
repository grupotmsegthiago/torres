## Relatório de Entrega — NFS-e isolada via Asaas (espelho operacional TM SEG)

**Data:** 2026-09-10
**Branch:** `dev`
**Commit(s):** (pendente até o proprietário pedir commit/publicação)
**Ambiente validado:** [x] local (testes unitários)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca realizada: `emitNfseImmediate`, `enqueueIsolatedNfse`, `reconcileStuckNfses`, `POST /api/invoices/:id/emit-nfse`, webhook Asaas, `calcularEscolta`.
- Existente aproveitado: motor oficial `server/asaas.ts` + `server/lib/asaas-helpers.ts`. Cinco caminhos de cobrança já existentes (auto, POST `/api/invoices`, `/emitir`, split, consolidado). Cron `five-min` / `runStuckNfCron`.
- Algo novo criado? [x] Sim — inviabilidade: TM exige rota de kick `POST /api/nf/retry/:invoiceId` e fila isolada. **Não** foi criado `POST /api/asaas/create-charge` (handler paralelo). **Não** foram copiados CNPJ, chaves, CNAE nem código municipal da TM.

### O que foi alterado
- Cobrança grava `nfse_status=PROCESSING` e **não** chama `POST /invoices` na mesma request.
- Worker `retryNfseForInvoice` + fila `runIsolatedNfRetryQueue` no cron de 5 min.
- Kick frontend após gerar/emitir fatura.
- Bloqueio de endereço fiscal incompleto quando `emite_nf`.
- Timeout 8s e chave Asaas lida em runtime (`ASAAS_API_KEY` / `ASAAS_TORRES_API` / `ASAAS_API_KEY_TORRES`).

### O que NÃO foi alterado
- Motor `calcularEscolta`. Valor bruto da NF / boleto líquido / ISS 2% / INSS efetivo 5,5%.
- Código municipal Torres `07870` + CNAE `7870`. Sem Amazon/CEVA, sem `07930`, sem PlugNotas como caminho principal.
- Webhook de pagamento continua só baixa; INVOICE_* só espelha status.
- Boletos existentes não foram recriados.

### Arquivos modificados
- `server/asaas.ts`
- `server/lib/asaas-helpers.ts`
- `server/lib/asaas-helpers.test.ts`
- `client/src/lib/queryClient.ts`
- `client/src/pages/admin/faturas.tsx`
- `client/src/pages/admin/relatorio-nf.tsx`
- `client/src/pages/admin/relatorio-faturamento.tsx`
- `client/src/pages/admin/boletim-medicao.tsx`
- `.agents/memory/nf-emission-validation.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts server/lib/asaas-nfse-validation.test.ts` | pass (109) |

### Resultados (negócio)
A NFS-e passa a ser emitida **depois** do boleto, na mesma fila da TM: kick + worker + cron. Se a Prefeitura falhar na comunicação, o cron reprocessa a mesma `inv_*` sem criar segunda nota.

### Regressões verificadas
- Sem POST duplicado em `SYNCHRONIZED` com RPS.
- Cliente `emite_nf=false` continua só cobrança.
- Webhook de pagamento não dispara NF.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não (webhook de pagamento inalterado; retry exige `requireFinanceiro`)

### Backup / ponto de restauração
- Reverter os arquivos acima. Faturas já em PROCESSING continuam consultáveis via `/sync`.

### Deploy
- Healthcheck: após publicar, gerar uma fatura de cliente com `emite_nf` e conferir `POST /invoices` no log `[nf-retry]`.
- URL/ambiente: produção só com pedido explícito.

### Evidências
- Painel Asaas (Inscrição Municipal, CNAE, certificado, login CCM) continua **obrigatório**. Código sozinho não emite NF se o painel fiscal falhar.
- Prompt mestre da TM chegou truncado em §5.2.3 (idempotência 2h). Não foram inventados PlugNotas, lista LC 116 da TM nem `POST /api/asaas/create-charge`.

### Pendências
- Checklist do painel Asaas da conta Torres (produção, CCM, certificado, `GET /invoices/municipalServices` com `07870`).
- Fatura #171 (Pacheco) continua com NFS-e antiga `SYNCHRONIZED` / INSS 11% até cancelamento no painel Asaas.
- Idempotência 2h da TM (reutilizar `asaas_payment_id`) não implementada — prompt incompleto; decidir com o proprietário.

### Gates G1–G16
- [x] Atendidos / N/A justificado — sem mudança de valor de billing; satélite Asaas; testes de helper; sem secrets; rollback = revert dos arquivos.

### Resumo executivo (3 linhas)
1. Boleto primeiro; NFS-e na fila (kick + cron), como na TM.
2. Sem fluxo paralelo e sem dados fiscais da TM.
3. Sem painel fiscal Asaas ok, a Prefeitura continua recusando — o código agora pelo menos **chama** `POST /invoices`.
