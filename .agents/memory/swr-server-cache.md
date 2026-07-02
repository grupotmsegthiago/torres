---
name: SWR server cache opt-in (?cached=1)
description: Como cachear endpoint pesado SEM afetar telas ao vivo que compartilham a mesma rota.
---

Quando uma tela lenta (ex.: Balanço Gerencial) compartilha endpoints pesados com telas que precisam de dado ao vivo (Painel Operacional, Relatório de OS, Custos Fixos), NÃO dá pra cachear a rota globalmente.

**Solução:** cache stale-while-revalidate em memória (`server/lib/swr-cache.ts`, `withSwrCache`) GATED por `?cached=1`. Só quem manda o flag usa cache; os demais callers caem em passthrough (early return) e ficam byte-idênticos a antes. `?force=1` recalcula na hora.

**Why:** os números financeiros são INTOCÁVEIS (§8). O cache embrulha o handler existente sem tocar no cálculo — muda só QUANDO roda, nunca O QUE devolve. Passthrough garante que telas ao vivo não regridem.

**How to apply:**
- Embrulhar: `app.get(path, ...guards, withSwrCache({ baseKey, ttlMs }, handler))`.
- Frontend usa `queryFn` custom com `?cached=1` + `staleTime/refetchInterval` = TTL; botão "Atualizar agora" chama os 3 com `force=1` e invalida as queryKeys (que incluem o sufixo `"cached"`).
- O helper tem: singleflight no MISS (concorrência cold não duplica cálculo), background refresh no STALE (com guard anti-corrida), evição LRU por tamanho (MAX_ENTRIES) — necessária porque a chave inclui params como `from/to` (faixas históricas acumulam), só cacheia status 200, e expõe `X-Cache`/`X-Cache-Age`.
- Pegadinha: ao rejeitar a promise do singleflight (não-200/erro) sem follower, anexar `promise.catch(()=>{})` senão dá unhandledRejection.

## Persistência + warm-up (task Balanço rápido)

- Write-through opcional em `swr_cache_snapshots` (Supabase): `setEntry` persiste fire-and-forget (cap 8MB); MISS frio (pós-restart) tenta o snapshot ANTES de recalcular (1x por chave/processo via `persistChecked`), rejeitando snapshot com mais de 24h (`MAX_PERSIST_AGE_MS`) — melhor recálculo frio do que dado de dias atrás.
- `bustSwrCache` também apaga snapshots persistidos (`.like key prefix%`) senão o MISS frio ressuscita dado invalidado.
- Warm-up serializado (`startSwrWarmup`, chamado no boot em server/index.ts): registry via `warmQueries` no `withSwrCache`; 1 chave por vez com gap de 5s, pula entrada <75% do TTL (snapshot persistido fresco conta como quente ⇒ restart não dispara rajada). Ranges "correntes" (semana seg→dom / mês civil BRT) vêm de `currentBrtWeekRange/MonthRange` em server/lib/brt-date.ts — replicam o getDateRange do frontend pra aquecer EXATAMENTE a chave pedida.
- Teste de paridade: `.local/test_swr_persist_parity.mts` (gera JWT admin via generateLink magiclink + verifyOtp; `--ep=nome` fatia por endpoint pra caber no timeout; `--only-hit` valida HIT pós-restart vindo do snapshot).
