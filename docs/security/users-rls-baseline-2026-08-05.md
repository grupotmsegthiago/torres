# Baseline metadados — `public.users` RLS

**Capturado em:** 2026-08-05
**Branch base:** `dev` @ `153f818b`
**Tag safety:** `safety/pre-users-rls-153f818b`
**Projeto:** TORRES (somente metadados — sem linhas, senhas ou secrets)

## RLS

| Campo | Valor |
|-------|-------|
| `relrowsecurity` | true |
| `relforcerowsecurity` | false |

## Grants (pré-hardening)

| Role | Privileges |
|------|------------|
| anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

## Policies (pré-hardening)

| polname | cmd | kind | roles | using | with_check |
|---------|-----|------|-------|-------|------------|
| Acesso Total Emergencial | SELECT | PERMISSIVE | authenticated | `true` | — |
| Acesso público aos perfis | SELECT | PERMISSIVE | authenticated | `true` | — |
| Apenas usuários autenticados podem inserir | INSERT | PERMISSIVE | authenticated | — | `auth.uid()::text = supabase_uid` |
| Usuários podem ver apenas seus próprios dados | SELECT | PERMISSIVE | authenticated | `auth.uid()::text = supabase_uid` | — |
| users_insert_admin | INSERT | PERMISSIVE | authenticated | — | `get_app_user_role ∈ (admin,diretoria)` |
| users_select_admin | SELECT | PERMISSIVE | authenticated | `get_app_user_role ∈ (admin,diretoria)` | — |
| users_select_own | SELECT | PERMISSIVE | authenticated | `supabase_uid = auth.uid()::text` | — |
| users_update_admin | UPDATE | PERMISSIVE | authenticated | `get_app_user_role ∈ (admin,diretoria)` | — |
| users_update_own | UPDATE | PERMISSIVE | authenticated | own row | own + role inalterado |

## Funções auxiliares

| Função | SECURITY DEFINER |
|--------|------------------|
| `is_app_user(uuid)` | true |
| `get_app_user_id(uuid)` | true |
| `get_app_user_role(uuid)` | true |

## Contagens agregadas (sem PII)

| Métrica | Valor |
|---------|-------|
| Total users | 36 |
| Com `plain_password` não-vazio | 36 |
| Com `supabase_uid` | 36 |
| Com `employee_id` | 30 |

## Observação

Frontend oficial não usa `supabase.from("users")`. Backend usa `service_role`.
