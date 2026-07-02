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

## Invalidação obrigatória em TODO writer de billing

- Mudou status/valores de `escort_billings` ⇒ chamar `bustBalancoCaches()` (`server/lib/balanco-cache.ts`), que busta `operational-grid` + `financial-dashboard` (memória + snapshots persistidos).
- **Why:** sem isso o Balanço mostra dado velho por até 3h (TTL). Writers estão espalhados por vários arquivos de rota — writer novo reabre o buraco.
- **Exceção deliberada:** o CRON de recálculo NÃO busta (roda a cada ciclo; bustaria o cache continuamente e anularia o benefício; ele só recalcula billings não-congelados, que o Balanço já mostra como previsão ao vivo).
- Helper em módulo neutro (`server/lib/`), nunca exportado de arquivo de rotas (evita import circular rota→rota).

## Linha sintética "de hoje" no dashboard NUNCA vence boletim congelado

- O handler do `financial-dashboard` troca billings de OSs de escolta "de hoje" (em andamento/concluída hoje) por uma linha sintética recalculada ao vivo com status A_VERIFICAR hardcoded — previsão ao vivo pro dia corrente.
- **Regra:** boletim congelado (APROVADA/FATURADO/FATURADA/PAGO) é a verdade e vence a sintética: manter a linha real em `items` e pular a injeção (`frozenBillOsIds`). Senão OS concluída hoje com boletim já aprovado volta a aparecer como "AGUARDA BOLETIM" no popup de OSs em Aberto — e cache-bust nenhum resolve, porque o dado errado nasce no recompute.
- **How to apply:** sintomas de "status errado apesar do banco certo" no Balanço ⇒ checar PRIMEIRO se a OS cai no ramo "de hoje" (completed_date hoje em BRT) antes de suspeitar de cache.

## Testes hermeticamente isolados da persistência

- Sob o test runner (`NODE_TEST_CONTEXT` setado, ou `NODE_ENV=test`), TODA a persistência (write/read/delete em `swr_cache_snapshots`) fica desligada via `PERSIST_DISABLED`.
- **Why:** os testes rodavam contra o Supabase real; o delete do `bustSwrCache` é fire-and-forget, então um snapshot de rodada anterior ressuscitava no MISS como STALE e disparava refresh em background → teste do singleflight flaky (`calls=2`) → `prebuild` falha → deploy aborta.
- **How to apply:** qualquer novo caminho que toque `swr_cache_snapshots` precisa respeitar `PERSIST_DISABLED`; testes de persistência de verdade vão em script `.local/test_*.mts` (fora do `npm test`).
