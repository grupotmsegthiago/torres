---
name: Folha vs Espelho — marcadores sintéticos do import corrompem horas
description: Por que as horas trabalhadas da Folha de Ponto e do Espelho RHID não batem com o RHID oficial (ex.: FERNANDO jun/2026, dono espera 447:27).
---

# Horas trabalhadas divergentes (Folha vs Espelho vs RHID oficial)

Batidas importadas do PDF do RHID (`source = folha_pdf_import`) trazem **marcadores sintéticos 00:00 e 23:59** que bracketam turnos cruzando a meia-noite. Esses marcadores corrompem TODOS os cálculos de horas a partir dessas batidas:

- **Folha de Ponto** (`buildFolhaPonto`/`buildFolhaStats`): pareia por dia sem costurar a meia-noite ⇒ conta `entrada→23:59` + `00:00→saída` como trabalho real ⇒ **SUPER-conta** (ex.: dias mostram 22:59 trabalhadas).
- **Espelho RHID** (`buildEspelhoRhid`→`buildEspelhoPonto`): costura `23:59↔00:00` (≤3min) mas o teto `HARD_MAX_GAP_MIN = 18h` transforma o turno longo resultante em **órfã descartada** ⇒ **SUB-conta** (ex.: 06-03 vira 01:00).

**Caso medido (FERNANDO DIAS COLONHEZI, id 26, competência 2026-06, ciclo 26/05→25/06):**
- Folha (card "Horas Trabalhadas"): **479:31**
- Espelho RHID oficial (botão na tela): **129:03**
- Número correto segundo o dono (fonte RHID externa): **447:27**

Testei vários algoritmos de pareamento sobre as batidas atuais: costura+cap 18h=129:03, cap 24h=351:29, cap 30h+=479:47, sem marcadores=132:48. **NENHUM reproduz 447:27.**

**Conclusão:** o `447:27` NÃO é derivável das batidas que estão no banco — o import diverge do RHID real. NÃO é bug de "contar refeição" (refeição já é descontada em dia de 4 batidas) nem de fórmula de pareamento; é **dado de import corrompido** (mesma raiz do follow-up "Eliminar batidas duplicadas no espelho/folha"). Para bater 447:27 é preciso corrigir/reimportar os dados ou ter a regra exata de pareamento de turno noturno do RHID — decisão do dono.

**Why:** evita gastar esforço tentando "consertar a fórmula" da folha; o sintoma ("conta com refeição") engana — a causa é a marcação sintética 00:00/23:59 do import.

**How to apply:** quando horas trabalhadas da folha/espelho não baterem com o RHID, primeiro inspecionar as batidas (`source`, marcadores 00:00/23:59) ANTES de mexer em pareamento; não tocar lógica de folha (INTOCÁVEL §8) sem ordem; lembrar decisão 22/06 (espelho NÃO alimenta folha de pagamento — cabeçalho de `server/lib/espelho-ponto.ts`).

## Taxa de HE (CCT vigilância)
`buildFolhaStats` tinha default `multiplicadorHE = 1.5` (CLT 50%); o resto do sistema (payroll.ts, fixed-costs/Balanço RH) usa **1.6 (CCT 60%)**. Alinhado o default para 1.6. valorHora ≈ 15,16 (base×1,3/220); ×1,6 com precisão cheia = 24,25, mas o dono usa 24,26 (arredonda a hora p/ centavo ANTES: 15,16×1,6=24,256→24,26). Normal 15,16 e Noturna 27,29 (×1,8) já batem. A diferença de 1 centavo no HE é só arredondamento do valor-hora.
