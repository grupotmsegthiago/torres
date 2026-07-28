---
name: INSS por faixa, IRRF 0%, FGTS fora do líquido
description: Modelo Torres de deduções do funcionário (planilha do dono 28/07/2026)
---

# Deduções do funcionário — modelo Torres (28/07/2026)

- **INSS**: alíquota POR FAIXA do salário mensal (base + periculosidade, SEM
  HE/noturno), aplicada DIRETO sobre o salário, sem parcela a deduzir.
  Faixas: ≤1.621→7,5%; ≤2.902,84→9%; ≤4.354,27→12%; acima→14%
  (`calcularInssPorFaixaSalario` em server/lib/payroll.ts). Ex: 3.334,90→12%→400,19.
  Substituiu o 9% flat (que por sua vez substituiu 12%).
- **IRRF**: 0% (sem tabela progressiva).
- **FGTS**: 8% sobre vencimentos, informativo — NÃO desconta do líquido.
- **VT**: 6% só CLT administrativo com VT configurado; vigilante sem VT.

**Why:** planilha oficial do dono; ele validou Edivando INSS=400,19.
**How to apply:** vale em buildFolhaStats E calcularFolha (flat mode); "progressivo"
continua sendo a tabela oficial. Atenção: Moacir antes batia com 9% (300,14) —
com faixa vira 400,19; dono ciente da regra nova.
