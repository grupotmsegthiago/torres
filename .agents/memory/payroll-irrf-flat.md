---
name: IRRF = 22% flat sobre o bruto (modelo Torres)
description: O sistema NÃO usa tabela progressiva de IRRF; aplica 22% direto sobre o total tributável
---

# IRRF = 22% flat sobre o bruto (modelo Torres)

**Regra (decisão do dono 26/06/2026):** o IRRF da folha é `baseTributavel × 22%`
— alíquota fixa direto sobre o bruto (salário c/ peric + HE + noturno). NÃO usa a
tabela progressiva oficial, NÃO deduz INSS nem dependentes da base.

**Why:** o dono quer que a folha do sistema bata com a planilha manual dele. Ele
adota a MÉDIA do recolhimento real (que varia ~18 a 27,5%) como 22% fixo aplicado
sobre o bruto. A planilha manual antiga tinha um erro de célula que aplicava o 22%
só sobre o adicional noturno; o certo é 22% sobre o BRUTO total.

**FGTS NÃO desconta do líquido** (mesma decisão): FGTS é depósito do empregador.
Líquido = `baseTributavel − INSS − IRRF − VT` (sem FGTS). A planilha antiga
descontava FGTS por engano; corrigido.

**Como aplicar:**
- Motor de folha: modo IRRF "flat" 22% é o default; o modo progressivo continua
  existindo mas não é o default. FGTS fora do líquido é o default.
- Os callers de folha (holerite, custo, RH/Ponto) refletem isso: IRRF flat,
  líquido sem FGTS, FGTS só informativo. INSS continua 12% flat.
- Há regressão de teste no caso de referência. NÃO voltar a IRRF progressivo nem
  reintroduzir FGTS no líquido sem ordem explícita do dono.
