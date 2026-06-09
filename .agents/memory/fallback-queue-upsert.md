---
name: Fila de fallback deve espelhar a semântica de conflito da escrita primária
description: Por que escrita primária com upsert NÃO pode enfileirar insert cego no fallback offline
---

Quando uma escrita primária usa `supabaseAdmin.from(t).upsert(payload, { onConflict })` (porque a tabela tem índice único, ex.: `agent_locations` 1 linha viva por `user_id`), o caminho de **fallback offline** (catch quando Supabase cai) DEVE enfileirar a mesma operação como `upsert`, nunca como `insert` cego.

**Why:** Um `insert` enfileirado durante a queda do Supabase reprocessa no `flushWriteQueue` quando o Supabase volta. Como a linha já existe, cada insert viola o índice único repetidamente — e como há um ping por agente a cada ~15s acumulado durante a janela offline, o flush no recovery vira um **flood de unique violation** + pressão de conexão. Visto em produção: Supabase ~16min offline (HTTP 521) → flush imediato no recovery floodou `uniq_agent_loc_user`.

**How to apply:** A fila (`server/pg-fallback.ts`) suporta `operation: "upsert"` ponta-a-ponta: `enqueueWrite(t, "upsert", payload, { onConflict })`; `flushWriteQueue` faz `.upsert(payload, { onConflict })`; `applyViaDirectSql` (path de schema-cache) gera `INSERT ... ON CONFLICT (col) DO UPDATE SET col=EXCLUDED.col` (ou `DO NOTHING` se o payload só tiver a coluna de conflito). Regra geral: o tipo de op enfileirado tem que casar com a semântica da escrita primária — se a primária faz upsert, o fallback faz upsert.
