## Relatório de Entrega — Reenviar medição (PR5B1_TX_SNAPSHOT_FROZEN_BILLING)

**Data:** 2026-08-17  
**Branch:** `cursor/fix-reenviar-boletim-frozen-ea3f`  
**Publicou?** Não

### Domínio / tipo
- Domínio dono: Boletim comercial (`boletim_approvals`) + snapshot `escort_billings`
- Tipo: SNAPSHOT comercial (camada 6)
- Reutilização: `COMMERCIAL_FROZEN_BILLING_STATUSES`, `REOPEN_APPROVED`, arquivamento `ARQUIVADO` (já usado em relatório-NF)

### Causa raiz
`create_boletim_approval_atomic` rejeita billings `APROVADA/FATURADO/FATURADA/PAGO` (`PR5B1_TX_SNAPSHOT_FROZEN_BILLING`).  
O Relatório de Faturamento enviava **todas** as OS do período (incluindo já aprovadas) e o “force” só pulava o check de UI — sem arquivar aprovação ativa nem reabrir APROVADA.

### Correção
- Pré-check amigável (409) listando OS aprovadas, com `canForce`
- Force: arquiva PENDENTE/APROVADO conflitantes → `REOPEN_APPROVED` nas APROVADA → novo snapshot
- Faturada/paga: 400 pedindo liberar refaturamento (não auto-libera)
- Front: confirma force no 409 de frozen

### Testes
`npx tsx --test server/lib/billing-frozen.test.ts`
