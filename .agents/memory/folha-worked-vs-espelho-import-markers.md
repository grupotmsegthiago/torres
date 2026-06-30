---
name: Folha vs Espelho — marcadores sintéticos do import corrompem horas
description: Por que as horas trabalhadas da Folha de Ponto e do Espelho RHID não batem com o RHID oficial (turnos cruzando meia-noite no import).
---

# Horas trabalhadas divergentes (Folha vs Espelho vs RHID oficial)

Batidas importadas do PDF do RHID (`source = folha_pdf_import`) trazem **marcadores sintéticos 00:00 e 23:59** que bracketam turnos cruzando a meia-noite. Esses marcadores corrompem TODOS os cálculos de horas a partir dessas batidas:

- **Folha de Ponto** (`buildFolhaPonto`/`buildFolhaStats`): pareia por dia sem costurar a meia-noite ⇒ conta `entrada→23:59` + `00:00→saída` como trabalho real ⇒ **SUPER-conta** (ex.: dias mostram 22:59 trabalhadas).
- **Espelho RHID** (`buildEspelhoRhid`→`buildEspelhoPonto`): costura `23:59↔00:00` (≤3min) mas o teto `HARD_MAX_GAP_MIN = 18h` transforma o turno longo resultante em **órfã descartada** ⇒ **SUB-conta** (ex.: 06-03 vira 01:00).

**Caso medido (agente CLT com turnos cruzando a meia-noite, competência 2026-06, ciclo 26/05→25/06):**
- Folha (card "Horas Trabalhadas") ANTES: **479:31** (= soma do `workedMin` cru)
- Número correto segundo o dono (fonte RHID externa): **447:27**

**SOLUÇÃO (ordem do dono, jun/2026):** o `447:27` É derivável — é a soma da coluna **"Normais"** (cada dia capado ao teto diário `NORMAL_DAILY_CAP_MIN = 1199min = 19:59`). 13 dias do import excedem 19:59 (fantasma da meia-noite); o excedente é lixo. **Fix aplicado:** em `buildFolhaPonto` (`server/control-id.ts`), capar `workedMin = Math.min(workedMin, NORMAL_DAILY_CAP_MIN)` logo após descontar almoço (antes de `entry.hoursWorked`/`workedMin`/`normaisMin`/`extraMin`). E em `buildFolhaStats`, somar `hoursWorked` em **minutos** (`sum(workedMin)/60`), não somar `toFixed(2)` por dia (acúmulo dava 447:24, 3min a menos). Resultado: card 447:27 exato, HE = 447:27−220 = 227:27, noturno intacto (125:08, calculado do span in/out, não do workedMin).

**Why:** ninguém trabalha >19:59 num dia; o teto remove só o fantasma 00:00/23:59 do `folha_pdf_import` e não afeta quem nunca passa de 19:59. O sintoma ("conta com refeição") engana — a causa é a marcação sintética do import.

**How to apply:** quando horas trabalhadas da folha não baterem com o RHID, conferir se a soma da coluna "Normais" (capada a 19:59/dia) bate com o alvo do dono ANTES de suspeitar de bug; o teto diário já corrige. Espelho RHID é função separada (`buildEspelhoRhid`) e NÃO alimenta folha de pagamento (cabeçalho `server/lib/espelho-ponto.ts`).

## Taxa de HE (CCT vigilância)
`buildFolhaStats` tinha default `multiplicadorHE = 1.5` (CLT 50%); o resto do sistema (payroll.ts, fixed-costs/Balanço RH) usa **1.6 (CCT 60%)**. Alinhado o default para 1.6. valorHora ≈ 15,16 (base×1,3/220); ×1,6 com precisão cheia = 24,25, mas o dono usa 24,26 (arredonda a hora p/ centavo ANTES: 15,16×1,6=24,256→24,26). Normal 15,16 e Noturna 27,29 (×1,8) já batem. A diferença de 1 centavo no HE é só arredondamento do valor-hora.
