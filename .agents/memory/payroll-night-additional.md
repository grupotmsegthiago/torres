---
name: HE e adicional noturno = R$ 15,00/h fixo
description: Convenção unificada de cálculo de hora extra e adicional noturno em toda a folha (holerite, custo, RH/Ponto)
---

# HE e adicional noturno = R$ 15,00/h FIXO (ordem do dono 16/07/2026)

**Regra atual:** em TODO o sistema, hora extra e adicional noturno valem
**R$ 15,00 por hora, valor fixo** — `15 × horas`, independente do salário base.
Constantes `VALOR_HORA_EXTRA_FIXO` / `VALOR_HORA_NOTURNA_FIXO` em
`server/lib/payroll.ts`; `buildFolhaStats` (Control iD) usa as mesmas.

**Why:** ordem direta do dono em 16/07/2026 ("nas horas substituir tudo por
15,00 hora extra e noturna"), substituindo os modelos anteriores.

**Histórico:** noturno já foi ×0,20 (só prêmio), ×1,20 e ×1,80 (hora cheia,
26/06/2026, batia a planilha); HE já foi valorHora×1,6 (CCT). Todos abandonados
em 16/07/2026 pelo valor fixo.

**Como aplicar:**
- Muda em cascata a base tributável (INSS/IRRF/FGTS) e o custo no Balanço RH — esperado.
- Aplica-se SÓ ao pagamento/custo do funcionário; o faturamento do cliente
  (`valor_hora_extra` de contrato / escort_billings) é OUTRO fluxo — não tocar.
- Params `multiplicadorHE`/`multiplicadorAdicNot` viraram legado ignorado.
- Não voltar aos multiplicadores sem ordem explícita do dono.
