# Changelog — Governança Torres

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
