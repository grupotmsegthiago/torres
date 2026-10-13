## Relatório de Entrega — Protocolo de volta na listagem

**Data:** 2026-10-13
**Branch:** `cursor/restore-protocolo-listagem-880f`
**Ambiente validado:** [x] local (teste de contrato)  [ ] preview  [ ] produção
**Publicou?** [x] Sim — fluxo `publicar.ps1` (merge `dev` → `main` e push), a pedido do dono em 13/10/2026.

### Reutilização (D11 / P13)
- Busca: `protocolo`, `4-PROT`, `handleUploadDoc`, `badge-prot-pend`, `POST /api/financial/transactions/:id/protocolo`.
- Existente aproveitado: botão de 08/09/2026 (`53b74904`), `handleUploadDoc`, rota já existente em `server/routes/escort.ts`, teste `server/lib/financeiro-protocolo-conferencia.test.ts`.
- Algo novo criado? [x] Não — o botão foi recolocado e o teste existente foi estendido.

### Causa raiz
- Em 01/10/2026, commit `45d85e2b` (`feat(operacao): vincular OS na grade e registrar ciencia da manutencao`) trocou o botão âmbar `4-PROT ?` da listagem por um texto cinza `4-PROT —`.
- O anexo ficou só na aba Aguardando aprovação. Lançamento já pago e aprovado, como o ticket de pedágio da Juliana, ficou sem lugar para inserir o protocolo.
- A API não mudou nesse commit e continua aceitando o arquivo em qualquer status, desde que o usuário seja admin ou diretoria.

### O que foi alterado
- Listagem de contas a pagar: sem protocolo, volta o botão `4-PROT ?`, que chama `handleUploadDoc(t.id, "protocolo")`.
- Texto do formulário: "também pode anexar depois na listagem".
- Teste trava o botão dentro da coluna Conferência e confirma que a rota não exige `AGUARDANDO_APROVACAO`.

### O que NÃO foi alterado
- Aprovação, recusa, cancelamento, status Pago e tick Conferido da diretoria.
- Atalho de protocolo que já existe na fila Aguardando aprovação.
- Boleto, NF, comprovante, valor, categoria e origem TicketLog.
- Descrição, observações, busca e cards da tela: o commit de 01/10 só mudou o visual; os `data-testid` continuam.
- Assinatura de contrato no celular e impressão em lote do Control iD: os botões saíram do diff daquele commit porque o arquivo foi reescrito, e os mesmos `data-testid` seguem em `contratos.tsx` e `control-id.tsx`.

### Auditoria do que mais podia ter se perdido
- Única ação de usuário que sumiu e não voltou: o `4-PROT ?` da listagem.
- O teste antigo passava depois da perda porque ainda achava `handleUploadDoc(t.id, "protocolo")` na outra aba.

### Arquivos modificados
- `client/src/pages/admin/financeiro.tsx`
- `server/lib/financeiro-protocolo-conferencia.test.ts`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `node --experimental-strip-types --test server/lib/financeiro-protocolo-conferencia.test.ts` | 6 pass / 0 fail |

### Resultados (negócio)
A Juliana volta a anexar o protocolo na mesma linha do lançamento, inclusive quando ele já está Pago e Aprovado.

### Regressões verificadas
- Tick de conferência continua sem gravar status PAGO (teste já existente).
- Rota de protocolo continua no bucket `comprovantes-pagamento` e não filtra por fila de aprovação.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Commit anterior da `main` no momento da branch.

### Deploy
- Publicado a pedido do dono em 13/10/2026. A Vercel faz o deploy da `main`.

### Pendências
- Conferir na tela logada, no ticket de pedágio da Juliana, que o `4-PROT ?` abre o seletor de arquivo. Este ambiente não tem login do financeiro.

### Gates G1–G17
- [x] G1 domínio: ledger `financial_transactions` (fato); `protocolo_url` é anexo desse fato
- [x] G2–G9 N/A: não mexe em motor, boletim, cancelada, recusada, cache ou RLS
- [x] G11 auditoria já existe na rota de upload
- [x] G12 changelog atualizado; regra de SSOT não mudou
- [x] G14 sem secrets
- [x] G16 revisão humana recomendada antes de publicar (tela financeira)
- [x] G17 reutilização do botão e da rota já existentes

### Resumo executivo
1. O protocolo sumiu da listagem em 01/10, dentro de um commit de operação.
2. O botão `4-PROT ?` voltou para despesa paga ou aprovada.
3. O teste agora quebra se esse botão sair da coluna Conferência de novo.
