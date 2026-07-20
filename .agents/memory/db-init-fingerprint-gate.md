---
name: Gate de fingerprint do db-init
description: Boot pula o DDL do ensureDbSchema quando o fingerprint do código bate com o gravado em system_settings
---

Regra: `ensureDbSchema` só re-executa o DDL completo quando o sha1 do `toString()` das funções de schema (ensureDbSchema + ensureRlsHardening + ensureRealtimePublication) difere do valor gravado em `system_settings` (chave `db_schema_fingerprint_<env>`, separada por dev/prod porque o bundle esbuild muda o toString). `FORCE_DB_INIT=true` força a rodada completa. O fingerprint só é gravado após uma rodada completa sem erro.

**Why:** cada restart/publish em produção re-rodava dezenas de exec_sql sequenciais (~5min com o banco saturado, chamadas de até 29s, node-cron perdendo execuções) — foi a causa do "Grid demorando pra carregar" logo após um deploy; em autoscale cada instância repetia tudo.

**How to apply:**
- Mudou DDL dentro dessas funções ⇒ o fingerprint muda sozinho e re-roda; nada de bump manual.
- Mudou schema por FORA delas (script manual, Supabase dashboard) ⇒ o gate NÃO percebe; rode com FORCE_DB_INIT=true ou apague a chave em system_settings.
- Auto-curas de DADOS (backfillOrderCoords, ensureDefaultPresets) rodam mesmo no caminho de skip — coisas não-DDL novas que precisem self-heal devem ir pro skip path também, não só dentro do try do DDL.
- Ensures de schema em outros módulos (routes.ts, Inter, leads, Financial) NÃO estão atrás do gate e ainda rodam a cada boot (custo menor).
- Corrida residual: no 1º boot de uma versão nova, várias instâncias podem rodar o DDL em paralelo (mesmo comportamento de antes; DDL é idempotente).
