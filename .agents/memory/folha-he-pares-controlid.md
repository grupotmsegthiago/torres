# HE Folha = pares Control iD (sem 00:00/23:59)

**Sintoma:** Balanço/Reis mostrava HE **103:45** (103,75h) enquanto o cartão
Control iD oficial mostra **102:22**.

**Causa:** `buildFolhaPonto` usava `(última − primeira) − 1º almoço` e só capava
em 19:59. Marcadores sintéticos `00:00`/`23:59` do import ainda inchavam dias
abaixo do teto; 6+ batidas não descontavam o 2º intervalo.

**Fix:** `computeDayWorkedMinutesFromPunches` — ignora marcadores de meia-noite,
soma pares guloso, mantém teto 19:59. Cache `rh-summary-v11`.

**Alvo Reis:** HE 102:22 × R$ 16 ≈ R$ 1.637,87 (minuto-exato; não usar 102,22
decimal × 16 = 1.635,52 — isso misturava HH:MM com decimal).
