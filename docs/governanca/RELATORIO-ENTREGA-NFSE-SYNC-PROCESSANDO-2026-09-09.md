## Relatório de Entrega — CCM tomador + botões Atualizar/Sincronizar

**Data:** 2026-09-09
**Branch:** `dev`
**Commit(s):** (pendente — não publicado)
**Ambiente validado:** [x] local (testes)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `findOrCreateAsaasCustomer` (municipalInscription só se vazio), `/sync`, `reconcileInvoiceFromAsaas`, Relatório de NFs, cadastro `clients.inscricao_municipal`.
- Aproveitado: mesmo customer Asaas, mesmos botões, helper novo no módulo `asaas-helpers`.
- Algo novo criado? [x] Não — extensão do PUT customer já existente.

### O que foi alterado
1. `municipalInscriptionIfChanged`: envia CCM ao Asaas se o cadastro Torres diferir (não só se vazio).
2. `/sync` e reconcile: PUT `customers/{id}` com CCM; mensagem de espera inclui RPS; toast explica que não reemite.
3. UI: tooltips Atualizar = reload Torres; Sincronizar = consulta Asaas. Cadastro: placeholder deixa de parecer “nº da NF”.

### O que NÃO foi alterado
- Sem segundo POST `/invoices` nas #170/#171. Sem gravar 07930 em `invoices.nfse_number`. Código serviço 07870. TM SEG: zero diff. Sem publicação.

### Arquivos modificados
- `server/lib/asaas-helpers.ts`
- `server/lib/asaas-helpers.test.ts`
- `server/asaas.ts`
- `client/src/pages/admin/relatorio-nf.tsx`
- `client/src/pages/admin/clients.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- `.agents/memory/nfse-discriminacao-asaas.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando | Resultado |
|---------|-----------|
| `node --test server/lib/asaas-helpers.test.ts` | **90/90** pass |

### Resultados (negócio)
Salvar 07930 no Pacheco atualiza o tomador Asaas no Sincronizar; a NFS-e já na fila da prefeitura continua só esperando o nº municipal (tipo 309), não o CCM.

### Pendências
- Publicar só se o dono pedir. Produção ainda não tem este código.
- #170/#171: não Emitir; fila da prefeitura.

---

## Relatório de Entrega — NFS-e lacunas #171 / #170

**Data:** 2026-09-09
**Branch:** `dev`
**Commit(s):** (pendente — não publicado)
**Ambiente validado:** [x] local (testes)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `nfseUpdatesFromAsaasObject`, `emitNfseImmediate`, `retryDiscriminacaoErrorNfses`, `/sync`, `nfReconcileState`.
- Aproveitado: motor Asaas único; Discriminacao oficial já em `buildNfseInvoicePayload`.
- Removido: cancel+POST automático (segunda NF).
- Algo novo criado? [x] Não — só helpers no mesmo módulo.

### O que foi alterado
1. `isHiddenDiscriminacaoRejection`: SYNCHRONIZED/AUTHORIZED, sem RPS, sem nº municipal, Discriminacao ≠ CNAE oficial → `ERROR` local + texto para cancelar no painel.
2. Número municipal via `extractAsaasMunicipalNumber` (`number` / `nfeNumber`; RPS não conta).
3. `/sync` só grava `updated_at` se houver mudança material.
4. `unstickStaleNfReconcile` (3 min) no relatório e no reconcile-status.
5. PUT na mesma `inv_*` se ERROR ou SCHEDULED com texto antigo. Emitir/Resolver em SYNCHRONIZED escondido → 409, sem segundo POST. #170 (oficial+RPS) só poll.

### O que NÃO foi alterado
- `calcularEscolta`, boletim, ledger, `emite_nf=false`, payments, código 07870 / id 402.
- TM SEG: zero diff.
- Sem publicação.

### Arquivos modificados
- `server/lib/asaas-helpers.ts`
- `server/lib/asaas-helpers.test.ts`
- `server/asaas.ts`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- `.agents/memory/nfse-discriminacao-asaas.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando | Resultado |
|---------|-----------|
| `node --test server/lib/asaas-helpers.test.ts` | **89/89** pass |

### Resultados (negócio)
#171 deixa de parecer “fila”: vira erro e pede cancel no Asaas. #170 continua só consultando até sair o número. Nenhuma segunda NFS-e na mesma cobrança.

### Pendências
- Publicar só se o dono pedir.
- #171: cancelar `inv_000022684480` no painel Asaas; depois Resolver (PUT quando ERROR, ou POST só se já cancelada).
- #170: não cancelar.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS? [x] Não

### Gates
- G1 reutilização; G2 Asaas satélite / `invoices.nfse_*` espelho; G3 um motor; G4 sem segundo POST em SYNCHRONIZED.

### Resumo executivo
1. #171 = rejeição escondida (sem RPS + Discriminacao antiga).
2. #170 = fila real (RPS 295 + texto oficial).
3. Código na `dev` local; produção só após publicar.
