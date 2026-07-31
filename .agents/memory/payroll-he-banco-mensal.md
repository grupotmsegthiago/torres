---
name: HE de pagamento = banco mensal Control iD (trab − 220)
description: Balanço/cadastro usam a mesma HE do card Folha Torres (first_last), não a soma da coluna diária 8h48
---

# HE de pagamento = banco mensal Control iD

**Regra (decisão do dono 29/07/2026 — caso Reis):** a HE que entra no custo
(Balanço Folha / salary-summary) vem das batidas via `buildFolhaPonto`
(motor `first_last`):

```
HE = max(0, horasTrabalhadas − horas_mensais)   // ex. Reis: 323:45 − 220 = 103:45
```

**Atualização 31/07/2026 (dono):** o valor correto do Reis (26/06→25/07) é
**103:45** (Folha Torres). **Não** “corrigir” para o PDF Control iD 102:22.
Ver `reis-he-103-oficial.md`.

**Não usar** a soma da coluna "H. Extra" da tabela diária (`Σ max(0, dia − 8h48)`),
nem `ponto_operacional` / `jornada_calculos` quando houver batidas Control iD.
Essas fontes inflaram o Reis para ~117h (R$ 1.885).

**Prioridade em `resolveHorasExtrasNoturnas`:**
1. batidas (`buildFolhaPonto`, HH:MM sem segundos)
2. ponto_operacional
3. jornada_calculos

**Taxas:** CCT `horaExtraValor` 16 / `horaExtraNoturnaValor` 16,50.
Alvo Reis (Folha Torres / pagamento): HE **103:45** × R$ 16 (minuto-exato).
Ver também `folha-he-pares-controlid.md`.

**Cache:** `rh-summary-v13`.
**Jornada/dia:** first→last − 1º almoço + teto 19:59 (não pares gulosos).
