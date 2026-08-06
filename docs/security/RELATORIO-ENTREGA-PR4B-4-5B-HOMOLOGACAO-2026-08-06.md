## Relatório de Entrega — PR4B / 4.5B continuidade (homologação)

**Data:** 2026-08-06
**Branch:** `cursor/pr4b-4-5b-homologacao-35ed`
**Commit(s):** (após commit desta entrega)
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Declaração obrigatória
- **Domínio dono:** Segurança / Auth (`public.users`)
- **Tipo do dado:** Fato mestre (coluna física legada) + artefatos de governança
- **Reutilização avaliada:** estende PR #55 / artefatos PR4B existentes; sem novo motor/tabela/API
- **Risco:** baixo (somente leitura + docs/testes); DROP **não** executado
- **Rollback:** reverter commit/PR; sem alteração de banco

### Reutilização (D11 / P13)
- Busca: PR #55, runbook DROP, baseline/verify/migration 4.5B, changelog `PR4B / 4.5B`
- Existente aproveitado: guards da migration + baseline SELECT
- Algo novo criado? [x] Sim — inviabilidade: baseline só SELECT não dava PASS/FAIL operacional para homologação live; script assert dedicado reutiliza as mesmas regras

### O que foi alterado
- Script `homologate-drop-plain-password-baseline.sql` (PASS/FAIL pré-DROP)
- Testes de contrato, runbook, changelog, D13/C3 texto de status

### O que NÃO foi alterado
- Banco, RLS, Auth, writers, UI, produção, `main`
- Migration de DROP (não aplicada)
- Valores/coluna física

### Arquivos modificados
- `scripts/security/homologate-drop-plain-password-baseline.sql` (novo)
- `server/lib/drop-plain-password-column.test.ts`
- `docs/security/RUNBOOK-DROP-PLAIN-PASSWORD.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- `docs/governanca/09-DIVIDAS-E-RISCOS-CONHECIDOS.md`
- `docs/governanca/05-SEGURANCA.md`

### Banco / migrations
- [x] Nenhuma aplicada

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test` drop + cleanup + writers + safe-user + users-rls | **104/104 pass** |

### Resultados (negócio)
Pacote 4.5B fica com homologação live operacional (PASS/FAIL) sem aplicar o DROP.

### Regressões verificadas
- Sem mudança de runtime de aplicação

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Não necessário nesta etapa (sem mutação DB)

### Deploy
- Não

### Pendências
1. Autenticar Supabase MCP / SQL Editor e rodar `homologate-drop-plain-password-baseline.sql`
2. Confirmar backup nativo recente
3. Só então, com autorização explícita, aplicar DROP + verify + PR4C

### Gates G1–G17
- G1–G16: N/A ou atendidos para escopo documental/artefato (sem runtime)
- G17 reutilização: atendido

### Resumo executivo
1. Continuamos a fase 4.5B (PR4B) sem DROP.
2. Homologação estática + script live PASS/FAIL prontos.
3. Baseline no banco e aplicação do DROP aguardam o proprietário.
