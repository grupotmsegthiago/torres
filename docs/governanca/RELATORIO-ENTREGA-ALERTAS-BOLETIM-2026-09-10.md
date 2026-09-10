## Relatório de Entrega — Alertas só com OS fora de boletim/fatura

**Data:** 2026-09-10
**Branch:** dev
**Publicou?** [ ] Não (publicar em seguida)

### Reutilização
- Estende `billing_alerts` + `boletim_approvals` PENDENTE/APROVADO + `isRecusadaOs`. Sem tabela nova.

### O que foi alterado
- Caixa de alertas da Diretoria some se a OS já está em boletim, já tem fatura ou é recusada.
- Texto passa a listar só as OS que realmente ficaram de fora.
- Cron deixa de criar (e resolve) esses alarmes falsos.

### O que NÃO foi alterado
- Motor de preço, snapshot de boletim, invoices.

### Arquivos
- `server/lib/billing-alert-coverage.ts` (+ teste)
- `server/lib/billing-alert-live.ts`
- `server/routes/controle-faturamento.ts`, `server/routes/escort.ts`, `server/cron-jobs.ts`

### Testes
| Comando | Resultado |
|---------|-----------|
| `npx tsx --test server/lib/billing-alert-coverage.test.ts server/lib/faturamento-controle.test.ts shared/billing-cycle.test.ts` | pass (18) |
