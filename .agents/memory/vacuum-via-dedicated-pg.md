---
name: VACUUM / manutenção pesada precisa de conexão pg dedicada
description: Por que VACUUM (e ops longas) não rodam via supabaseAdmin/exec_sql e como rodar com segurança.
---

# VACUUM / manutenção pesada do Postgres

`VACUUM` (e `VACUUM FULL`) **não pode rodar dentro de transação** — então NÃO roda
via `supabaseAdmin.rpc("exec_sql")` (o RPC executa numa função/transação) nem via
PostgREST. Tem que ser uma conexão `pg` que roda em autocommit.

**Why:** O `exec_sql` envelopa o comando; o Postgres rejeita `VACUUM` em bloco de
transação. Já o `getSupaPgClient()` de `db-init.ts` existe e roda autocommit, mas
tem `statement_timeout: 15000` (15s) — curto demais e é compartilhado com o boot/DDL.

**How to apply:** Para qualquer manutenção longa (VACUUM FULL, REINDEX, CREATE
INDEX grande), abrir um `pg.Client` DEDICADO com `statement_timeout: 0` e
`query_timeout: 0`, rodar em background (não travar o handler HTTP) guardando o
estado em variável de módulo, e expor um endpoint de status pra polling. Fechar a
conexão no `finally`. Marcar o estado "running" SINCRONAMENTE antes de qualquer
`await` pra evitar corrida (dois cliques disparando dois vacuums). Allowlist de
nomes de tabela + aspas duplas no identificador (não dá pra parametrizar nome de
tabela em DDL/VACUUM).

**Contexto que gerou isto:** migração de fotos base64→Storage deixou ~3,3GB de
dead-tuples em `mission_updates` (81% do banco); espaço só volta ao disco com
`VACUUM FULL` (não com VACUUM normal), que trava a tabela alguns minutos — por isso
virou um botão manual em /admin/database (rodar de madrugada). `VACUUM FULL` precisa
de espaço livre ~= tamanho da tabela (reescreve cópia nova).
