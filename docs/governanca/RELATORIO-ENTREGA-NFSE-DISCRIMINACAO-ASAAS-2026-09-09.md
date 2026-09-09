## Relatório de Entrega — NFS-e alinhada à TM SEG (Discriminacao + poll)

**Data:** 2026-09-09
**Branch:** `dev`
**Commit(s):** pendente (não publicado)
**Ambiente validado:** [x] local (testes)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `emitNfseImmediate`, `buildNfseInvoicePayload`, `canReemitNfse`, `reconcileStuckNfses`, `collectNfseSyncUpdates`, Relatório de NFs.
- Existente aproveitado: motor Asaas em `server/asaas.ts` + helpers em `server/lib/asaas-helpers.ts`; tela `relatorio-nf.tsx` (Sincronizar / Resolver agora / badges).
- Algo novo criado? [x] Não  [ ] Sim — inviabilidade: estendidos helpers e o emit/retry já existentes. Sem tabela, API ou motor novos.

### O que foi alterado
- Discriminacao (`serviceDescription`) sempre = texto CNAE oficial sanitizado. Descrição da fatura (cliente/período) vai para `observations`.
- Re-emissão em ERROR: `PUT /invoices/{inv_*}` + `authorize` (Asaas só permite PUT em SCHEDULED/ERROR).
- Cron stuck: catch-up só para erro de schema Discriminacao + `clients.emite_nf=true`.

### O que NÃO foi alterado
- Motor `calcularEscolta`, boletim aprovado, ledger, `emite_nf=false` (não emite).
- Poll de NF processando (não reenvia emissão).
- UI do Relatório de NFs (já espelhava TM SEG).

### Arquivos modificados
- `server/lib/asaas-helpers.ts`
- `server/lib/asaas-helpers.test.ts`
- `server/asaas.ts`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts server/lib/asaas-nfse-validation.test.ts` | 91 pass / 0 fail |

### Resultados (negócio)
FAT com Discriminacao inválida (ex. #170) passa a ser corrigida e reautorizada na mesma nota Asaas; FAT processando (#171) continua só consulta até o número municipal; clientes sem `emite_nf` não recebem NF.

### Regressões verificadas
- `canReemitNfse` / `shouldNudgeNfseAuthorize` / `shouldAutoEmitMissingNfse` inalterados no sentido: cron genérico ainda não cria NFS-e nem autoriza SYNCHRONIZED.
- Catch-up Discriminacao é caminho explícito e filtrado (não cobre inscrição municipal da empresa).

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter os 3 arquivos de código na `dev`.

### Deploy
- Healthcheck: n/a (não publicado)
- URL/ambiente: n/a

### Evidências (produção TORRES `erjhxwbutjyylxdthuuz`, leitura)
| Fatura | Cliente | Situação | Ação |
|--------|---------|----------|------|
| #171 | TRANSPACHECO | SYNCHRONIZED, sem nº ~processando | Só Sincronizar / cron poll |
| #170 | R.F.M. LOGISTICA | ERROR Discriminacao (`Escolta Armada — …`) | PUT+authorize após deploy |
| #59, #54, #50 | MULTILOG | ERROR inscrição municipal da **empresa** no Asaas | Cadastro Asaas → Notas Fiscais → Informações Fiscais; depois Resolver agora |
| demais SEM_NF | TM SEG, NEW CONTAINERS, LEILO, etc. | `emite_nf=false` | Não emitir |

### Pendências
- Publicar (`publicar.ps1`) para o catch-up de #170 rodar em produção.
- Corrigir CCM/inscrição municipal da conta Asaas (MULTILOG).
- FAT #171: aguardar prefeitura; se passar de ~2h sem número, o fluxo de stale já existente marca acompanhamento.

### Gates G1–G16
- [x] Atendidos / N/A justificado (sem schema, sem novo motor, fail-closed em `emite_nf`, sem duplicar POST /invoices)

### Resumo executivo (3 linhas)
1. A prefeitura de SP rejeitava a Discriminacao quando o Torres mandava o nome do cliente com travessão.
2. A emissão passou a usar o texto oficial do serviço; erro desse tipo reusa a nota Asaas em vez de criar outra.
3. NF em processamento continua só consulta; inscrição municipal da empresa e clientes sem flag de NF não são auto-emitidos.
