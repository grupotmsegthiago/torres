# HE diurna CCT = 0 caía em salário×1,6

**Sintoma (Reis, Balanço Folha):** HE `103,75h` com valor **R$ 2.516,98**
(= 103,75 × ~24,26) enquanto noturno vinha certo em R$ 16,50/h (ex.: 80,2 × 16,50 = 1.323,30).

**Causa:** `normalizeVigilanciaHeRates` só migrava diurna `22,99 → 16`. Se o preset
no banco tinha `horaExtraValor: 0`, a diurna ficava 0 → `calcularFolha` usava
`valorHora × 1,6`. A noturna `<= 0` já era corrigida para 16,50 — daí o assimétrico.

**Fix:** diurna ausente/0/NaN/22,99 → 16; migrate no `ensureDefaultPresets`; cache
`rh-summary-v10`.
