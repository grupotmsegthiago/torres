## Relatório de Entrega — APROVADA interna no envio de boletim

**Data:** 2026-08-17  
**Branch:** `cursor/fix-aprovada-interna-boletim-ea3f`  
**Domínio dono:** Faturamento / Boletim / Balanço  
**Tipo de dado:** Fato (`escort_billings.status`) · Snapshot (`boletim_approvals`)

### Decisão do proprietário

`APROVADA` é processo **interno** (OS conferida, pronta para enviar).  
Enviar medição ao cliente **não** muda esse status.  
Aprovação do cliente (`boletim_approvals`) é processo **separado**.  
No Balanço, `APROVADA` continua **Finalizado**.

### Reutilização

- Extensão de `billing-frozen.ts`, `boletim-approval.ts`, RPC `create_boletim_approval_atomic`
- Sem novo motor, tabela ou API

### Alterações

1. Migration `20260817221500_boletim_snapshot_allow_aprovada.sql` — snapshot bloqueia só `FATURADO|FATURADA|PAGO`
2. App: remove `REOPEN_APPROVED` no force; force só arquiva boletim conflitante
3. `APROVADA` entra em `sendable` na partição de envio
4. Governança `04` — esclarecimento APROVADA ≠ boletim do cliente
5. Migration `20260817223000_restore_aprovada_from_force_reopen.sql` — recuperação auditada

### Execução em produção (2026-08-17)

- RPC aplicada (bloqueio só faturada/paga) — confirmado via `pg_get_functiondef`
- **56** billings restaurados `A_VERIFICAR → APROVADA` via `FREEZE_COMMERCIAL` + audit `RESTORE_APPROVED_INTERNAL`
- `still_a_verificar` pós-restore = **0**
- Snapshots SWR `financial-dashboard*` / `operational-grid*` limpos

### Testes

- `server/lib/billing-frozen.test.ts` (11/11)

### Rollback

- Reverter RPC (voltar `APROVADA` no IN) + revert do app
- Restauração: não reabrir em massa sem decisão; audit trail preservado
