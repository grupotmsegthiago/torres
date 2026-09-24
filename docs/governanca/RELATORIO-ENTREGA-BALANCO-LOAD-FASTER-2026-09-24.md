## Relatório de Entrega — Balanço Gerencial mais rápido no carregamento

**Data:** 2026-09-24
**Branch:** `cursor/balanco-load-faster-ee22`
**Ambiente validado:** [x] local (unit tests)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `force=1`, `withSwrCache`, `rh-summary`, `buildFolhaPonto`, `resolveHorasExtrasNoturnasBulk`, `swr-cache`, `gestor-financeiro`
- Existente aproveitado: SWR `?cached=1` + warm-up + `bustBalancoCaches`; `buildFolhaPonto` / motor HE; gate de módulos do Gestor (inalterado)
- Decisão: **estender/corrigir** — remover force automático que anulava o cache; preload de batidas no bulk existente
- Algo novo criado? Só teste de regressão de performance (`balanco-load-perf.test.ts`)

### Domínio / tipo / camada
- **Domínio dono:** Balanço Gerencial / RH summary (KPI)
- **Tipo:** CACHE (SWR) + RESULTADO (`calcularFolha` / HE batidas) — sem novo motor
- **Camada:** 9–10 (indicadores / cache) — não escreve fatos 1–8

### Causa raiz
1. Frontend mandava `force=1` na 1ª visita de cada período (`sessionStorage`), apagando HIT/warm do SWR e recalculando Folha na hora → tela em “Calculando…” / “Validação em andamento”.
2. Cold miss do RH fazia N queries `control_id_punches` (1 por agente) via `buildFolhaPonto`.

### O que foi alterado
- RH do Balanço usa só `?cached=1` (force só em “Atualizar agora” / “Sincronizar Dados”)
- `resolveHorasExtrasNoturnasBulk` pré-carrega batidas em lote e passa `punchesPreloaded` a `buildFolhaPonto`
- Corrige refetch do botão Atualizar (`v13` → `v16`)
- Loading shell menos “morto” no 1º paint do dashboard

### O que NÃO foi alterado
- Fórmulas de margem / `balanco-calc` / `calcularEscolta` / cancelada/recusada
- Gate “certificação prévia dos módulos” (REGRA Nº 1)
- TTL 3h / persistência SWR / warm-up

### Arquivos modificados
- `client/src/pages/admin/balanco-gerencial.tsx`
- `server/lib/employee-monthly-cost.ts`
- `server/control-id.ts`
- `server/lib/balanco-load-perf.test.ts` (novo)
- `docs/governanca/RELATORIO-ENTREGA-BALANCO-LOAD-FASTER-2026-09-24.md` (este)

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando | Resultado |
|---------|-----------|
| `npx tsx --test server/lib/balanco-load-perf.test.ts server/lib/employee-monthly-cost.test.ts server/lib/swr-cache.test.ts server/lib/create-limit.test.ts` | pass 23/23 |

### Resultados (negócio)
- Abertura do Balanço no período já aquecido (mês/semana/dia) deve servir Folha do cache em vez de recalcular na 1ª visita.
- Cold miss (deploy / período novo) fica mais rápido pela leitura única de batidas.
- Números oficiais inalterados (mesmo `buildFolhaPonto` / mesma engine).

### Riscos
- Snapshot SWR antigo após deploy de lógica RH: mitigado por `bustBalancoCaches` nos writers + botão “Atualizar agora”; se precisar invalidar global, bump `baseKey` `rh-summary-v16` → v17.
- Preload falha → fallback N+1 antigo (não perde HE).

### Rollback
- Reverter o commit da branch; comportamento volta a force automático + N queries de batida.

### Próximo passo
- Publicar só com pedido explícito (`publicar.ps1`).
- Após deploy: abrir Balanço mensal sem clicar “Atualizar”; conferir `X-Cache: HIT` no `rh-summary` e indicadores sem espera longa.
