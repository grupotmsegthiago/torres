---
name: Boletim PENDENTE re-sincroniza com status da OS
description: Snapshot congelado do boletim de medição não pode ficar surdo a recusa/cancelamento pós-envio; elegibilidade de envio é validada no backend.
---

**Regra:** o snapshot "foto única" do boletim de medição (boletim_approvals.billing_snapshot) só vale enquanto o status das OSs não muda. Quando uma OS vira **recusada** ou **cancelada** depois do envio, todo boletim **PENDENTE** que a contém precisa ser re-sincronizado: recusada SAI do boletim (ids/snapshot/os_count/total), cancelada é recongelada com os valores atuais do billing (tabela 100 km). Boletim APROVADO nunca é tocado.

**Why:** boletim enviado ao cliente ficou com 59 OS / R$ 127 mil enquanto o Faturamento mostrava 45 OS / R$ 103 mil — 14 OSs foram recusadas após o envio e o snapshot manteve valor cheio. Cliente quase pagou R$ 24 mil a mais.

**How to apply:**
- Núcleo puro `rebuildApproval` + `resyncPendingBoletinsForServiceOrder` em `server/lib/boletim-resync.ts`; chamado nos DOIS caminhos que marcam recusada/cancelada (PATCH de service-orders e ação REJEITADA em escort). Novo caminho que mude status de OS deve chamar o resync também.
- Envio (`enviar-aprovacao`) valida elegibilidade no BACKEND via `billingElegivelParaBoletim` (boletim-totals): recusada fora (nem a R$0), FATURADO/FATURADA/PAGO fora; canceladas entram. Nunca confiar na seleção do front.
