## Relatório de Entrega — Correção da assinatura de contrato no app do vigilante

**Data:** 2026-08-27
**Branch:** `cursor/fix-assinatura-contrato-6051`
**Commit(s):** (preenchido no PR)
**Ambiente validado:** [x] local (testes unitários)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca realizada: `Assinar contrato`, `ACESSO BLOQUEADO`, `employee_permanent_contracts`, `/sign`, `data:image`, `WAF-safe`, `setState assíncrono`
- Existente aproveitado:
  - Fluxo de `client/src/pages/mobile/documentos.tsx` (passa a assinatura no submit; payload base64+mime)
  - `normalizePhotoDataUri` / padrão WAF de `server/lib/photo-data-uri.ts` (bug 04/06/2026 — selfie de login)
  - Endpoints existentes `POST /api/permanent-contracts/:id/sign` e `POST /api/probation-contracts/:id/sign`
  - Tela existente `client/src/pages/mobile/contratos.tsx`
- Decisão: **estender/corrigir** o fluxo e as APIs já oficiais. Nada de nova tabela, motor ou tela.
- Algo novo criado? [x] Não (só helper `resolveWafSafeImage` no lib WAF já existente + testes de regressão)

### O que foi alterado
- Cliente deixa de POSTar `data:image...` (WAF/Cloud Armor bloqueava com 403 HTML).
- Cliente passa a enviar a assinatura desenhada no mesmo clique (não depende de `setState`).
- PDF do contrato abre com token (`authFetch` + blob), em vez de iframe/`window.open` sem Authorization.
- APIs `/sign` aceitam o formato WAF-safe e o legado.
- Comparação de `employeeId` numérica (evita 403 por tipo string/number).
- Fallback de selfie por arquivo/câmera nativa, igual ao fluxo de documentos.

### O que NÃO foi alterado
- Regra de geração do Contrato Definitivo a partir da experiência.
- Gate de bloqueio (`/api/mobile/contract-gate`).
- Holerites, documentos genéricos, tabelas, RLS, faturamento.

### Arquivos modificados
- `client/src/pages/mobile/contratos.tsx`
- `server/routes/permanent-contracts.ts`
- `server/routes/probation-contracts.ts`
- `server/lib/photo-data-uri.ts`
- `server/lib/photo-data-uri.test.ts`
- `server/lib/contract-sign-regression.test.ts`
- `server/create-app.ts`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/photo-data-uri.test.ts server/lib/contract-sign-regression.test.ts` | pass (9/9) |

### Resultados (negócio)
O vigilante consegue ler o contrato e concluir a assinatura; o app deixa de ficar preso em “Acesso bloqueado” por erro silencioso no envio.

### Regressões verificadas
- Formato legado `facialFoto` / `assinaturaDesenho` (data URI) continua aceito no servidor.
- Experiência e Definitivo usam o mesmo contrato de payload.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não — fail-closed de `requireAuth` permanece; PDF agora exige Bearer no fetch autenticado.

### Backup / ponto de restauração
- Branch isolada; revert do PR.

### Deploy
- Healthcheck: N/A (sem publicação)
- URL/ambiente: N/A

### Evidências
- Causa raiz: WAF documentada em `server/lib/photo-data-uri.ts` (403 em `data:image`); regressão `setState` documentada em `documentos.tsx`.
- Caso real: Valdemir / TVP-0052, Contrato Definitivo pendente (início 28/08/2026).

### Pendências
- Validar em produção com um contrato pendente real após o deploy.
- Holerites ainda têm o mesmo `setState` + data URI (fora do escopo deste pedido).

### Gates G1–G16
- G1 domínio RH / FATO documental (`employee_*_contracts`) — ok
- G2 hierarquia — ok (camada 1 cadastro + apresentação)
- G3–G5 financeiro — N/A
- G6 auth fail-closed preservado
- G7 banco — sem migração
- G8 API existente estendida
- G11 auditoria de assinatura (ip/ua/fotos) inalterada
- G14 sem secrets
- G17 reutilização documentada

### Resumo executivo (3 linhas)
1. O erro ao assinar era 403 do WAF (corpo com `data:image`) e/ou 400 “Assinatura digital obrigatória” no primeiro toque.
2. Corrigimos o envio (base64 cru + assinatura no clique) e a leitura do PDF (com login).
3. Sem mudança de regra trabalhista nem de banco; deploy só se o proprietário pedir.
