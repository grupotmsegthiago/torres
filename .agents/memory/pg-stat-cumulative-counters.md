---
name: Contadores cumulativos do pg_stat
description: Por que gráficos de "taxa ao longo do tempo" sobre pg_stat_user_tables precisam de delta entre amostras, não do valor bruto.
---

# Contadores cumulativos do pg_stat

`pg_stat_user_tables` (e views afins como `pg_statio_*`) expõem contadores **acumulados** desde o último reset de estatísticas / restart: `seq_tup_read`, `idx_tup_fetch`, `n_tup_ins/upd/del`, `heap_blks_hit/read`, etc. São monotonicamente crescentes.

**Regra:** para um gráfico de "perfil de carga ao longo do tempo" (leituras vs escritas por intervalo), nunca plote o valor bruto — calcule o **delta entre amostras consecutivas** do histórico.

**Como aplicar (3 cuidados obrigatórios):**
1. **Clamp >= 0:** após reset/restart o valor cai; `Math.max(0, atual - anterior)` evita delta negativo.
2. **Ignorar amostras null:** amostras anteriores à criação das colunas ficam NULL; tratar NULL como 0 faz a transição null→valor virar um **pico artificial gigante** (valorAcumulado - 0). Só gerar ponto quando a amostra atual E a anterior têm valor não-nulo.
3. **Primeira amostra não tem intervalo** anterior → descartar.

**Why:** bug pego em revisão na tela "Banco de Dados" (Taxa Escrita vs Leitura) — o gráfico mostrava um spike de milhões na 1ª amostra nova. Testado em `.local/test_tuples_delta.mts` (valores normais, reset, transição null→valor).
