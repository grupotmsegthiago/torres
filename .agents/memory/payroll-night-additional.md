---
name: Adicional noturno = só o prêmio de 20%
description: Convenção unificada de cálculo do adicional noturno em toda a folha (holerite, custo, RH/Ponto)
---

# Adicional noturno = só o prêmio de 20% (não 1,20×)

**Regra:** em TODO o sistema, adicional noturno = `valorHora × 0,20 × horasNoturnas`
— apenas o prêmio de 20%, NUNCA `× 1,20`. As horas noturnas são subconjunto das
horas já cobertas pelo salário mensal; multiplicar por 1,20 pagaria a hora-base
duas vezes.

**Why:** CLT Art. 73 — o adicional noturno é um acréscimo de 20% sobre a hora
normal, não uma hora a 120%. Historicamente `server/lib/payroll.ts` (motor de
holerite, usado por `employees.ts` no contracheque e `fixed-costs.ts` no custo
fixo) usava `multiplicadorAdicNot = 1.2` (double-pay), enquanto `hr.ts` e o
Control iD usavam `× 0.20`. O dono decidiu explicitamente unificar tudo em 0,20.

**Como aplicar:**
- `payroll.ts`: default `multiplicadorAdicNot = 0.2`. Reduzir o adicional reduz em
  cascata o DSR (`(HE + adicNot) × diasDescanso/diasUteisDSR`) e a `baseTributavel`
  (INSS/IRRF/FGTS) — esperado e correto.
- `buildFolhaStats` (control-id.ts): usa `valorHora × (CCT.adicionalNoturnoPct ?? 20)/100 × horasNoturnas`.
- Aplica-se SÓ ao pagamento do funcionário / custo; o faturamento do cliente
  (billing-calc.ts / escort_billings) é outro fluxo e não foi tocado.
- Regressão: `server/lib/payroll.test.ts` (premio exato + paridade com Control iD
  + cascata DSR/base). Não voltar `multiplicadorAdicNot` para 1.2 sem ordem do dono.
