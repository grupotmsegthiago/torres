# Relatório de Entrega — Vínculo Comercial e Ingestão de Comissões (TORRES → TM SEG)

**Data:** 2026-09-09
**Branch:** `dev` (trabalho local)
**Commit(s):** (pendente de pedido de commit/publicação)
**Ambiente validado:** [x] local (testes unitários)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

## Especificação Funcional (resumo)

**Referências lidas:** docs/governanca/README + 01 + 02 + 03 + 04

### ★ Problema
O cadastro de cliente e o faturamento do TORRES não vinculavam o responsável comercial nem enviavam eventos ao painel central de Comissões da TM SEG.

### ★ Causa raiz
Não existia cliente satélite, proxy de listagem nem disparo nos writers de invoice. A coluna `clients.responsavel_comercial_id` já existia no banco; o schema/UI/API do TORRES não a usavam.

### ★ Pesquisa de reutilização (D11 / P13)
- Termos: `responsavel_comercial`, `comissoes/ingest`, `x-comissao-ingest-token`, `comerciais`, emitir fatura, `applyPaymentToInvoice`, `receive-in-cash`
- Existente: formulário `client/src/pages/admin/clients.tsx`; rotas `server/routes/clients.ts`; writers de fatura em `server/asaas.ts` (emitir, gerar-fatura, webhook, baixa, delete); padrão de proxy autenticado `GET /api/whatsapp/groups`
- Decisão: **estender** cadastro de cliente + writers de invoice. **Criar** apenas o cliente satélite `server/lib/comissao-ingest.ts` (não havia módulo equivalente).
- Inviabilidade de reutilizar tabela/FK local: regra explícita do pedido e da arquitetura (SSOT do comercial = TM SEG).

### ★ Domínio dono
`clients` (UUID do comercial) · `invoices` (evento de cobrança) · satélite TM SEG Comissões

### ★ Tipo de dado
FATO (`clients.responsavel_comercial_id`) · SATELITE (lista de comerciais + ingestão)

### Fora do escopo
- Não criar tabela `comerciais` nem FK
- Não alterar motor `calcularEscolta`, boletim, ledger ou Balanço
- Sem publicação automática

---

### Reutilização (D11 / P13)
- Busca realizada: símbolos acima + `server/lib/invoice-payment.ts` + schema `clients`
- Existente aproveitado: form de cliente, `registerClientRoutes`, pontos oficiais de emitir/baixar/cancelar em `asaas.ts`
- Algo novo criado? [x] Sim — cliente satélite + `GET /api/comerciais` (proxy). Inviável reutilizar cadastro local de comerciais (proibido).

### O que foi alterado
- Select “Responsável Comercial” no cadastro/edição de cliente, alimentado pela TM SEG via API do TORRES
- Persistência do UUID em `clients.responsavel_comercial_id`
- POST fail-soft `FATURADO` / `PAGO` / `CANCELADO` após sucesso local da fatura

### O que NÃO foi alterado
- Motor de faturamento, snapshot de boletim, ledger, valores de invoice
- Nenhuma tabela nova, nenhuma FK

### Arquivos modificados
- `server/lib/comissao-ingest.ts` + `server/lib/comissao-ingest.test.ts`
- `server/routes/clients.ts`, `server/asaas.ts`, `server/db-init.ts`
- `shared/schema.ts`, `client/src/pages/admin/clients.tsx`
- `.env.example`, `docs/ENVIRONMENT_VARIABLES.md`, scripts de env
- `docs/governanca/01`, `03`, `CHANGELOG`, este relatório

### Banco / migrations
- [x] Nenhuma migration versionada nova (coluna já existe)
- `db-init`: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS responsavel_comercial_id UUID` **sem FK**

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/comissao-ingest.test.ts` | pass (12/12) |
| `insertClientSchema` UUID null/válido/inválido | pass |

### Resultados (negócio)
Cliente TORRES fica vinculado ao comercial da TM SEG; fatura emitida, paga ou cancelada alimenta o painel de comissões sem travar o TORRES se a TM SEG cair.

### Regressões verificadas
- Ingestão não entra no `await` do emitir/baixa/cancelar (fire-and-forget)
- Sem comercial no cliente → não chama a TM SEG
- Token nunca vai ao browser

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não — rota nova autenticada (`financeiro`/`comercial`); token só server-side

### Pendências
- Configurar `COMISSAO_INGEST_TOKEN` na Vercel (e local) antes do uso em produção
- TM SEG deve tratar POST repetido (`origemFaturaId` + `evento`) de forma idempotente
- Publicação só com pedido explícito

### Gates G1–G16
- Atendidos no escopo / N/A: sem mudança de motor, boletim, ledger ou deploy

### Resumo executivo
1. O TORRES não cadastra comerciais: só guarda o UUID vindo da TM SEG.
2. Emissão, pagamento e cancelamento avisam a TM SEG em segundo plano.
3. Se a TM SEG estiver fora, a fatura no TORRES segue normalmente.
