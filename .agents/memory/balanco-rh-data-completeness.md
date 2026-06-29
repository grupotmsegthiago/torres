---
name: Balanço RH baixo = dado faltando, não bug de fórmula
description: Por que o "RH · Folha Real" do Balanço Gerencial não bate com a planilha manual do dono.
---

# RH · Folha Real (Balanço) ≠ planilha manual do dono

O card "RH · Folha Real" soma, por funcionário ATIVO, o `custoTotalEstimado` (vencimentos
+ benefícios + encargos patronais) calculado a partir de **dados reais lançados**:
salário cadastrado em `employee_salaries` + horas (HE/noturno) vindas do **ponto real**
(Control iD / `jornada_calculos`). NÃO é projeção de mês cheio.

**Quando o dono diz "está baixo / não bate com minha planilha", a causa quase sempre é
dado incompleto, não erro de cálculo:**
1. **Salário não cadastrado** — funcionário ativo sem linha em `employee_salaries` entra
   com base R$ 0 (só aparecem os benefícios). Conferir com script que lista ativos × salário.
2. **Ponto incompleto** — HE/noturno só existem onde há batidas sincronizadas; quem não bateu
   ponto no mês fica sem hora extra. A planilha do dono é projeção (horas estimadas à mão).

**Why:** a fórmula já confere onde o dado é completo — ex.: funcionário com ponto cheio dá
vencimentos IGUAIS ou levemente MAIORES que a planilha (o ponto registra mais horas que a
estimativa). Mexer na fórmula pra "subir o total" seria mascarar buraco de dado.

**How to apply:** antes de tocar payroll.ts/buildFolhaStats por "número baixo", rodar
diagnóstico por funcionário (base/peric/HE/noturno/horas/dias) e cruzar ativos × employee_salaries.
Se faltar salário, cadastrar (mirror do kit CCT: `base_salary` é SEM periculosidade —
2.565,31 ×1,3 = 3.334,90; peric entra via `periculosidade_pct`). Se faltar ponto, é sync/lançamento,
não código.
