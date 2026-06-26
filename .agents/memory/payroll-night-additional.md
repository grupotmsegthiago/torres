---
name: Adicional noturno = hora cheia 1,80× (modelo Torres)
description: Convenção unificada de cálculo do adicional noturno em toda a folha (holerite, custo, RH/Ponto)
---

# Adicional noturno = hora cheia 1,80× (modelo Torres)

**Regra atual (decisão do dono 26/06/2026):** em TODO o sistema o adicional
noturno é `valorHora × 1,80 × horasNoturnas` — hora cheia + 60% de HE + 20% de
adicional noturno. NÃO é mais só o prêmio de 20%.

**Why:** a planilha manual do dono (caso de referência validado 100%) paga a hora
noturna como hora extra noturna a 1,80× — o vigilante que vira a noite recebe a
hora cheia novamente acrescida dos adicionais, não só o prêmio. O dono decidiu
que o sistema TEM que bater com a planilha dele. Antes o sistema oscilou entre
`× 1,20` (double-pay) e `× 0,20` (só prêmio); ambos foram abandonados em favor de
`× 1,80`.

**Como aplicar:**
- Motor de folha e callers (holerite, custo, RH/Ponto) usam 1,80×. Mexer nisso
  muda em cascata a base tributável (INSS/IRRF/FGTS) e o custo no Balanço RH — esperado.
- Aplica-se SÓ ao pagamento do funcionário / custo; o faturamento do cliente
  (escolta/escort_billings) é outro fluxo e não foi tocado.
- DSR fica desligado no modelo Torres.
- Há regressão de teste no caso de referência. NÃO voltar para 0,20 nem 1,20 sem
  ordem explícita do dono.
