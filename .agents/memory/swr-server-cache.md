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
