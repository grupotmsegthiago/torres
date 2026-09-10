## Relatório de Entrega — Observação da NFS-e (≤250 caracteres)

**Data:** 2026-09-10
**Branch:** `dev`
**Commit(s):** (não commitado nesta sessão)
**Ambiente validado:** [x] local (testes)  [ ] preview  [x] produção (reemissão Asaas pontual #170/#172)
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca realizada: `buildNfseInvoicePayload`, `buildFiscalPayload`, `parseInvoicePeriodInfo`, `fiscalObservations` nos 5 caminhos de `server/asaas.ts`.
- Existente aproveitado: motor Asaas único; Discriminacao continua `nfDiscriminacaoOficial()`; período extraído da descrição da fatura.
- Algo novo criado? [x] Não — função `buildNfseObservations` no mesmo helper (não é segundo motor).

### O que foi alterado
- Observação da NFS-e no modelo do financeiro, parametrizada por valor, período, INSS efetivo (50% da alíquota legal) e ISS 2%, limitada a 250 caracteres.
- Parser de período aceita descrição legado (`Período: dd/mm/aaaa a dd/mm/aaaa — N OS`) sem exigir `(Mês/Ano)`.
- Reemissão Asaas: #170 e #172 (NF anterior já cancelada). #171 permanece `SYNCHRONIZED` (Asaas recusa cancelar).

### O que NÃO foi alterado
- `calcularEscolta`, boletos, Discriminacao municipal, cadastro de cliente, cancelamento de cobrança.
- Sem segundo POST em NF ainda processando (#171).

### Arquivos modificados
- `server/lib/asaas-helpers.ts`, `server/lib/asaas-helpers.test.ts`, `server/asaas.ts`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma (só atualização de `nfse_number`/`nfse_status` das faturas reemitidas)

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts` | 94 pass |
| `npx tsx --test server/lib/asaas-helpers.test.ts server/lib/asaas-nfse-validation.test.ts` | 106 pass (antes do teste extra de período) |

### Resultados (negócio)
A observação da NF deixa de ser o texto jurídico longo e passa a caber no limite de 250 caracteres, com CNAE, período, INSS, Simples e valores. #170 e #172 já foram reenviadas assim no Asaas.

### Regressões verificadas
- Discriminacao continua o CNAE oficial (sem nome do cliente).
- Impostos da NF: INSS 5,5% + ISS 2% `retainIss`.
- Boletos das três faturas não foram reescritos.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter `buildNfseObservations` e voltar a concatenar `buildInssObservation` + Simples longo.

### Deploy
- Healthcheck: N/A nesta sessão
- URL/ambiente: Asaas produção (satélite); UI Torres só após `publicar`

### Evidências
- #170 RFM: `inv_000022722108` AUTHORIZE `SYNCHRONIZED`; obs 244 chars; período 28/07/2026; INSS R$ 188,55; ISS R$ 68,56; líquido R$ 3.171,05.
- #172 OMEGA: `inv_000022722111` AUTHORIZE `SYNCHRONIZED`; obs 244 chars; período 03/09/2026; INSS R$ 32,15; ISS R$ 11,69; líquido R$ 540,66.
- #171 Pacheco: `inv_000022684480` ainda `SYNCHRONIZED` / RPS 296 — Asaas: “Processando emissão e não pode ser cancelada.”

### Pendências
- #171: cancelar no painel Asaas (Notas fiscais) e avisar para recriar com o texto novo.
- Publicar `dev` → `main` para as próximas NFs usarem o modelo na UI/código de produção.

### Gates G1–G16
- [x] N/A justificado — satélite Asaas; Discriminacao oficial preservada; teto 250 testado; sem segundo POST em NF processando.

### Resumo executivo (3 linhas)
1. A observação da NFS-e agora segue o modelo do financeiro, resumida em até 250 caracteres.
2. #170 e #172 foram reemitidas no Asaas com esse texto; os boletos não mudaram.
3. #171 continua na prefeitura; só reemite depois que o Asaas deixar cancelar.
