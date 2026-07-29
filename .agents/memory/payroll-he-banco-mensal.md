---
name: HE de pagamento = banco mensal Control iD (trab − 220)
description: Balanço/cadastro usam a mesma HE do card Folha Control iD, não a soma da coluna diária 8h48
---

# HE de pagamento = banco mensal Control iD

**Regra (decisão do dono 29/07/2026 — caso Reis):** a HE que entra no custo
(Balanço Folha / salary-summary) deve ser **igual ao card "Hora Extra" da Folha
Control iD**:

```
HE = max(0, horasTrabalhadas − horas_mensais)   // ex.: 322:22 − 220 = 102:22
```

**Não usar** a soma da coluna "H. Extra" da tabela diária (`Σ max(0, dia − 8h48)`),
nem `ponto_operacional` / `jornada_calculos` quando houver batidas Control iD.
Essas fontes inflaram o Reis para ~117h (R$ 1.885) vs alvo 102,22h × R$ 16.

**Prioridade em `resolveHorasExtrasNoturnas`:**
1. batidas (`buildFolhaPonto`, HH:MM sem segundos)
2. ponto_operacional
3. jornada_calculos

**Taxas:** CCT `horaExtraValor` 16 / `horaExtraNoturnaValor` 16,50.
Alvo Reis (cartão Control iD): HE **102:22** × R$ 16 ≈ R$ 1.637,87
(minuto-exato; não misturar com decimal 102,22×16=1.635,52).
Noturno alvo ~82,47×16,50 = 1.360,76 (conferir batidas).
Ver também `folha-he-pares-controlid.md`.

**Cache:** `rh-summary-v13`.
**Jornada/dia:** first→last − 1º almoço + teto 19:59 (não pares gulosos).
