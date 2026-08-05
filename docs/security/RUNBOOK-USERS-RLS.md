# Runbook — Hardening RLS `public.users`

**Status da migration no repositório:** pronta
**Aplicação no Supabase compartilhado (Preview=Prod):** **APLICADA E HOMOLOGADA**
**Horário da aplicação:** 2026-08-05 ~17:36 UTC
**Backup nativo de referência:** 2026-08-05 07:59:48 UTC (Restaurar disponível)
**Resultado:** verify OK · smoke OK · rollback SQL **não** executado

## Por quê era sensível aplicar

Preview Vercel e Production usam o **mesmo** projeto Supabase. A migration altera o banco produtivo imediatamente.

## Artefatos

| Arquivo | Função |
|---------|--------|
| `supabase/migrations/20260805164000_harden_users_rls.sql` | Migration forward |
| `supabase/migrations/rollback/20260805164000_rollback_users_rls.sql` | Rollback seguro (sem USING true) |
| `scripts/security/verify-users-rls.sql` | Asserts pós-aplicação |
| `docs/security/users-rls-baseline-2026-08-05.md` | Baseline pré-change |

## Estado pós-aplicação (homologado)

- **Policies:** apenas `users_select_own` (SELECT, authenticated, own row)
- **USING (true):** 0
- **anon:** sem privilégios de tabela/coluna
- **authenticated:** SELECT somente nas colunas seguras + RLS own; sem INSERT/UPDATE/DELETE; sem `plain_password`
- **service_role:** intacto (API backend)
- **Dados:** 36 users inalterados; coluna `plain_password` preservada (dívida D13)

## Smoke pós-aplicação (executado)

- Login admin (sessão controlada) → `/api/auth/me` 200; `/api/users` 200
- Login funcionário → `/api/auth/me` 200; `/api/users` 403
- PostgREST JWT funcionário: lista só própria linha; `plain_password` negado; INSERT/UPDATE negados
- `service_role` continua lendo `users` (chat/nomes/RH via backend)

## Rollback (emergência)

```bash
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/rollback/20260805164000_rollback_users_rls.sql
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/verify-users-rls.sql
```

O rollback **mantém** segurança mínima (sem anon, sem USING true, sem SELECT de tabela, sem `plain_password` para authenticated).

## Modelo final

- **anon:** sem privilégios
- **authenticated:** possui SELECT somente nas colunas seguras + RLS own; sem INSERT/UPDATE/DELETE; sem `plain_password`
- **service_role:** intacto (API backend)
- **Helpers DEFINER:** `is_app_user`, `get_app_user_id`, `get_app_user_role` inalterados
