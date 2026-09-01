## Relatório de Entrega — Ajuste TM SEG ago/2026 → OP. DEDICADA SUL

**Data:** 2026-09-01
**Branch:** `cursor/ajuste-tabela-tmseg-sul-ago2026-4118`
**Commit(s):** (preenchido após push)
**Ambiente validado:** [x] local  [ ] preview  [ ] produção (dry-run / apply)
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `OP. DEDICADA SUL`, `calcularEscolta`, `writeEscortBillingAtomic`, `extractCity`, memória `recalc-tabela-congelada`.
- Existente aproveitado: motor oficial, RPC atômica, cancelada 100 km/3h, cidade do boletim TM SEG, `brtDateKey`.
- Algo novo criado? [x] Sim — script pontual + seletor puro. Inviável só pela UI (dezenas de OS); sem segundo motor.

### O que foi alterado
- Seletor de recorte (TM SEG, FLO/Palhoça, ago/2026) e script dry-run/`--apply`.
- Recálculo oficial das OS APROVADA/cancelada ainda sem boletim aprovado.

### O que NÃO foi alterado
- Cliente DHL (não há cadastro DHL; filtro ativo).
- OS FATURADAS da 1ª quinzena (boletim 106 APROVADO).
- Sugestão de tabela em novas OS.
- Motor `calcularEscolta`.

### Arquivos modificados
- `server/lib/ajuste-tabela-origem.ts`
- `server/lib/ajuste-tabela-origem.test.ts`
- `scripts/ajuste-tabela-tmseg-sul-ago2026.ts`
- `docs/governanca/ESPECIFICACAO-AJUSTE-TABELA-TMSEG-SUL-AGO2026.md`
- este relatório

### Banco / migrations
- [x] Nenhuma (só dados operacionais via writers oficiais)

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/ajuste-tabela-origem.test.ts` | 12/12 pass |
| `npx tsx --test server/lib/ajuste-tabela-sul-calc.test.ts` | 2/2 pass |
| dry-run do script | 39 OS; 16 already_ok; 9 FATURADO/snapshot; 5 APROVADA a recalcular; 1 cancelada; 8 recusadas ponteiro; Δ previsto R$ 15.326,60 |
| `--apply` | a preencher |

### Resultados (negócio)
Missões TM SEG de agosto que saíram de Florianópolis/Palhoça e ainda não foram faturadas passam a `OP. DEDICADA SUL`. DHL e boletim já aprovado não mudam.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
Dry-run com totais antes/depois; audit log `AJUSTE_TABELA_DEDICADA_SUL`.

### Deploy
Não publicar. Ajuste de dado em produção via script, sem deploy de app.

### Pendências
- 1ª quinzena FATURADA (boletim 106): dono precisa decidir se reabre comercialmente.
- Sem regra automática para novas OS (só o recorte de agosto).

### Gates G1–G16
- [x] Atendidos / N/A justificado (script pontual + testes de seleção + motor oficial)

### Resumo executivo
1. Só TM Segurança; DHL de fora.
2. Recalcula o que ainda pode (2ª quinzena APROVADA / cancelada aberta).
3. Não mexe em FATURADO nem boletim já aprovado pelo cliente.
