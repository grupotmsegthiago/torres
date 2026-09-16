## Relatório de Entrega — NF e boleto Asaas (SYNCHRONIZED, PIX, e-mail)

**Data:** 2026-09-10
**Branch:** `dev`
**Commit(s):** (pendente)
**Ambiente validado:** [x] local (testes + leitura Asaas/produção)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `emitNfseImmediate`, `emitInvoiceAuto`, `POST /payments`, `applyAsaasPaymentEmailPolicy`, `classifyIssuedOrProcessing`, Relatório de NFs, tela Faturas, `pix_copia_e_cola`.
- Aproveitado: motor único `server/asaas.ts` + helpers; `classifyIssuedOrProcessing` extraído para `shared/nfse-status.ts` (mesmo critério do Relatório de NFs).
- Algo novo criado? [x] Não — extensão dos caminhos já existentes. Sem tabela, API ou motor novos.

### O que foi alterado
1. UI Faturas: `SYNCHRONIZED`/`AUTHORIZED` sem nº municipal deixa de aparecer como “NFS-e emitida”. Passa a “Na prefeitura”.
2. Cobrança Asaas: `notificationDisabled: false` no boleto; política de e-mail cai no customer quando `GET /payments/{id}/notifications` dá 404.
3. PIX do boleto: `GET /pixQrCode` em todos os caminhos de criação + backfill no reconcile/`/sync`.
4. Webhook NFS-e usa `nfseUpdatesFromAsaasObject` (mesmo critério do sync).

### O que NÃO foi alterado
- `calcularEscolta`, boletim aprovado, ledger, valor bruto da NF, boleto líquido com INSS.
- Emissão imediata da NFS-e (`emitNfseImmediate`); cron continua só consultando.
- TM SEG: zero diff. Sem publicação.

### Arquivos modificados
- `shared/nfse-status.ts`
- `server/lib/asaas-helpers.ts`
- `server/lib/asaas-helpers.test.ts`
- `server/asaas.ts`
- `client/src/pages/admin/faturas.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- `.agents/memory/nf-emission-validation.md`
- este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts` | **104/104** pass |
| `npx tsx --test server/lib/asaas-nfse-validation.test.ts` | **14/14** pass |

### Resultados (negócio)
A tela deixa de marcar NF como emitida enquanto a prefeitura não devolve o número. O boleto passa a poder disparar o e-mail `PAYMENT_CREATED` do Asaas e o PIX copia-e-cola entra na fatura mesmo quando o tipo é BOLETO.

### Evidências (produção TORRES, leitura 2026-09-10)
| Fatura | Situação Asaas | Ação |
|--------|----------------|------|
| #172 OMEGA | Boleto R$ 520,20 OK; NF SYNCHRONIZED sem RPS (oficial 07870/402) | Esperar prefeitura; Sincronizar |
| #171 Pacheco | Boleto OK; NF SYNCHRONIZED **RPS 296** | Só poll |
| #170 RFM | Boleto OK; NF SYNCHRONIZED **RPS 295**; tomador e-mail Torres | Só poll; corrigir e-mail financeiro do cadastro |
| #165 MULTILOG | NF CANCELED (CCM empresa); boleto PENDING vencido | Resolver após conferir Informações Fiscais no Asaas |

### Pendências
- Publicar só se o dono pedir.
- FAT 170/171/172: não clicar Emitir; Sincronizar até sair o nº.
- RFM: `email_financeiro` está `escolta@torresseguranca.com.br` — a NF iria para a Torres.
- MULTILOG: `inscricao_municipal=ISENTO` no tomador; NF cancelada.

### Gates G1–G16
- [x] Atendidos / N/A (sem schema, sem segundo motor, Asaas satélite, sem segundo POST de NF)

### Resumo executivo
1. O boleto já nascia no Asaas; o Torres tratava NFS-e `SYNCHRONIZED` como emitida e não gravava o PIX nem liberava o e-mail da cobrança.
2. A tela agora mostra fila da prefeitura até existir número municipal.
3. Novas cobranças enviam o e-mail de boleto do Asaas e gravam o PIX; o cron completa as faturas já abertas.
