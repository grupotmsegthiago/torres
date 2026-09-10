## Relatório de Entrega — Faturamento: esconder ciclo ainda no prazo

**Data:** 2026-09-10
**Branch:** dev
**Ambiente validado:** [x] testes unitários locais  [ ] preview  [ ] produção
**Publicou?** [ ] Não

### Reutilização (D11 / P13)
- Extensão de `server/lib/faturamento-controle.ts` e `periodClosed` em `shared/billing-cycle.ts`. Sem tela nova, sem tabela, sem segundo motor.

### O que foi alterado
- OS de ciclo ainda vigente (ex.: quinzena 01–15 com hoje 10/09) deixa de aparecer em “O que está errado”, não pinta o semáforo de crítico e não entra nos KPIs de atraso.
- Depois que o ciclo fecha (16/09 na 1ª quinzena), volta a aparecer se faltar faturar/aprovar.

### O que NÃO foi alterado
- Gate do boletim, `calcularEscolta`, snapshot aprovado, invoices, Balanço.

### Arquivos modificados
- `server/lib/faturamento-controle.ts` (+ testes)
- `client/src/pages/admin/faturamento.tsx`
- `shared/billing-cycle.test.ts`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/billing-cycle.test.ts server/lib/faturamento-controle.test.ts` | pass (15) |

### Resultados (negócio)
A Diretoria vê só o que já passou do prazo do cadastro do cliente. Missão do dia 09/09 em cliente quinzenal permanece “tudo certo” até 15/09.

### Segurança
- Secrets no diff? [x] Não

### Deploy
- Não publicado (aguardar pedido).
