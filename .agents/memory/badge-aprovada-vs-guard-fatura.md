---
name: Selo APROVADA vs guard de fatura
description: Selo do relatório é estrito (só aprovação real); elegibilidade/guard de quinzena mantém a regra antiga em função separada.
---

**Regra (ordem do dono, 20/07/2026):** o selo "Aprovada" no Relatório de Faturamento só aparece quando alguém clicou em Aprovar (billing.status === "APROVADA"). `getRelatorioStatus` NÃO tem mais o override "OS concluída + missão encerrada ⇒ APROVADA".

**Mas a elegibilidade pra fatura NÃO mudou (INTOCÁVEL #4):** o guard de quinzena do gerar-fatura usa `contaComoAprovadaParaFatura` (shared/constants/mission-status.ts), que preserva a regra antiga (A_VERIFICAR + OS concluída + missão encerrada não bloqueia). Teste que congela as duas semânticas: `shared/constants/quinzena-guard.test.ts`.

**Why:** dono viu "APROVADA" numa OS que ninguém aprovou; exibição e elegibilidade tinham a mesma função e mudar uma quebrava a outra (regressão pega em review).

**How to apply:** ao mexer em status de billing, nunca reunificar selo e guard; auditoria de aprovação grava `revisado_por = "Nome (email)"` + `revisado_em` no /revisar e a UI mostra "Aprovada por X em ...".
