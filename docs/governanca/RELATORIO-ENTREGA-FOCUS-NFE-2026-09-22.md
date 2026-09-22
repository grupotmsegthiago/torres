## Relatório de Entrega — NFS-e Focus NFe (substitui emissão Asaas)

**Data:** 2026-09-22
**Branch:** dev
**Commit(s):** (pendente de commit pelo proprietário)
**Ambiente validado:** [x] local (testes unitários)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `invoices`, `emit-nfse`, `emitNfseImmediate`, `nfse_status`, Edge Functions, Focus NFe.
- Existente aproveitado: tabela `invoices` (SSOT cobrança/NF); rotas `/api/invoices/:id/emit-nfse`, `/sync`, `/cancel-nfse`, `/api/nf/retry`; motor `calcularEscolta` intacto; discriminacao/ISS/INSS de `asaas-helpers.ts`; UI Faturas.
- Algo novo criado? [x] Sim — inviabilidade: a API Focus NFe não existe no Torres; Asaas `/invoices` não emite Nota Paulistana fora do painel Asaas. Edge Function foi recusada: o backend oficial é Express com `requireAdminRole` / `requireFinanceiro`.

### O que foi alterado
- Satélite Focus NFe (homologação por padrão; produção só com `FOCUS_NFE_ENV=producao`).
- Novas emissões de NFS-e saem pela Focus. Documentos Asaas `inv_*` vivos continuam no Asaas (anti-duplicidade).
- Boleto/PIX/baixa permanecem no Asaas.

### O que NÃO foi alterado
- `calcularEscolta`, boletim aprovado, valor da invoice, ledger, Inter (off).
- Telas fora de Faturas/cadastro de cliente (texto fiscal).

### Arquivos modificados
- `server/lib/focus-nfe-helpers.ts`, `focus-nfe.ts`, testes
- `server/asaas.ts`, `create-app.ts`, `db-init.ts`, `shared/nfse-status.ts`, `shared/schema.ts`
- `client/src/pages/admin/faturas.tsx`, `clients.tsx`
- `supabase/migrations/20260922140000_invoices_focus_nfe.sql`

### Banco / migrations
- [x] Sim: colunas `nfse_ref`, `nfse_codigo_verificacao`, `nfse_xml_path`, `nfse_provider` em `invoices` (PK integer preservada). Sem tabela nova.

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `node --import tsx --test server/lib/focus-nfe-helpers.test.ts server/lib/asaas-helpers.test.ts` | 122 pass |

### Resultados (negócio)
O botão Emitir NFS-e nas Faturas dispara a Focus NFe (São Paulo) e a tela mostra número, PDF e status; o boleto continua no Asaas.

### Regressões verificadas
- Notas já emitidas no Asaas não são reenviadas à Focus.
- Cancelada/recusada/billing intocáveis.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Sim — `POST /api/webhooks/focus-nfe` fail-closed sem `FOCUS_WEBHOOK_TOKEN`. Token só no servidor. Frontend não chama `supabase.functions.invoke`.

### Backup / ponto de restauração
- Migration aditiva (colunas novas). Rollback: voltar emissão ao Asaas no código; colunas podem permanecer.

### Deploy
- Não publicado. Configurar na Vercel: `FOCUS_API_TOKEN`, `FOCUS_PRESTADOR_IM`, `FOCUS_NFE_ENV`, `FOCUS_WEBHOOK_TOKEN`.

### Evidências
- Payload unitário: item `11.02`, código municipal `07870`, ISS 5% retido, discriminacao CNAE oficial.

### Pendências
- Token Focus e CCM do prestador nas secrets de produção.
- Homologar uma NF real em São Paulo (ambiente homologação) antes de `FOCUS_NFE_ENV=producao`.
- Cadastrar webhook Focus para `https://<host>/api/webhooks/focus-nfe?token=...`.

### Gates G1–G16
- [x] Atendidos / N/A justificado (UI Faturas: testes unitários + contrato de API existente; browser da emissão real depende do token Focus).

### Resumo executivo (3 linhas)
1. NFS-e nova sai pela Focus NFe; cobrança continua Asaas.
2. Mesma tela e mesmos botões; sem tabela paralela e sem Edge Function.
3. Falta configurar token/CCM e validar uma nota em homologação.
