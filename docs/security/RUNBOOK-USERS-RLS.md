# Runbook — Hardening RLS `public.users`

**Status da migration no repositório:** pronta
**Aplicação no Supabase compartilhado (Preview=Prod):** **PENDENTE** — exige autorização explícita e janela controlada.

## Por quê não aplicar automaticamente

Preview Vercel e Production usam o **mesmo** projeto Supabase. Aplicar a migration altera o banco produtivo imediatamente. Este PR apenas versiona o SQL.

## Artefatos

| Arquivo | Função |
|---------|--------|
| `supabase/migrations/20260805164000_harden_users_rls.sql` | Migration forward |
| `supabase/migrations/rollback/20260805164000_rollback_users_rls.sql` | Rollback seguro (sem USING true) |
| `scripts/security/verify-users-rls.sql` | Asserts pós-aplicação |
| `docs/security/users-rls-baseline-2026-08-05.md` | Baseline pré-change |

## Pré-aplicação (janela autorizada)

1. Confirmar backup/PITR Supabase disponível.
2. Confirmar baseline documentado.
3. Comunicar janela curta (login/admin).
4. Ter o SQL de rollback aberto.

## Aplicação

```bash
# Exemplo com psql (substituir URL — NÃO commitar)
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260805164000_harden_users_rls.sql
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/verify-users-rls.sql
```

Ou SQL Editor do Supabase (colar forward + verify).

## Smoke pós-aplicação

- Login admin e funcionário
- `GET /api/auth/me`
- Admin `GET /api/users`
- Chat (nomes)
- Confirmar que PostgREST com JWT de funcionário **não** lista todos os users

## Rollback

```bash
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/rollback/20260805164000_rollback_users_rls.sql
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/verify-users-rls.sql
```

O rollback **mantém** segurança mínima (sem anon, sem USING true, sem `plain_password` para authenticated).

## Modelo final

- **anon:** sem privilégios
- **authenticated:** SELECT próprio via `users_select_own`; sem INSERT/UPDATE/DELETE; sem `plain_password`
- **service_role:** intacto (API backend)
- **Helpers DEFINER:** `is_app_user`, `get_app_user_id`, `get_app_user_role` inalterados
