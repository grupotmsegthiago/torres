---
name: Supabase .in(osIds) trunca em 1000 linhas
description: Por que dados (KM, fotos, etc.) somem de OSs recentes em telas que agregam muitas OSs
---

Toda query `supabaseAdmin.from(t).select(...).in("service_order_id", osIds)` sem `.range()`/`.limit()` é cortada no **limite padrão de 1000 linhas** do PostgREST. Quando há muitas OSs (ex.: 200+ concluídas) e várias linhas por OS (ex.: várias `mission_photos` por OS), o corte cai no meio: as OSs **mais recentes** ficam fora das 1000 primeiras linhas e o dado some da tela (KM volta "—", etc.).

**Por que:** PostgREST limita a resposta a 1000 por padrão; o `.in()` não muda isso.

**Como aplicar:** em endpoint que agrega N OSs, (1) filtre o mínimo necessário (ex.: `.in("step", ["km_chegada","km_final"])` reduz drasticamente as linhas) e (2) **pagine** com um loop `.range(from, from+pageSize-1)` até `batch.length < pageSize`. Vale pra qualquer tabela filha agregada por lista de IDs (fotos, custos, updates, localizações).
