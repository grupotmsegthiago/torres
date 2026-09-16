## Relatório de Entrega — NFS-e Asaas `_NFe002` (código municipal)

**Data:** 2026-09-14
**Branch:** `dev`
**Commit(s):** (este ciclo `dev` → `main`)
**Ambiente validado:** [x] local (testes unitários)  [ ] preview  [x] produção (após publicar)
**Publicou?** [x] Sim — fluxo `publicar.ps1` neste pedido

### Reutilização (D11 / P13)
- Busca: FAQ Asaas (Portal Nacional), payload TM SEG `asaasService.ts` (`municipalServiceCode` sem ID), `buildNfseInvoicePayload` / `buildNfsePutPayload` no Torres.
- Aproveitado: motor único `server/lib/asaas-helpers.ts` + `server/asaas.ts`. Sem PlugNotas, sem segundo motor, sem copiar CNAE/07930 da TM.
- Algo novo criado? [x] Não — correção do payload existente. `municipalServiceNameOficial()` só formata o nome no padrão TM.

### ★ Problema
Painel Asaas: “Retorno do portal nacional: Código: `_NFe002`. O Código de Serviço municipal deve ser informado para a emissão da Nota Fiscal”. Na TM SEG a nota sai; na Torres não.

### ★ Causa raiz
A conta Torres usa o **Portal Nacional**. A documentação Asaas (FAQ de notas) manda informar `municipalServiceCode` e **não** usar `municipalServiceId`. A TM SEG envia só o código (`07930`) + nome `"07930 - …"`.

O Torres enviava **os dois**: código `07870` **e** `municipalServiceId` 402 (default + env). Com ID preenchido, o portal trata o código como vazio → `_NFe002`. Código da Torres continua **07870** (CNAE 7870 / vigilância); 07930 da TM é outro serviço (monitoramento/intermediação).

### O que foi alterado
- Payload padrão: `municipalServiceCode: "07870"`, `municipalServiceName: "07870 - Vigilância…"`, `municipalServiceId: null` (PUT também, para limpar ID antigo nas `inv_*` em ERROR).
- `ASAAS_MUNICIPAL_SERVICE_ID` no ambiente é **ignorada** (log de aviso). Se a Vercel ainda tiver `402`, deixa de quebrar.
- Discriminação (`serviceDescription`) permanece o texto CNAE **sem** o código (evita `_NFe003`).

### O que NÃO foi alterado
- `calcularEscolta`, boletim, ledger, valor da NF, ISS/INSS, fluxo isolado de emissão.
- Código municipal 07870 (não copiar 07930).
- `effectiveDatePeriod` da TM (fica para outro ciclo).

### Tipo do dado
- Espelho/satélite Asaas. Fato da missão intocado.

### Arquivos modificados
- `server/lib/asaas-helpers.ts`
- `server/lib/asaas-helpers.test.ts`
- `server/asaas.ts`
- `.agents/memory/nf-emission-validation.md`
- `.agents/memory/MEMORY.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts` | **98/98** pass |

### Resultados (negócio)
Novas NFS-e e retry PUT das notas em ERROR (`_NFe002`, ex. #171) passam o código municipal que o portal exige. Faturas só com “falha ao comunicar” (#170/#172) continuam retry de transporte na mesma `inv_*`.

### Regressões verificadas
- Override explícito `municipalServiceIdOverride` ainda envia o ID (cidades com lista).
- Discriminação sem prefixo numérico.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter os arquivos acima.

### Deploy
- Só após pedido explícito de publicação (`publicar.ps1`).

### Pendências
- Reprocessar no Asaas as notas em ERROR `_NFe002` (#165, #170, #171, #172) após o deploy — neste mesmo pedido.
- CCM da empresa em MULTILOG antigo (#50/#54/#59/#60) continua recusa cadastral no painel, não é este bug.

### Gates G1–G16
- [x] Atendidos / N/A — satélite Asaas; sem mudança de valor de billing; testes de helper; rollback = revert.

### Resumo executivo
1. `_NFe002` não é “código errado”: o Portal Nacional não recebia o código porque o Torres mandava o ID interno 402.
2. A TM emite porque manda só o código; a Torres passa a fazer o mesmo com **07870**.
3. Só entra no ar depois de publicar; depois disso, reprocessar as NFs em erro no Asaas.
