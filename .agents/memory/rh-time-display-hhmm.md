---
name: RH exibe duração em HH:MM (não decimal)
description: Convenção de exibição de tempo/horas nas telas de Gestão de Pessoas; o que converter e o que NÃO tocar.
---

# Gestão de Pessoas (RH) exibe duração em HH:MM, nunca decimal

**Regra:** toda EXIBIÇÃO de duração de tempo/horas nas telas de RH/Gestão de Pessoas
(folha de ponto, ponto operacional, relatório de horas, jornada diretoria, timesheets,
holerite/preview e o texto do holerite) deve aparecer como `HH:MM` com sinal — nunca
decimal com sufixo `h` (ex.: `8.5h` → `08:30`; `-1.25h` → `-01:15`).

**Why:** ordem direta do dono ("TODAS AS TELAS NO GESTÃO DE PESSOAS QUE NÃO TIVER
HH:MM, AJUSTE"). Decimal de horas confunde quem confere folha contra os PDFs Control iD.

**How to apply:**
- Helper padrão `hhmmH(hours)`: `Math.round(n*60)` → sinal + `HH:MM` (floor/`%60`,
  resolve carry de minutos). Em `control-id.tsx` o `hhmmH` reusa o `hhmm(min)` existente.
- O helper deve aceitar **string legada já em `HH:MM`** (campos de hora são colunas
  `text`, ex.: `timesheets.hoursWorked`, `overtime`) e passar direto; e devolver `—`
  (não `00:00`) para valor inválido/NaN — senão mascara dado.
- **NÃO tocar:** inputs de digitação manual (decimal, `inputMode="decimal"`) nem o
  payload de submit (continua numérico/string) nem cálculos de folha/custo; e o export
  Excel (ex.: jornada-diretoria) continua **numérico** (`toFixed`), não string HH:MM.
- Percentuais (%), valores R$ e ticks de gráfico ficam como estão.
- `cargaHoraria` (carga mensal de config, ex.: "220h") NÃO é duração de jornada — não converter.
