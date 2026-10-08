# RELATÓRIO DA ÚLTIMA EXECUÇÃO

**Data/hora local:** 2026-10-07 (UTC-3)
**Tarefa:** sincronismo OS → Boletim → Faturamento e referências OS/SM da MULTILOG
**Branch:** `dev`
**Ambiente validado:** desenvolvimento conectado ao Supabase configurado localmente
**PUBLICADO:** **NÃO para a correção de vencimento — publicação anterior em 2026-10-07**

## 1. Problema e causa raiz

`service_orders` é a fonte operacional da missão, mas a implementação local das
referências MULTILOG estava incompleta:

- não havia gate backend exigindo `multilog_os` e `multilog_sm` antes da
  aprovação interna, envio ao cliente, clique de aprovação do cliente ou
  faturamento direto;
- o Excel geral de `boletim-medicao.tsx` não incluía OS/SM;
- relatório e documentos usavam fallbacks locais capazes de esconder campo
  ausente;
- o total puro era importado pelo frontend a partir de `server/`, quebrando o
  build e mantendo acoplamento incorreto;
- boletim enviado usa `boletim_approvals.billing_snapshot` por regra. Um
  snapshot antigo não deve ser silenciosamente reescrito.

## 2. Arquitetura encontrada

| Etapa | Fonte / tabela | Endpoint / função | Tipo |
|---|---|---|---|
| Ordem de Serviço | `service_orders` | `PATCH /api/service-orders/:id` | FATO |
| Boletim interno | `service_orders` + `escort_billings` | `GET /api/boletim-medicao/os-concluidas` | FATO + SNAPSHOT financeiro |
| Relatório | `escort_billings` + `service_orders` paginada | `GET /api/escort/billings`, `GET /api/service-orders` | leitura |
| Excel do relatório | dataset `rowsData` da tela | `exportFormattedExcel` | apresentação |
| Enviar para aprovação | mesmas tabelas consultadas novamente no backend | `POST /api/boletim/enviar-aprovacao`, `generateBoletimExcel` | cria SNAPSHOT |
| Aprovação do cliente | `boletim_approvals.billing_snapshot` | `POST /api/boletim/aprovacao/:token/aprovar` | SNAPSHOT imutável após aprovação |
| Fatura/boleto | `invoices.description` + Asaas | `emitInvoiceAuto`, `asaasBoletoDescription` | cobrança |
| Nota | `invoices.description` + Focus NFe | `buildFocusNfsePayload` | satélite fiscal |
| E-mail financeiro | `invoices.description` | `buildNfClientEmail` | apresentação |

Relações: `escort_billings.service_order_id → service_orders.id`;
`boletim_approvals.billing_ids → escort_billings.id`;
`escort_billings.invoice_id → invoices.id`.

## 3. Correção

- Centralizadas normalização e obrigatoriedade em
  `shared/multilog-refs.ts`.
- Centralizado total/número oficial em `shared/boletim-totals.ts`;
  `server/lib/boletim-totals.ts` agora é somente compatibilidade.
- Gates `MULTILOG_REFS_REQUIRED` adicionados em:
  - aprovação interna (`server/routes/escort.ts`);
  - envio para aprovação e aprovação do cliente
    (`server/routes/boletim-approval.ts`);
  - geração direta de fatura (`server/asaas.ts`).
- Boletim interno passou a exibir/exportar OS do cliente e SM.
- Relatório não inventa mais referência pelo ID quando a coluna está vazia.
- Anexo, boleto, Focus NFe e e-mail usam as linhas `OS. ...` / `SM. ...`.
- O CNPJ continua vindo de `clients`; não foi criada coluna para Mooca.
- Paginação do relatório preservada: até 20 páginas de 1000 OS; backend de
  período usa `fetchAllSupabaseRows`.
- Cache: o writer da OS usa `invalidateRelatedQueries("service-order")`;
  Realtime observa `service_orders`, `escort_billings` e
  `boletim_approvals`.

## 4. Evidência real — TOR-0918

Antes:

- `service_orders.id=1312`, `os_number=TOR-0918`;
- `multilog_os=NULL`, `multilog_sm=NULL`;
- billing `APROVADA`, `fat_total=3930.58`, sem invoice;
- approval #136 `PENDENTE`, total `3930.58`;
- snapshot antigo: `os_number=OS-1312`, sem OS/SM.

Alteração controlada autorizada:

- `multilog_os=1312`;
- `multilog_sm=41128477`.

Depois:

- OS: `TOR-0918`, OS cliente `1312`, SM `41128477`;
- billing: permaneceu `APROVADA`, R$ 3.930,58;
- Excel de envio: encontrou `TOR-0918`, `1312`, `41128477`;
- boleto: contém `OS. 1312` e `SM. 41128477`;
- e-mail financeiro: contém OS e SM;
- Focus NFe: discriminação contém OS e SM;
- tomador: CNPJ do cadastro Multilog `60.526.977/0001-79`;
- nenhuma invoice/NF/boleto real foi emitida;
- approval #136 permaneceu `PENDENTE` e com snapshot original.

O e-mail/anexo já enviado não é mutável. Para enviar as novas referências, o
fluxo deve fazer reenvio explícito, arquivando o anterior conforme a regra
existente.

## 5. Arquivos desta entrega

- `shared/multilog-refs.ts` e teste;
- `shared/boletim-totals.ts`;
- `server/lib/boletim-totals.ts`;
- `server/routes/escort.ts`;
- `server/routes/boletim-approval.ts`;
- `server/asaas.ts`;
- `client/src/pages/admin/boletim-medicao.tsx`;
- `client/src/pages/admin/relatorio-faturamento.tsx`;
- testes de Asaas, Focus NFe e `server/lib/multilog-flow.test.ts`.

As colunas e a UI base já estavam no workspace local:
`shared/schema.ts`, `client/src/pages/admin/service-orders.tsx` e
`supabase/migrations/20261007200000_multilog_os_sm.sql`.

## 6. Banco / migrations

- DDL/migration executada nesta sessão: **NÃO**.
- Produção alterada: **NÃO**.
- DML controlado em desenvolvimento: somente TOR-0918/id 1312, preenchendo
  `multilog_os` e `multilog_sm`.

## 7. Testes

| Teste | Resultado |
|---|---|
| Multilog + Asaas + Focus + gates | 150/150 PASS |
| Prova real Excel/boleto/e-mail/nota | PASS |
| Build cliente + servidor + handlers | PASS |
| `git diff --check` | PASS |
| Suíte financeira selecionada | 49/50; falha preexistente: `billingElegivelParaBoletim` não exportada |
| `npm test` | não executa no Windows por usar `find` Unix |
| Runner Windows, 125 arquivos | executado; falhas preexistentes em WhatsApp, docs de senha e inventários/caminhos PR5B |
| `tsc` | falhas preexistentes amplas; nenhuma apontou os arquivos Multilog alterados |

Novas regressões identificadas: **0**.

### Correção complementar — TOR-0912

Ao calcular a cancelada pela tela, a RPC retornou
`PR5B1_TX_CONTRACT_MISMATCH`: a OS apontava para a tabela de 200 km, enquanto
`computeCanceladaBilling` selecionava corretamente a tabela ativa de 100 km/3h.
A rota `POST /api/boletim-medicao/calcular/:osId` agora alinha
`service_orders.escort_contract_id` antes da escrita atômica e restaura o
contrato anterior se a RPC falhar.

No ambiente de desenvolvimento, a tentativa solicitada foi concluída:

- TOR-0912: billing `CANCELADO`;
- contrato: `ORIGEM - BR x 100 KM`;
- total oficial: R$ 480,00;
- cobertura da 2ª quinzena: `ok=true`, nenhuma OS ausente ou não aprovada;
- teste específico: PASS; rota compilada; `git diff --check`: PASS.

### Correção complementar — recuperação do Realtime

O canal dedicado de `service_orders` / `escort_billings` podia entrar em
`CHANNEL_ERROR`, `TIMED_OUT` ou `CLOSED` sem marcar sua própria conexão como
inativa. O heartbeat acompanhava somente o socket geral; por isso ele podia
continuar saudável enquanto o relatório deixava de receber eventos.

`client/src/lib/queryClient.ts` agora mantém health/retry independente para o
canal operacional, com backoff, reconexão ao voltar a rede e nova assinatura
quando o canal fecha. As três tabelas estão na publicação
`supabase_realtime`; smoke real de UPDATE em `service_orders.id=1312` recebeu
o evento corretamente. Build: PASS.

### Correção complementar — vencimento do boleto Asaas

A data escolhida ao emitir a NF/cobrança agora é a fonte da verdade do
vencimento. Os cinco caminhos de criação de cobrança usam
`createAsaasPaymentWithDueDate`: após o `POST /payments`, o Torres compara a
data retornada pelo Asaas; se divergir, corrige a mesma cobrança e consulta
novamente antes de persistir ou enviar o boleto. Se o Asaas não confirmar, a
operação falha com mensagem explícita.

O vencimento inicial também recebe o marcador
`Vencimento definido na emissão pelo Torres`, fazendo o reconciliador empurrar
a data local para o Asaas em vez de substituir silenciosamente a data escolhida.
Auditoria read-only dos 30 boletos mais recentes: nenhuma divergência atual.
Testes da integração: 119/119 PASS; módulo `server/asaas.ts`: compilação PASS.

## 8. Riscos e pendências

- Approval #136 e seu e-mail antigo continuam históricos; reenvio é ação
  explícita ainda pendente.
- Produção recebeu o código no commit `6215e47d`.
- A suíte geral precisa ter o script `npm test` portável e as falhas
  preexistentes saneadas separadamente.
- A detecção de cliente permanece por nome contendo `MULTILOG`, regra já
  existente; eventual renomeação do cadastro exige revisão.

## 9. Rollback

Código: reverter apenas os arquivos listados nesta entrega.
Dado de teste: restaurar `service_orders.id=1312` para
`multilog_os=NULL, multilog_sm=NULL` somente com autorização explícita.
TOR-0912: não apagar billing/alterar contrato sem processo financeiro explícito.
Não apagar snapshot, billing ou histórico.

## 10. Próximo passo

Validar no navegador de produção o Realtime, o bloqueio Multilog e o reenvio
explícito do boletim pendente para gerar novo e-mail/anexo com OS e SM.

## 11. Publicação

- Commit funcional: `6215e47dfe057a558ca9ffdc9c0313fe45d6cd5c`
- `dev` e `main`: sincronizadas no commit funcional
- Vercel: `Deployment has completed`
- Deploy: https://vercel.com/grupotmsegs-projects/torres/nH6gm61Fh9sNENqajRUZaTnCA52A
- Migrações Multilog, vencimento e policy Realtime já constavam aplicadas no
  Supabase hospedado antes do deploy; não houve reaplicação manual.
