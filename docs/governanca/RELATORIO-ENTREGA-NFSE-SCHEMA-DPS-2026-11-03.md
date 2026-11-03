## Relatório de Entrega — Sefin recusou a DPS da fatura 241

**Data:** 2026-11-03
**Branch:** `cursor/nfse-schema-dps-b534`
**Commit(s):** ver o commit desta entrega
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [ ] Não  [x] Sim, se o fluxo de publicação desta entrega tiver concluído

### Reutilização (D11 / P13)
- Busca realizada: `buildFocusNfsePayload`, campos oficiais da Focus (`cep_prestador`, `logradouro_prestador`, `indicador_total_tributacao`) e o endereço já impresso no boletim.
- Existente aproveitado: o mesmo montador da DPS e o endereço da Torres em `server/generate-boletim-omega.ts`.
- Algo novo criado? [x] Não

### Domínio e tipo do dado
- Domínio: faturamento / NFS-e (satélite Focus).
- Tipo: payload de emissão. Não altera fatura, boleto, ledger nem balanço.

### O que foi alterado
- A DPS passa a levar CEP, logradouro, número e bairro da Torres.
- O código Paulistana de 5 dígitos deixa de ir no campo municipal da nota nacional.
- A nota informa que não há estimativa de tributos, em vez de omitir o grupo obrigatório.

### O que NÃO foi alterado
- Boleto Asaas, descrição comercial da fatura, motor `calcularEscolta`, valor da nota e retenção de INSS.
- Cadastro do cliente TM Segurança. O endereço do tomador já estava completo.

### Arquivos modificados
- `server/lib/focus-nfe-helpers.ts`
- `server/lib/focus-nfe-helpers.test.ts`
- `shared/nfse-descricao.ts`
- `.agents/memory/focus-nfe-satelite.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/focus-nfe-helpers.test.ts` | 28 pass |

### Resultados (negócio)
- A fatura 241 foi recusada pela Sefin com quatro erros de schema. Esta entrega cobre os quatro no payload.
- A alíquota cheia do Simples Nacional não está no sistema. A nota declara que não informa a estimativa. Se a Sefin exigir o percentual do Simples, o contador precisa informar o número antes de gravarmos isso na nota.

### Risco
- O CEP da Torres começa com zero. O campo vai como texto de 8 dígitos. Se a Focus converter para número e cortar o zero, a Sefin recusa de novo.
- Sem o percentual oficial do Simples, a nota não declara a alíquota cheia.

### Rollback
- Reverter o commit desta entrega. A emissão volta ao payload anterior, que a Sefin já recusou.
