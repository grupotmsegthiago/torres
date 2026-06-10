---
name: Boletim/Faturamento por status de OS
description: Regra de exibição de valor por status nas telas Boletim de Medição e Relatório de Faturamento
---

Nas telas financeiras de medição/faturamento, o valor exibido por OS segue o status (§8.1/§8.4 INTOCÁVEL):
- **recusada** → R$ 0,00 sempre (operacional não atendeu).
- **cancelada** → acionamento + extras (cliente cancelou após acionamento). Usa `billing.fat_total` (já preserva acionamento+extras), com fallback para soma de componentes e `contractValues.valor_acionamento`.
- **demais** → `fat_total` ou soma dos componentes do billing.

**Why:** O Boletim (`getBillingTotal` + célula de valor da linha) zerava `cancelada` junto com `recusada`, divergindo do Relatório de Faturamento (que sempre tratou cancelada=acionamento+extras) e de §8.4 (canceladas entram no Total p/ Faturamento). Canceladas em produção têm `fat_total` preservado (ex.: acionamento 480 + HE + KM = 1664,87).

**How to apply:** Qualquer regra de valor-por-status deve ser idêntica nas duas telas. Mudança é só de exibição — NÃO recalcular billing nem tocar `calcularEscolta`. Trocar a tabela de preços de uma OS NÃO recalcula o billing (campo de contrato não está em `billingRelevantFields`), então Boletim/Faturamento, que mostram `fat_*`, só mudam via recálculo explícito — não adicionar auto-recalc sem ordem do dono (§8).
