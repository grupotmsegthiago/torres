---
name: Benefícios Torres — VR fixo R$ 946 e ajuda R$ 200 (não cesta)
description: VR mensal = 43×22=946 fixo; kit R$ 200 é ajuda de custo, não cesta básica
---

# Benefícios Torres — VR fixo R$ 946 e ajuda R$ 200

**Regra (decisão do dono 29/07/2026):**

1. **Vale Refeição** mensal é **fixo R$ 946,00** (= R$ 43/dia × 22 dias CCT).
   Não varia com feriados ou dias úteis reais do período filtrado.
2. Os **R$ 200** do kit vigilância são **ajuda de custo** (indenizatória),
   **não** cesta básica. Cadastros legados com `cesta_basica=200` e
   `ajuda_custo_mensal=0` são remapeados em runtime por `resolveCestaAjudaTorres`.
3. SIEMACO (Cesta Básica II por assiduidade) **não** é afetado — valores
   315/240/140 não entram no remap do kit.

**Total bruto (quadro Remuneração)** = só salário + periculosidade (+ HE/noturno
se lançados). VR e ajuda ficam no quadro Benefícios.
