## Relatório de Entrega — NFS-e retenções INSS 5,5% + ISS 2%

**Data:** 2026-09-10
**Branch:** `dev`
**Commit(s):** (não commitado nesta sessão)
**Ambiente validado:** [x] local (testes)  [ ] preview  [x] produção (reprocesso Asaas pontual)
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca realizada: `netBoletoValue`, `buildNfseInvoicePayload`, `buildFiscalPayload`, 5 caminhos em `server/asaas.ts`.
- Existente aproveitado: motor Asaas único + helpers; cadastro `clients.inss_aliquota` continua legal (11%).
- Algo novo criado? [x] Não — só constantes `INSS_BASE_FRACTION` / `ISS_RETAIN` e ISS 2% no payload já existente.

### O que foi alterado
- NFS-e: `taxes.inss = 5,5` (50% de 11%), `taxes.iss = 2`, `retainIss: true`.
- Boleto novo: líquido = bruto − INSS efetivo − ISS 2% (ISS só se `emite_nf`).
- Cadastro cliente: texto de ajuda da retenção.
- Reprocesso Asaas: #165 recriada com os novos tributos; #170/#171/#172 permanecem na fila da prefeitura (XML antigo).

### O que NÃO foi alterado
- `calcularEscolta`, boletim, ledger, valor bruto da fatura, boletos já emitidos (#170–#172).
- Sem segundo POST em NF `SYNCHRONIZED` (Asaas recusou cancelar: “Processando emissão”).

### Arquivos modificados
- `server/lib/asaas-helpers.ts`, `server/lib/asaas-helpers.test.ts`, `server/asaas.ts`
- `client/src/pages/admin/clients.tsx`
- `.agents/memory/boleto-liquido-inss.md`, `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts server/lib/asaas-nfse-validation.test.ts` | 105 pass |

### Resultados (negócio)
Novas NFS-e retêm 5,5% de INSS e 2% de ISS. A MULTILOG (#165) já foi reenviada assim; OMEGA/Pacheco/RFM continuam na prefeitura com o XML anterior (11% INSS, sem ISS).

### Regressões verificadas
- Sem retenção INSS: boleto permanece bruto; NF ainda retém ISS 2%.
- `emitNfseImmediate` continua recebendo alíquota **legal** (não aplicar 50% duas vezes).

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter constantes `ISS_ALIQUOTA` / `INSS_BASE_FRACTION` / `ISS_RETAIN` nos helpers.

### Deploy
- Healthcheck: n/a — código ainda não publicado.
- URL/ambiente: Asaas produção tocado só nas 4 notas listadas.

### Evidências
| Fatura | Asaas | Tributos |
|--------|--------|----------|
| #172 OMEGA `inv_000022712834` | SYNCHRONIZED, sem nº municipal | inss 11 / iss 0 (fila; cancel recusado) |
| #171 Pacheco `inv_000022684480` RPS 296 | SYNCHRONIZED | idem |
| #170 RFM `inv_000022571641` RPS 295 | SYNCHRONIZED | idem |
| #165 MULTILOG `inv_000022717795` | SYNCHRONIZED, authorize ok | **inss 5,5 / iss 2 / retainIss true** |

### Pendências
- Publicar `dev` → `main` para as **próximas** notas saírem com 5,5% + 2% (pedir `publicar`).
- #170–#172: Asaas recusou cancelar (“Processando emissão”) e recusou POST novo (“Já existe uma nota fiscal agendada para essa cobrança”). Recriar só depois de ERROR/CANCELED no Asaas.
- Boletos já gerados com 11% líquido não foram reescritos.

### Gates G1–G16
- [x] Atendidos / N/A (Asaas satélite, um motor, sem segundo POST em SYNCHRONIZED, sem schema)

### Resumo executivo (3 linhas)
1. A NF passa a reter 50% dos 11% de INSS (5,5%) e 2% de ISS.
2. #165 (MULTILOG) já foi reprocessada com esses tributos.
3. #170–#172 estão na prefeitura e o Asaas não deixa cancelar/alterar o XML agora.
