## Relatório de Entrega — Conferência da NFS-e antes de emitir

**Data:** 3 de novembro de 2026, horário de Brasília
**Branch:** `cursor/nfse-nacional-focus-b534`
**Ambiente validado:** local, só na regra do texto e do payload. Nenhuma nota foi emitida na Focus. A tela de faturas não foi aberta: este ambiente não tem login.
**Publicou?** Não

### Domínio e tipo do dado
- Domínio dono: fiscal / NFS-e (satélite Focus).
- A descrição conferida é o texto enviado na DPS. Não é fato comercial da fatura.
- `invoices.description` continua sendo a descrição comercial (período do boleto e do e-mail).

### Reutilização (D11 / P13)
- Busca realizada: `emit-nfse`, `buildFocusNfsePayload`, `buildServicoDiscriminacao`, `service_orders`, `controle`, `pedido de compra`, `processo_omega`, `gtm_number`, `multilog_os`.
- Existente aproveitado: a mesma rota `POST /api/invoices/:id/emit-nfse`, a mesma trinca fiscal, o mesmo `Dialog` / `Select` / `Textarea` da tela de faturas, `multilogRefsForOrder`.
- Algo novo criado? O texto padrão da DPS (`shared/nfse-descricao.ts`) e a prévia `GET /api/invoices/:id/nfse-preview`. Não há coluna de controle nem de PO para reutilizar. Não foi criada tabela nem coluna.

### O que foi alterado
- Ao clicar em Emitir NFS-e, abre o modal de conferência já preenchido.
- O seletor oferece Escolta (`110301` / NBS `1.1802.30.00` / `07897`) e Vigilância (`110201` / NBS `1.1802.50.00` / `07870`). A troca atualiza o prefixo `Ref. escolta armada` / `Ref. vigilância` só enquanto esse prefixo não foi editado.
- A descrição sugerida usa o período da fatura (ou as datas da OS, ou o mês do vencimento) e junta número da OS, SM, `processo_omega`, `gtm_number` e PO/controle já escritos na descrição ou nas observações.
- No final entram a frase do Simples Nacional do boleto e, quando `valor_inss_retido` é maior que zero, a linha de retenção do Anexo IV. Dados bancários já escritos na fatura vão junto. O financeiro pode apagar ou editar isso no modal.
- O POST aceita `{ category, descricao_servico }`. Sem esses campos, a automação (relatório, retry, resolver erro) continua emitindo com a categoria inferida e a descrição padrão.
- Categoria explícita vale mesmo quando a fatura mistura OS ou não tem tipo.
- A descrição passa por sanitização: sem `<`, `>`, `&` nem caractere de controle, no máximo 2.000 e no mínimo 10.
- O histórico da escolha fica na auditoria da emissão. A descrição comercial da fatura não é reescrita.

### O que NÃO foi alterado
- Valor da fatura, boleto, e-mail, boletim e balanço.
- `buildServicoDiscriminacao` do boleto, com os textos de INSS e Simples.
- Colunas de `invoices`. A trinca fiscal da Beatriz. Consulta e cancelamento da nota antiga na Paulistana.

### Arquivos modificados
- `shared/nfse-descricao.ts`
- `server/lib/focus-nfe-helpers.ts`, `server/lib/focus-nfe-helpers.test.ts`, `server/lib/focus-nfe.ts`, `server/asaas.ts`
- `client/src/pages/admin/faturas.tsx`
- `.agents/memory/focus-nfe-satelite.md`

### Banco / migrations
- Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|---|---|
| `npx tsx --test server/lib/focus-nfe-helpers.test.ts server/lib/asaas-helpers.test.ts` | 147 pass |

### Resultados (negócio)
O financeiro escolhe a categoria e ajusta a descrição antes do POST. Quem emite sem abrir o modal continua na regra automática.

### Regressões verificadas
- Payload sem descrição informada gera `Ref. escolta armada (período)` e não regrava a descrição da fatura.
- Categoria explícita de vigilância substitui a trinca mesmo com OS dos dois tipos.
- Texto com `<`, `>`, `&` e controle é limpo; acima de 2.000 é cortado sem perder o rodapé legal; abaixo de 10 é recusado.
- Fatura sem INSS retido não leva a linha do Anexo IV. Fatura com retenção leva.

### Segurança
- Secrets no diff? Não
- A prévia e a emissão seguem `requireAdminRole`, a mesma trava da rota que já existia.

### Backup / ponto de restauração
- Rollback: tirar o modal e ignorar `category` / `descricao_servico` no POST. A descrição comercial da fatura não muda com esta entrega, então não há texto comercial para restaurar.

### Pendências
- Não há coluna de controle do cliente nem de pedido de compra. O controle da sugestão vem de `processo_omega` e `gtm_number`. O PO vem do texto já salvo na fatura.
- Nenhuma emissão real foi feita. O Ambiente Nacional no painel da Focus continua sendo um passo humano.

### Resumo executivo
1. Emitir NFS-e abre a conferência antes de enviar a nota.
2. A sugestão já traz período, OS e os controles que o Torres guarda hoje.
3. Sem o modal, a emissão automática segue funcionando.
