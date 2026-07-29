---
name: HE de pagamento = banco mensal Control iD (trab − 220)
description: Balanço/cadastro usam a mesma HE do card Folha Control iD, não a soma da coluna diária 8h48
---

# HE de pagamento = banco mensal Control iD

**Regra (decisão do dono 29/07/2026 — caso Reis):** a HE que entra no custo
(Balanço Folha / salary-summary) deve ser **igual ao card "Hora Extra" da Folha
Control iD**:

```
HE = max(0, horasTrabalhadas − horas_mensais)   // ex.: 323:45 − 220 = 103:45
```

**Não usar** a soma da coluna "H. Extra" da tabela diária (`Σ max(0, dia − 8h48)`),
que no Reis deu **141:19** (~40h a mais). Essa coluna continua na tela de ponto
como transparência, mas **não** alimenta o R$ de HE no Balanço.

**Fonte:** mesmas batidas (`buildFolhaPonto` / `control_id_punches`), mesma agregação
de `buildFolhaStats.horaExtra`.

**How to apply:** `resolveHorasExtrasNoturnas` path `batidas` → `heMensal`.
Cache `rh-summary-v6`.
