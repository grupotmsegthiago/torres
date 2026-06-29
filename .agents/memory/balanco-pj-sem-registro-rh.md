---
name: PJ/sem-registro no custo de RH (Balanço)
description: Como fazer um custo que estava em fixed_costs aparecer no RH do Balanço com o valor flat (sem encargos), e periculosidade para administrativo/limpeza.
---

# Mover custo de pessoa para o RH do Balanço Gerencial

O bloco "RH·Folha Real" do Balanço (endpoint `/api/fixed-costs/rh-summary`) soma
`buildFolhaStats(...).custoTotalEstimado` de cada funcionário ATIVO (filtro `isAtivo`).
Para uma pessoa aparecer no RH ela precisa ser `employees` (status ativo) + ter linha em
`employee_salaries`. Não basta estar em `fixed_costs`.

## Pessoa "sem registro" / PJ (custo flat, sem encargos)
- Setar `employees.tipo_contratacao = "fixo"` → `buildFolhaStats` trata como NÃO-CLT:
  zera FGTS, INSS patronal, seguro de vida e `encargosPctEfetivo`. (lógica `isClt` em `server/control-id.ts`.)
- Criar `employee_salaries` com `periculosidade_pct=0`, `encargos_pct=0`,
  `vale_refeicao_diario=0`, `cesta_basica=0`, demais benefícios 0 → `custoTotalEstimado = base cheia`.
- Desativar o `fixed_costs` correspondente (`active=false`) para não contar duas vezes.

## Periculosidade só p/ vigilante
- Administrativo/Limpeza (Adm, Auxiliar de Limpeza) → `periculosidade_pct=0`.
  O cadastro automático ("defaults CCT vigente") grava 30% — ERRADO para não-vigilante,
  infla o custo 30%. **Why:** ordem do dono (29/06/2026): periculosidade não se aplica a admin/limpeza.

## CLT administrativo
- Mantém `tipo_contratacao="clt"`; recebe encargos (FGTS 8% + INSS patronal 20%) e benefícios
  (VR diário, cesta) sobre a base → custo de RH fica MAIOR que a base. Só `periculosidade_pct=0`.
  **How to apply:** se o dono quiser o CLT sem VR/cesta, zerar esses campos no salário.

## Proração
- `buildFolhaStats` rateia base por dias decorridos da competência (ciclo 26→25). Mês fechado
  (period end já passou) ⇒ `fatorRateio=1` (valor cheio). Mês corrente ⇒ proporcional.
