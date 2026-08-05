# Changelog — Governança Torres

## 2026-08-05 — security(users): prepare legacy plain password cleanup

- PR3A: baseline somente leitura, verify pós-limpeza, migration versionada (não aplicada), rollback documental e runbook.
- Artefatos: `scripts/security/baseline-plain-password-cleanup.sql`, `verify-plain-password-cleanup.sql`, `supabase/migrations/20260805190500_null_legacy_plain_password.sql`, `docs/security/RUNBOOK-PLAIN-PASSWORD-CLEANUP.md`.
- Sem UPDATE executado; valores legados continuam 36/36; sem hash de senha; sem rollback com senhas.
- D13 → **PR3A PREPARADO — LIMPEZA AINDA NÃO APLICADA** (PR3B aplicação, PR3C docs, PR4 DROP).
- Branch: `security/prepare-plain-password-cleanup`

## 2026-08-05 — security(users): stop storing plain text passwords

- Writers de produção não gravam mais `plain_password` (create, reset, change-password, register-by-cpf, auto-login de funcionário).
- `sanitizeUserWrite` / `UserWriteInput` bloqueiam o campo no storage.
- `generateTempPassword` centraliza senha one-shot (sem `torres@123`).
- Create/reset continuam retornando `tempPassword`/`newPassword` só na resposta imediata.
- D13 → **WRITERS INTERROMPIDOS — VALORES LEGADOS AINDA PRESENTES** (PR3 limpeza, PR4 DROP).
- Branch: `security/stop-plain-password-writers`

## 2026-08-05 — security(users): block plain password exposure in API and UI

- `toSafeUser` virou allowlist explícita (`server/lib/safe-user.ts`); sem spread do user.
- `/api/auth/me`, `/api/users`, perfil e listagens não retornam senha (nenhuma role).
- Create/reset/`register-by-cpf` mantêm `tempPassword`/`newPassword` **one-shot** na resposta imediata.
- UI admin (`users.tsx` + modal de acesso em `employees.tsx`): remove senha persistida e fallback `torres@123`.
- Auth cache e leituras `storage` de users usam `USER_SAFE_SELECT` (sem `plain_password`).
- RLS já protege PostgREST; este PR protege API/UI; writers e coluna ainda existem.
- D13 → **MITIGADA NA API/UI — DEPENDÊNCIA E COLUNA AINDA PENDENTES** (PR2 writers, PR3 limpeza, PR4 DROP).
- Branch: `security/block-plain-password-exposure`

## 2026-08-05 — security(users): RLS applied and homologated on shared Supabase

- Migration `harden_users_rls` aplicada no projeto TORRES (~17:36 UTC).
- Verify `scripts/security/verify-users-rls.sql` OK; policies finais: só `users_select_own`.
- Smoke: anon negado; funcionário REST só própria linha e sem `plain_password`; admin `/api/auth/me` e `/api/users` OK; funcionário `/api/users` 403.
- C3 → **CORRIGIDO E HOMOLOGADO**; D10 encerrada; **D13 permanece aberta**.
- Backup nativo usado como rede: 2026-08-05 07:59:48 UTC.
- Sem publish Vercel; `main` intacta.

## 2026-08-05 — security(users): restrict authenticated select to safe columns

- Corrige modelo de grants: sem `GRANT SELECT ON TABLE`; authenticated possui SELECT somente nas colunas seguras + RLS own.
- `plain_password` excluída da lista concedida (forward, rollback e verify).
- Branch: `security/harden-users-rls` (PR #48)

## 2026-08-05 — security(users): harden RLS (migration pronta)

- Migration versionada `supabase/migrations/20260805164000_harden_users_rls.sql`.
- Remove policies `USING (true)` e admin JWT; authenticated só `users_select_own`.
- `REVOKE ALL` de anon; authenticated sem INSERT/UPDATE/DELETE; SELECT somente nas colunas seguras (sem `plain_password`).
- Verify: `scripts/security/verify-users-rls.sql`; runbook: `docs/security/RUNBOOK-USERS-RLS.md`.
- C3 → **MITIGADO PENDENTE DE HOMOLOGAÇÃO** (DB compartilhado Preview/Prod — aplicação não executada neste PR).
- Dívida **D13** registrada: `plain_password` preenchida; remoção em plano separado.
- Branch: `security/harden-users-rls`

## 2026-08-05 — PR1: desativação Banco Inter (fail-closed)

- Integração Inter **desativada por padrão** via `INTER_INTEGRATION_ENABLED` (`server/lib/inter-integration.ts`).
- Webhook `POST /api/inter/webhook/cobranca` → **410** sem mutações quando desativado; **503** se flag on sem config.
- Escritas Inter (cobrança, PIX, boleto, webhook setup) e crons reconcile bloqueados.
- UI: gateway Inter removido de Faturas; Contas a Pagar sem pagamento Inter.
- Histórico / tabelas `inter_*` / colunas invoice / APIs `/api/financeiro/*` preservados.
- C1 em `05-SEGURANCA.md` marcado **MITIGADO**; limpeza definitiva = PR2–PR4.
- Branch: `security/disable-banco-inter`

## 2026-08-05 — Emenda: reutilização obrigatória (P13 / D11 / G17)

- Incluído princípio **P13** e regra de desenvolvimento **D11**: pesquisar o existente antes de implementar; proibido duplicar lógica, segundo motor, nova tabela/API/componente sem evidência de inviabilidade.
- Gate **G17** no checklist de aprovação.
- Atualizados `README`, templates `10`/`11` e regra Cursor `governanca-torres.mdc` (item 0).

## 2026-08-05 — Fase 1.0 — Implantação documental

- Criada pasta normativa `docs/governanca/` com Arquitetura Oficial, Framework, SSOT, regras críticas, segurança, testes, deploy, RACI, dívidas e templates.
- Criada regra Cursor alwaysApply `.cursor/rules/governanca-torres.mdc`.
- Apontadores de precedência adicionados em `docs/ARCHITECTURE.md`, `AGENT_RULES.md`, `RULES.md` (conteúdo técnico antigo preservado).
- Branch: `docs/framework-governanca-torres`
- Ponto de restauração: tag `safety/pre-framework-governanca-6ccdfac0` (commit `6ccdfac0`)
- **Sem** alteração de comportamento de runtime, APIs, telas, banco ou produção.
- Riscos da auditoria: apenas documentados — **não corrigidos**.
