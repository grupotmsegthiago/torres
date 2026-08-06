# Changelog — Governança Torres

## 2026-08-06 — security(users): continue PR4B / 4.5B homologation package

- Continuidade da fase **4.5B**: script de homologação live PASS/FAIL (`scripts/security/homologate-drop-plain-password-baseline.sql`) alinhado aos guards da migration.
- Runbook atualizado com matriz 4.5A/4.5B (estática OK; baseline DB pendente; DROP não aplicado).
- Testes de contrato ampliados; **sem** execução de DROP; **sem** alteração de banco/produção.
- D13 permanece: **PR4B / 4.5B HOMOLOGAÇÃO ESTÁTICA OK — BASELINE DB PENDENTE — DROP AINDA NÃO APLICADO**.
- Branch: `cursor/pr4b-4-5b-homologacao-35ed` (continuidade da PR #55)

## 2026-08-05 — security(users): strengthen plain password dependency guards

- PR4B / 4.5B: cobertura preventiva reforçada na migration de DROP (ainda **não** aplicada).
- Diagnóstico 4.5A: zero dependências reais (`pg_depend`=0); lacuna era de governança, não bloqueio técnico.
- Guards: `pg_depend` (deptype `n` + attnum), functions+procedures, rules/`pg_rewrite`; grants só diagnóstico.
- PostgreSQL já era fail-closed sem CASCADE; baseline/verify/testes alinhados ao catálogo canônico.
- Branch: `security/prepare-drop-plain-password-column` (PR #55)

## 2026-08-05 — security(users): prepare plain password column removal

- PR4B: artefatos versionados para DROP de `public.users.plain_password` — **não aplicados**.
- Baseline `scripts/security/baseline-drop-plain-password.sql`, verify `verify-drop-plain-password.sql`, migration `20260805210000_drop_users_plain_password`, rollback estrutural (coluna NULL sem valores), runbook `RUNBOOK-DROP-PLAIN-PASSWORD.md`.
- Fail-closed: total=36, filled=0, null=total, coluna existe, deps=0; sem CASCADE; sem alteração de Auth/RLS.
- PR4A já desacoplou código/tipos; coluna física ainda presente; backup obrigatório antes da aplicação; PR4C documentará o pós-DROP.
- D13 → **PR4B PREPARADO — DROP AINDA NÃO APLICADO**.
- Branch: `security/prepare-drop-plain-password-column`

## 2026-08-05 — security(users): remove plain password from application schema

- PR4A: remove `plainPassword` de `shared/schema.ts` e tipos derivados (`User` / `InsertUser`).
- `sanitizeUserWrite` / `toSafeUser` / `USER_SAFE_SELECT` preservados como bloqueios.
- Zero alteração no banco; coluna física permanece; sem DROP; sem migration nova.
- D13 → **PR4A CONCLUÍDO — CÓDIGO E TIPOS DESACOPLADOS; COLUNA FÍSICA AINDA PRESENTE — PR4B PENDENTE**.
- Branch: `security/remove-plain-password-from-code`

## 2026-08-05 — docs(security): record plain password cleanup incident and outcome

- PR3C: homologação pós-limpeza e documentação transparente do evento ad-hoc.
- Estado: total=36, filled=0, null=36, Auth match=36/36, verify PASS, coluna ainda existe.
- Migration versionada `20260805190500_null_legacy_plain_password` **não** consta no histórico Supabase; **não** se inseriu registro falso.
- Incidente: `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`.
- D13 → **VALORES LEGADOS LIMPOS — HOMOLOGAÇÃO PÓS-LIMPEZA CONCLUÍDA; COLUNA AINDA PRESENTE — PR4 PENDENTE**.
- Branch: `docs/plain-password-cleanup-applied`

## 2026-08-05 — security(users): prepare legacy plain password cleanup

- PR3A: baseline somente leitura, verify pós-limpeza, migration versionada (não aplicada), rollback documental e runbook.
- Artefatos: `scripts/security/baseline-plain-password-cleanup.sql`, `verify-plain-password-cleanup.sql`, `supabase/migrations/20260805190500_null_legacy_plain_password.sql`, `docs/security/RUNBOOK-PLAIN-PASSWORD-CLEANUP.md`.
- Sem UPDATE executado naquele PR; valores legados ainda 36/36 à época; sem hash de senha; sem rollback com senhas.
- D13 (à época) → **PR3A PREPARADO — LIMPEZA AINDA NÃO APLICADA** (depois: limpeza ad-hoc + PR3C).
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
