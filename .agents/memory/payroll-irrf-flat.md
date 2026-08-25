---
name: IRRF Torres — isento até R$ 5.000 (HE à parte)
description: IRRF da folha mensal zera se salário+peric ≤ 5k; HE/noturno não entram na base (pagos à parte)
---

# IRRF Torres — isento até R$ 5.000 (HE à parte)

**Regra (decisão do dono 29/07/2026):** na folha mensal, a base de IRRF é
**somente salário proporcional + periculosidade**. Horas extras e adicional
noturno são **pagos à parte** e **não entram** nessa base.

Se essa base mensal for **≤ R$ 5.000**, IRRF = **R$ 0,00** (nenhum pagamento
líquido mensal típico de vigilante ultrapassa esse teto). Acima de R$ 5.000,
aplica-se a alíquota flat de 22% sobre a base mensal (média histórica).

**Histórico:** em 26/06/2026 o modelo era 22% flat sobre o bruto total
(salário+peric+HE+noturno), sem isenção. Em 29/07/2026 o dono corrigiu:
HE à parte → base mensal < 5k → IRRF zerado (ex.: Jorge 3.334,90 → IRRF 0).

**FGTS NÃO desconta do líquido** (inalterado): FGTS é depósito do empregador.
Líquido folha = `baseEncargos − INSS − IRRF − VT` (HE/noturno pagos à parte).

**HE/noturno (decisão dono 2026):** pagos à parte a R$ 16,00 / R$ 16,50 — **sem**
INSS, FGTS, IRRF nem % de encargos sociais em cima. `baseEncargos` = só salário+peric+DSR.

**Como aplicar:**
- `calcularFolha`: IRRF flat usa base = salário+peric; isento se ≤ `IRRF_ISENTO_ATE` (5000).
- INSS/FGTS/INSS patronal usam `baseEncargos` (nunca HE/noturno).
- NÃO voltar a tributar HE/noturno sem ordem explícita do dono.
