## Relatório de Entrega — Atualização do painel só com o status do aplicativo

**Data:** 6 de novembro de 2026
**Branch:** `cursor/atualizacao-status-vigilante-003b`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `POST /api/mission/update`, foto e avanço em `server/routes/mission.ts`, fila não lida do painel, `cron-whatsapp-forward.ts`.
- Aproveitado: a mesma `mission_updates` e o mesmo aviso. A distinção de texto de sistema já existia no resumo do WhatsApp (`🔄` / `📷` / ajuste manual).
- Algo novo criado? [x] Sim — `shared/atualizacao-status.ts` só classifica a mensagem. Sem tabela e sem motor de cobrança.

### Domínio e tipo do dado
Operação de campo. A atualização de status é fato (`mission_updates`, escrita pelo aplicativo). Foto e etapa continuam fato, no histórico. O aviso do painel é projeção. Não altera boletim, balanço nem `calcularEscolta`.

### O que foi alterado
Foto de checklist e avanço de etapa gravavam a mesma fila não lida do status. O painel tratava as três como atualização, e a foto no meio da viagem ainda podia ir ao grupo do cliente.

Agora só o texto de "Enviar Atualização" entra no aviso, na carta, na coluna do mapa e no botão de atualização recente. A coluna continua mostrando status não lido de OS que saiu da frota. Foto e etapa ficam no histórico, já lidas. O grupo recebe o status com foto e o card de fim de missão. Foto de viatura, local e hodômetro intermediário não vai.

### O que NÃO foi alterado
O histórico da OS, o formulário, a rota e o botão de WhatsApp do aviso. Quem já leu uma atualização continua com `read_by_admin = 1`.

### Arquivos modificados
- `shared/atualizacao-status.ts`, `shared/atualizacao-status.test.ts`
- `server/routes/mission.ts`, `server/routes/operational.ts`
- `server/cron-whatsapp-forward.ts`, `server/cron-whatsapp-forward-dedup.test.ts`
- `client/src/pages/admin/operational-grid.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando | Resultado |
|---|---|
| `npx tsx --test shared/atualizacao-status.test.ts server/cron-whatsapp-forward-dedup.test.ts` | 17 pass / 0 fail |

### Resultados (negócio)
O painel avisa quando o vigilante manda o status no aplicativo. Foto e troca de etapa deixam de abrir o mesmo aviso.

### Complemento — dia operacional
Mensagem de ontem ainda não lida voltava na coluna e no aviso. A fila do painel agora só traz status do dia (America/Sao_Paulo). "Marcar como lida" grava `read_by_admin = 1` e a transmissão não reabre. Fechar o aviso com × só esconde nesta tela; a carta segue até a equipe marcar como lida.

### Riscos
Linhas antigas de foto e etapa que ainda estão não lidas saem da fila pelo texto. Não são apagadas. Mensagem de ontem permanece no histórico da OS.

### Rollback
Reverter o commit. A fila volta a tratar foto e etapa como atualização.
