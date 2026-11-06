## Relatório de Entrega — Financeiro cancela OS, prorroga boleto e sincroniza Asaas/Focus

**Data:** 2026-11-06
**Branch:** dev
**Ambiente validado:** local (testes de helper). A policy de OS foi aplicada no banco.
**Publicou?** Não

### Reutilização
- Cancelamento da OS: modal e `validarCancelamentoOperador` / `computeCanceladaBilling` já existentes. O perfil financeiro passou a usar o mesmo PATCH, só com status `cancelada`.
- Vencimento: endpoint `POST /api/invoices/:id/change-due-date` e o modal do Relatório de NFs. Entrou o seletor de juros/multa e o perfil financeiro.
- Sincronismo: `reconcileAllInvoicesAsaas` e `syncFocusNfsesForInvoices`. O balde de 10 minutos passou a chamá-los. O de 15 minutos deixou de repetir a mesma reconciliação.

### O que foi alterado
- Financeiro vê a listagem de OS e o botão Cancelar (lista e detalhe). O modal continua exigindo início, fim, KM inicial, KM final, deslocamento e pedágio. No servidor, esse perfil não altera nenhum outro campo.
- No Relatório de NFs, o ícone de calendário (financeiro, admin e diretoria) abre a prorrogação: data DD/MM/AAAA, sem dia passado, e o interruptor “Cobrar juros e multa no recálculo?”. Com juros, o Asaas recebe só a `dueDate`. Sem juros, `interest` e `fine` vão zerados e o valor atual do boleto é reenviado. A fatura local, o selo de atraso e o Contas a Receber acompanham a resposta.
- A cada 10 minutos o cron reconcilia cobranças no Asaas e consulta na Focus as NFS-e em processamento ou cancelamento. Falha de uma nota não interrompe as outras.

### O que não foi alterado
- Regra da OS cancelada (tabela 100 km / 3 h) e da recusada (R$ 0).
- Valor bruto da NFS-e (`invoices.value`). O líquido do boleto vai para `net_value`.
- O motivo da prorrogação continua obrigatório no histórico da fatura.

### Arquivos
- `shared/perfis-acesso.ts`, `server/routes.ts`, `server/routes/service-orders.ts`
- `client/src/pages/admin/service-orders.tsx`, `client/src/pages/admin/relatorio-nf.tsx`
- `server/asaas.ts`, `server/lib/asaas-helpers.ts`, `server/lib/focus-nfe.ts`, `server/lib/focus-nfe-helpers.ts`
- `server/cron-jobs.ts`, `server/cron-buckets.ts`
- `supabase/migrations/20261106120000_financeiro_cancel_os.sql`

### Banco
- Policy `service_orders_financeiro_select` e `service_orders_financeiro_cancel` aplicadas.
- Permissão `service_orders` acrescentada ao perfil financeiro gravado.

### Testes
- `node --import tsx --test server/lib/asaas-helpers.test.ts server/lib/focus-nfe-helpers.test.ts` — 149 passaram.

### Risco e rollback
- O financeiro passa a abrir a tela de OS, mas o PATCH recusa qualquer coisa que não seja cancelar.
- Rollback: remover as duas policies, tirar `service_orders` do perfil e reverter os arquivos. O cron de 15 minutos pode voltar a chamar `runNfReconcileCron`.

### Próximo passo
- Publicar só se o proprietário pedir. Conferir na tela, com um usuário financeiro, o cancelamento de uma OS de teste e a prorrogação de um boleto em aberto.
