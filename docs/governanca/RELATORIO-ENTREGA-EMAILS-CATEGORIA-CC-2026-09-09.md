## Relatório de Entrega — E-mails do cadastro por categoria + CC Torres

**Data:** 2026-09-09
**Branch:** `dev`
**Commit(s):** (pendente)
**Ambiente validado:** [x] local (testes)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `parseEmailList` em `_helpers`, campos `email_operacional|financeiro|contratual|medicao` em `clients`, envios em `asaas.sendBillingEmail`, boletim, OS, cron, homologação.
- Aproveitado: parser e SMTP existentes; um helper único em `shared/client-emails.ts`.
- Algo novo criado? [x] Não — extração do parser + CC fixo, sem segundo motor de e-mail.

### O que foi alterado
1. Cada envio ao cliente usa a categoria do cadastro (não mistura operacional/financeiro/contratual/medição).
2. Cópia interna obrigatória: diretoria, Mickael, financeiro e adm da Torres.
3. Tomador Asaas (NFS-e) usa só e-mail financeiro.

### O que NÃO foi alterado
- `calcularEscolta`, boletim snapshot, ledger. TM SEG: zero diff. Sem publicação.

### Arquivos modificados
- `shared/client-emails.ts`
- `server/lib/client-emails.test.ts`
- `server/routes/_helpers.ts`
- `server/asaas.ts`
- `server/routes/boletim-approval.ts`
- `server/routes/service-orders.ts`
- `server/routes/mission.ts`
- `server/routes.ts`
- `server/cron.ts`
- `server/routes/cobranca-judicial.ts`
- `server/generate-boletim-omega.ts`
- `client/src/pages/admin/clients.tsx`
- `client/src/pages/admin/boletim-medicao.tsx`
- `client/src/pages/admin/relatorio-faturamento.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando | Resultado |
|---------|-----------|
| `npx tsx --test server/lib/client-emails.test.ts` | **7/7** pass |

### Resultados (negócio)
Quem está no e-mail de medição recebe boletim; operacional recebe OS; financeiro recebe fatura; contratual recebe homologação. Diretoria, Mickael, financeiro e adm da Torres sempre em cópia.

### Pendências
- Publicar só se o dono pedir.

### Segurança
- Secrets no diff? [x] Não

### Gates
- G1 reutilização; G2 `clients` FATO, SMTP satélite.

### Resumo executivo
1. Cadastro de e-mail por categoria passou a mandar de verdade.
2. Os quatro e-mails da Torres vão sempre em CC.
3. NFS-e no Asaas continua só com o e-mail financeiro do tomador.
