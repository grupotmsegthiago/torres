---
name: SECURITY DEFINER RPC hardening (db-init)
description: Toda nova função SECURITY DEFINER em server/db-init.ts precisa de REVOKE de PUBLIC/anon/authenticated antes do GRANT a service_role.
---

# Hardening de RPC SECURITY DEFINER no Supabase

Ao criar qualquer função `SECURITY DEFINER` em `server/db-init.ts` (ex.: as `db_*` de telemetria que leem `pg_stat_statements`/catálogos), é **obrigatório**:

```
REVOKE ALL ON FUNCTION public.<fn>() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<fn>() TO service_role;
```

**Why:** no PostgreSQL, função nova já nasce com `EXECUTE` para `PUBLIC`. Só dar `GRANT ... TO service_role` NÃO basta — sem o `REVOKE`, papéis `anon`/`authenticated` continuam podendo chamar a RPC via PostgREST e ver texto de queries / superfícies internas. As irmãs `db_telemetry_snapshot()` e `db_table_sizes()` já seguem esse padrão; `db_top_queries()` foi corrigida pra igualar.

**How to apply:** sempre logo após o `CREATE OR REPLACE FUNCTION`. Validar com `information_schema.routine_privileges` — só devem aparecer `postgres` e `service_role` como grantees. Lembrar de aplicar também direto em prod via pg (o boot do db-init pode demorar/persistir versão antiga).
