## Relatório de Entrega — Onde abastecer

**Data:** 3 de novembro de 2026, horário de Brasília
**Branch:** `cursor/fluxo-onde-abastecer-b534`
**Ambiente validado:** local, só na regra e nos arquivos públicos da ANP. A tela não foi aberta: neste ambiente não há `.env` nem login.
**Publicou?** Sim — `main` e `dev` em 03/11/2026, depois de integrar a NFS-e e a apólice do Mobi que já estavam no ar.

### Reutilização (D11 / P13)
- Busca realizada: abastecimento mobile, GPS, botões de rota da missão, `ticketlog_postos`, `haversineDistanceKm`
- Existente aproveitado: home mobile, lançamento em `/mobile/abastecimento`, padrão de rota com `requireAuth`, cron de segunda via `runBrtScheduledJobs`
- Algo novo criado? Sim. `ticketlog_postos` não tem coordenada nem preço. A pesquisa da ANP não existia no Torres.

### O que foi alterado
- Botão **Onde abastecer** na home do agente e tela `/mobile/onde-abastecer`
- O lançamento de abastecimento começa com o nome do posto sugerido, na mesma sessão
- Tabelas satélite `anp_fuel_prices`, `anp_station_quality` e `anp_cep_geo`
- Carga semanal na segunda, 04:20 BRT, e carga manual `POST /api/admin/anp-stations/sync`

### O que NÃO foi alterado
- Custo do abastecimento, regra dos 70%, fotos, TicketLog, balanço e boletim
- A nota oficial ANP de 0 a 5 não é calculada aqui. Sem ela, a tela não escreve "Nota ANP 5"

### Arquivos modificados
- `shared/anp-onde-abastecer.ts`, `shared/schema.ts`
- `server/lib/anp-onde-abastecer.ts`, `server/lib/anp-fiscal-xlsx.ts`
- `server/routes/anp-stations.ts`, `server/routes.ts`, `server/cron-jobs.ts`, `server/cron-buckets.ts`
- `client/src/pages/mobile/onde-abastecer.tsx`, `home.tsx`, `abastecimento.tsx`, `client/src/App.tsx`
- `docs/fluxo-onde-abastecer.md`

### Banco / migrations
- Sim, na subida do servidor, junto das outras tabelas garantidas em `ensureFinancialOriginColumns`: as três tabelas acima. Nada financeiro.

### Testes executados
| Comando / arquivo | Resultado |
|---|---|
| `npx tsx --test shared/anp-onde-abastecer.test.ts server/lib/anp-fiscal-xlsx.test.ts` | 8 pass |
| CSV real de set/2026 (gasolina e etanol) | 35.855 preços, 5.825 postos, 4.968 com os dois preços |
| Planilha real de fiscalização desde 2019 | 1.873 CNPJs marcados, 1.483 com infração de qualidade, 463 interditados |

### Resultados (negócio)
O agente ganha um botão que indica posto perto, com os dois preços da última pesquisa e histórico limpo de qualidade, e abre a rota no Waze ou no Google Maps. O custo continua sendo o que ele lançar em Abastecer.

### Regressões verificadas
- O card Abastecer permanece. O posto sugerido só preenche o campo se a pessoa passou por Onde abastecer nesta sessão.

### Segurança
- Secrets no diff? Não
- Webhook/auth/RLS tocados? A leitura exige login. A carga manual exige perfil admin.

### Backup / ponto de restauração
- Rollback: tirar o card da home e o agendamento das 04:20. As tabelas novas não alimentam custo.

### Riscos remanescentes
- O CSV não traz coordenada. O raio usa o CEP, até 40 endereços novos por abertura.
- "Cerca de X min" é estimativa a 25 km/h, não o trânsito da hora.
- A primeira carga só acontece na segunda de manhã, ou quando um admin chamar a sincronização. O âmbar só aparece com `mode === "empty"` e `emptyReason = not_loaded`. Cidade, raio e CEP em localização usam o outro aviso.

### Status consolidado
- Isolamento de domínio: satélite de consulta. Sem efeito em `vehicle_fueling`, conciliação TicketLog, boletim ou balanço.
- Cobertura: 8 testes passando. Incluem reprovação recente no XLSX (coleta simples fica de fora), descarte de gasolina aditivada com o preço mais recente de comum e etanol, semana de domingo a sábado, exigência dos dois preços com desempate por distância, e a distinção de `emptyReason` (cartão com preço não acende o âmbar).
- Homologação com login: não executada neste ambiente. Não há `.env` nem sessão. A branch ainda não foi publicada, então produção ainda não tem a rota nem as tabelas novas.

### Checklist de homologação (ambiente com login)

Pré-requisito: o ambiente já precisa estar com esta branch no ar. Sem isso, `POST /api/admin/anp-stations/sync` e `/mobile/onde-abastecer` não existem.

1. Carga inicial. Com perfil admin, `POST /api/admin/anp-stations/sync`. O JSON de sucesso traz `prices`, `stations`, `flagged` e `csvUrl`. `prices` e `stations` acima de zero e `flagged` com os CNPJs da fiscalização. Alternativa: esperar a segunda às 04:20 no horário de Brasília e conferir o mesmo preenchimento em `anp_fuel_prices` e `anp_station_quality`.
2. Antes da carga, em banco ainda sem qualidade conhecida. Abrir `/mobile/onde-abastecer` com GPS. O bloco `empty-not-loaded` (âmbar, “Histórico da ANP ainda não carregado”) aparece quando a cidade tem preço importado e `quality_known` ainda é falso, e também quando o país inteiro está com zero postos de qualidade conhecida (tabela vazia). Cidade sem nenhuma linha, depois que a base nacional já tem qualidade conhecida, cai em `empty-no-station`.
3. Fluxo com GPS depois da carga. O cartão `card-posto-principal` mostra distância, “cerca de” minutos (25 km/h), gasolina e álcool, e o selo `text-qualidade` dos últimos 2 anos. “Ver outros postos” (`button-ver-outros`) abre a lista; Fechar é `button-fechar-outros`.
4. Passagem para o lançamento. Tocar em Waze ou Google Maps grava o nome em `sessionStorage` (`torres.ondeAbastecer.stationName`). Voltar e abrir `/mobile/abastecimento`: o campo `input-station` (Posto / Local) vem com esse nome. A regra dos 70% e o R$/litro continuam só com o que for digitado na bomba. O preço da ANP não entra no custo.

Nenhum desses quatro passos foi clicado neste ambiente.
