---
name: Boletim PENDENTE re-sincroniza com status da OS
description: Snapshot congelado do boletim de medição não pode ficar surdo a recusa/cancelamento pós-envio; elegibilidade de envio é validada no backend.
---

**Regra:** o snapshot "foto única" do boletim de medição (boletim_approvals.billing_snapshot) só vale enquanto o status das OSs não muda. Quando uma OS vira **recusada** ou **cancelada** depois do envio, todo boletim **PENDENTE** que a contém precisa ser re-sincronizado: recusada PERMANECE no boletim ZERADA (ordem do dono 20/07/2026 — R$0 em todos os componentes; total não muda), cancelada é recongelada com os valores atuais do billing (tabela 100 km). Boletim APROVADO nunca é tocado. Excel tem coluna STATUS e a coluna Nº prefere o os_number ATUAL da OS (o do billing pode estar stale "OS-nnn").

**Why:** boletim enviado ao cliente ficou com 59 OS / R$ 127 mil enquanto o Faturamento mostrava 45 OS / R$ 103 mil — 14 OSs foram recusadas após o envio e o snapshot manteve valor cheio. Cliente quase pagou R$ 24 mil a mais.

**How to apply:**
- Núcleo puro `rebuildApproval` + `resyncPendingBoletinsForServiceOrder` em `server/lib/boletim-resync.ts`; chamado nos DOIS caminhos que marcam recusada/cancelada (PATCH de service-orders e ação REJEITADA em escort). Novo caminho que mude status de OS deve chamar o resync também.
- Envio (`enviar-aprovacao`) valida elegibilidade no BACKEND via `billingElegivelParaBoletim` (boletim-totals): recusada ENTRA zerada, FATURADO/FATURADA/PAGO fora; canceladas entram. Nunca confiar na seleção do front.
- E-mail/Excel já enviados são imutáveis: corrigir dados + resync deixa o LINK de aprovação certo, mas o cliente só vê valor certo com um REENVIO (novo e-mail). Fix de código só vale em prod após o publish — reenvio antes do deploy recria boletim errado.
- Billing de OS cancelada ANTES da regra §8.1b pode estar sem HE do excedente (a tela de Faturamento recalcula por componentes e mostra maior que o snapshot); corrigir o billing e re-sincronizar, não "ajustar" o snapshot na mão.
