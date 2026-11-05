## Relatório de Entrega — OS, viatura e equipe no cartão

**Data:** 2026-11-05
**Branch:** `cursor/os-viatura-equipe-7ab0`
**Commit(s):** ponta da branch
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `GET /api/vehicle-tracking`, `equipeDosCards`, `vinculoDaViatura`, avanço de missão em `mission.ts`, `driver_sessions`.
- Existente aproveitado: `vehicle_id`, `assigned_employee_id` / `assigned_employee_2_id`, passos de missão, sessão do condutor.
- Algo novo criado? [x] Sim — `shared/os-viatura.ts` só escolhe qual OS aberta manda no cartão. Sem tabela, motor de cobrança ou API nova.

### Domínio e tipo do dado
- Domínio dono: operação de campo / frota.
- Tipo: Fato operacional (`service_orders`) + leitura no cartão. Não altera billing.

### O que foi alterado
- Evidência na TMG0E84: TOR-1178 (Claudeano/Reinaldo, em trânsito, missão iniciada) e TOR-1215 (Jeandro/Hermison, Omega, check-in sem início) compartilhavam `vehicle_id = 17`. O cartão pegava TOR-1215 e a sessão colocava Claudeano/Reinaldo em cima — formulário e painel ficavam cruzados.
- A escolha da OS ativa passa a preferir missão iniciada, passo mais avançado e equipe da sessão.
- Segunda missão na mesma viatura não avança enquanto a primeira estiver em curso.
- Vincular OS usa só a equipe da OS ativa do cartão.

### O que NÃO foi alterado
- Billing, boletim, `calcularEscolta`, NFS-e.
- Quem está gravado em cada OS (agentes da TOR-1215 e da TOR-1178).
- Dado em produção da TOR-1215: o `vehicle_id` continua 17 até a operação trocar/limpar a viatura nessa OS (MCP de SQL é só leitura).

### Arquivos modificados
- `shared/os-viatura.ts`, `shared/os-viatura.test.ts`
- `server/routes/operational.ts`, `server/routes/mission.ts`
- `client/src/pages/admin/operational-grid.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|---|---|
| `npx tsx --test shared/os-viatura.test.ts` | 3 pass |

### Resultados (negócio)
O cartão da TMG0E84 passa a mostrar a OS que realmente está em curso com a equipe certa; o formulário deixa de misturar Omega com Claudeano/Reinaldo.

### Regressões verificadas
- Duas OS no mesmo dia na mesma viatura (uma só agendada) continuam permitidas; só a em curso manda no cartão.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter o commit da branch. Sem migration.

### Deploy
- Não publicado.

### Evidências
- Consulta: vehicle 17 = TMG0E84; TOR-1178 e TOR-1215 ambas `em_andamento`; sessão ativa Claudeano/Reinaldo.
- Teste unitário cobre o caso TOR-1178 vs TOR-1215.

### Pendências
- Na operação: na TOR-1215, limpar ou trocar a viatura (ainda aponta para TMG0E84 no banco). Sem isso o avanço da TOR-1215 fica bloqueado de propósito até a viatura mudar.

### Gates G1–G17
- [x] N/A justificado — correção operacional de vínculo OS↔viatura; sem dinheiro.

### Resumo executivo (3 linhas)
1. Duas OS abertas na mesma viatura misturavam número e equipe no cartão.
2. Agora manda a OS em curso; a outra não avança na mesma viatura.
3. Formulário e Vincular OS acompanham a mesma OS do cartão.
