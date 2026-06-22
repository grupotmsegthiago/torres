---
name: Auth stale-while-error (resiliência na queda do Supabase)
description: Regra de quando servir sessão "last-known-good" e por que o gate de saúde do Supabase é obrigatório em TODO caminho de erro.
---

# Cache de auth: stale-while-error com gate de saúde

O cache de token (server/auth.ts) tem TTL fresco (60s) + janela stale (~30min, `staleUntil`). Regra de decisão em `authenticateToken`:
- fresco → usa direto;
- stale **E** `!isSupabaseHealthy()` → serve last-known-good SEM bater no Supabase (corta a enxurrada);
- senão valida remoto; em erro/exceção só serve stale se `!isSupabaseHealthy()`; com Supabase saudável, erro = token inválido → **rejeita**.

**Why:** numa queda do Supabase o TTL de 60s expirava e CADA request de CADA usuário ia validar remoto (falhando), multiplicando falhas e travando o login em contingência. A janela stale ri a queda. O **gate `!isSupabaseHealthy()` precisa estar em TODO ramo que serve stale, inclusive o `catch`** — senão uma exceção transitória local estenderia sessão revogada/expirada por até 30min (brecha de segurança apontada em review). Logout/role-change limpam o cache (incl. stale), então revogação continua imediata.

**How to apply:** ao mexer nesse fluxo, nunca sirva `cached` sem checar `!isSupabaseHealthy()` num caminho de erro. Revogação imediata depende de `invalidateAuthCache`/`invalidateAuthCacheByUser` apagarem a entrada inteira.
