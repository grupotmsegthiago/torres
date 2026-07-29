---
name: Custo Empresa sem provisões 13º/férias
description: Provisões CCT (13º, férias, 1/3) são só informativas — não entram no Custo Empresa
---

# Custo Empresa sem provisões 13º/férias

**Regra (decisão do dono 29/07/2026):** o Custo Empresa / Custo RH **não inclui**
provisões de 13º, férias, 1/3 nem encargos sobre essas provisões.

**Entra no custo:** remuneração (salário+peric+HE+noturno) + VR + ajuda + diárias
+ demais benefícios + FGTS mensal (+ INSS patronal/seguro se aplicados).

**Só informativo:** quadro Provisões CCT (13º, férias, 1/3, FGTS/INSS s/ provisões).

**Como aplicar:** `calcularFolha.custoTotalEmpresa` = bruto + VR + ajuda + FGTS
(sem `totalProvisoes`). UI marca provisões como “informativo — não entra no custo”.
Cache RH: `rh-summary-v5`.
