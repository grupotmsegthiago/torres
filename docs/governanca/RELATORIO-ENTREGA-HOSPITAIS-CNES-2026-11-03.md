## Relatório de Entrega — Hospitais do CNES

**Data:** 2026-11-03
**Branch:** `cursor/hospitais-cnes-b534`
**Commit(s):** ponta da branch
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `anp_station_quality`, `recommendStations`, `acceptMapPoint`, `rankStations`, `PosicaoConfirmada`, cron `minute` / `thirty-min`.
- Existente aproveitado: régua de 5 a 25 km, leitura do endereço no mapa do celular, frase da posição, faixa de CEP e cidade vizinha, criação de tabela no boot (mesmo caminho da ANP).
- Algo novo criado? [ ] Não  [x] Sim — a tabela `anp_station_quality` é posto e preço. Hospital não tem CNPJ de revenda nem nota de qualidade. Reusar essa tabela misturaria a frase "sem infração de qualidade" num hospital. Tabela nova `cnes_hospital`, satélite, sem latitude oficial gravada na carga.

### Domínio e tipo do dado
- Domínio dono: consulta de hospitais no celular.
- Tipo: Satélite. Não altera abastecimento, boletim, balanço nem `calcularEscolta`.

### O que foi alterado
- Carga do CSV diário do CNES. Na leitura de 3 de novembro de 2026 ficaram 6.746 hospitais: 2.914 públicos, 2.056 particulares, 1.776 filantrópicos; 5.029 atendem SUS.
- Tela Hospitais, ao lado de Onde abastecer, com régua, mapa, telefone e Waze.
- Cron diário às 06:40 no horário de Brasília, depois da publicação das 06:00. Se a tabela estiver vazia, tenta de novo a cada 10 minutos.

### O que NÃO foi alterado
- Custo do abastecimento, NFS-e, regra Mobi, lista da ANP.
- Borracharia, mecânico e guincho.

### Arquivos modificados
- `shared/hospitais-cnes.ts`, `shared/hospitais-cnes.test.ts`, `shared/ibge-municipios.ts`
- `server/lib/hospitais-cnes.ts`, `server/routes/hospitais.ts`, `server/routes.ts`
- `server/cron-jobs.ts`, `server/cron-buckets.ts`, `vercel.json`
- `client/src/pages/mobile/hospitais.tsx`, `client/src/pages/mobile/home.tsx`, `client/src/App.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [ ] Nenhuma
- [x] Tabela `cnes_hospital` criada no boot, como `anp_station_quality`. Sem arquivo de migration novo.

### Testes executados
| Comando | Resultado |
|---|---|
| `npx tsx --test shared/hospitais-cnes.test.ts shared/anp-onde-abastecer.test.ts client/src/components/mobile/posicao-confirmada.test.ts` | 19 pass |
| Leitura do CSV oficial de 03/11/2026 | 6.746 hospitais, acima do piso de 4.000 |

### Resultados
O vigilante passa a ter hospital e pronto-socorro oficiais na mesma régua do posto. O ponto só entra depois que o mapa lê o endereço.

### Segurança
- Secrets no diff? Não
- A leitura do celular continua em `requireAuth`. A carga manual continua em `requireAdminRole`.

### Deploy
- Não publicado.

### Pendências
- A lista só aparece no celular depois de publicar e da primeira carga.
- Sem sessão de agente, a tela logada não foi aberta daqui.

### Resumo executivo
1. Hospitais vêm do CNES, não de uma busca solta.
2. O mapa grava a coordenada. O arquivo do ministério não escolhe o pino.
3. Não mexe no dinheiro do abastecimento.
