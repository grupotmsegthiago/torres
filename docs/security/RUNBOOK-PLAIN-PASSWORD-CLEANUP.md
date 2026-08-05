# Runbook — Limpeza de `public.users.plain_password` (D13 / PR3)

**Status:** PR3A preparado — limpeza **ainda não aplicada**

**Migration (não aplicar no deploy):** `supabase/migrations/20260805190500_null_legacy_plain_password.sql`

**Baseline:** `scripts/security/baseline-plain-password-cleanup.sql`

**Verify:** `scripts/security/verify-plain-password-cleanup.sql`

---

## Contexto

| Camada | Estado |
|--------|--------|
| PR1 | API/UI sem exposição (`toSafeUser`) |
| PR2 | Writers de produção interrompidos |
| PR3A | Artefatos de baseline/verify/migration/runbook |
| PR3B | Aplicação controlada da migration (esta runbook) |
| PR3C | Documentação pós-aplicação |
| PR4 | DROP da coluna (fora deste runbook) |

Baseline conhecido (2026-08-05): **36** users, **36** `plain_password` preenchidos, **36** com Auth match.

Login **não** depende da coluna — usa Supabase Auth (`signInWithPassword` / Admin API).

---

## Pré-condições

Antes de aplicar a migration (PR3B):

1. PR1 e PR2 integrados na `dev` (e, se aplicável, já em produção via fluxo oficial).
2. Zero readers/writers operacionais de `plain_password` (código + RLS).
3. **Backup nativo recente** confirmado no painel Supabase (Restaurar disponível). Não usar apenas o backup antigo de referência da RLS.
4. Baseline executado **imediatamente antes** da janela.
5. Contagens esperadas:
   - `total_users = 36` (ou valor atual documentado se o total mudar antes do PR3B — ajustar verify/migration);
   - `plain_password_filled = 36`;
   - `without_supabase_uid = 0`;
   - `public_users_without_auth_match = 0`.
6. Migration, verify e este runbook abertos e revisados.
7. Nenhuma outra migration/deploy/alteração de schema simultânea.
8. Responsável técnico presente durante a janela.

---

## Execução futura (PR3B)

1. Confirmar backup nativo recente no painel.
2. Executar `baseline-plain-password-cleanup.sql` (somente leitura).
3. Comparar contagens com o esperado; **interromper** se divergir.
4. Aplicar **apenas** `20260805190500_null_legacy_plain_password.sql` (SQL Editor / `psql` controlado — **não** via Vercel).
5. Executar `verify-plain-password-cleanup.sql` — todos os asserts PASS.
6. Smoke:
   - login admin;
   - login funcionário;
   - `GET /api/auth/me`;
   - `GET /api/users` (admin);
   - reset / change-password / create (homologação descartável se autorizado);
   - chat e RH sem regressão.
7. Observar logs por **24 horas**.

A migration é **fail-closed**: se `filled <> 36` ou `total <> 36`, aborta sem limpar parcialmente. Reexecução após sucesso **não** é suportada (não idempotente).

---

## Critérios de interrupção

Parar e **não** forçar limpeza se:

- baseline diferente do esperado;
- usuário `public.users` sem Auth correspondente;
- erro de login pós-aplicação;
- erro em `/api/auth/me`;
- erro em reset/change/create;
- `service_role` falhar;
- verify falhar;
- qualquer evidência de dependência operacional da coluna.

---

## Incidente

- **Não** regravar senha em texto em `public.users`.
- **Não** copiar senha do backup.
- Corrigir usuário pelo **Supabase Auth Admin API** (reset / update password).
- Restore completo do banco = **último recurso**, apenas com autorização expressa do proprietário.
- Restore completo pode reverter outras operações; não restaurar só para recuperar senhas em texto.
- O arquivo em `supabase/migrations/rollback/` **não** restaura valores — aborta com mensagem de segurança.

---

## O que este runbook NÃO faz

- Não recomenda envio de credenciais por canais externos.
- Não rotaciona senhas Auth em massa (desnecessário para limpar a coluna).
- Não executa DROP (PR4).
- Não liga a migration a startup, boot ou deploy Vercel.
