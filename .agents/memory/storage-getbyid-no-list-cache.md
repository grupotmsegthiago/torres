---
name: storage.getX(id) não usa o cache de lista — N+1 em telas que agregam
description: Por que enriquecer N itens com storage.getEmployee(id)/getClient(id) vira N idas ao Supabase, e como evitar
---

`storage.getEmployees()/getClients()` cacheiam a LISTA em memória (memGet/memSet), mas `storage.getEmployee(id)/getClient(id)` passam por `resilientGet`, que **sempre** chama `supaFn()` (uma ida ao Supabase por id) — NÃO consultam o cache de lista. Logo, qualquer endpoint que enriquece muitos itens chamando `getEmployee(id)/getClient(id)` individualmente faz N+1 idas ao banco.

**Why:** durante incidentes de lentidão do Supabase, esses N+1 saturam o pool e cada chamada estoura no timeout de 12s, amplificando a crise (caso real: Grade Operacional `/api/vehicle-tracking` fazia getClient/getEmployee por veículo em activeOs/lastOs/upcomingOrders).

**How to apply:** em endpoint que agrega N itens, carregue `getClients()/getEmployees()` UMA vez no Promise.all inicial e construa `new Map(arr.map(x => [x.id, x]))`; resolva por `map.get(id)` em memória. Campos são equivalentes (ambos vêm de `select("*")` → toCamelObj). Cuidado: `map.get()` devolve `undefined`; use `|| null` se o consumidor esperava o `null` do ternário.
