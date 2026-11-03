## Relatório de Entrega — Onde abastecer com a base vazia

**Data:** 3 de novembro de 2026, horário de Brasília
**Branch:** `cursor/anp-base-vazia-b534`
**Ambiente validado:** regra local e contagem no banco. A tela do celular não foi aberta: neste ambiente não há login.
**Publicou?** Sim — `main` e `dev` em 03/11/2026, horário de Brasília. As tabelas seguem vazias: a conexão SQL deste ambiente é somente leitura, e aqui não há chave do serviço para chamar a carga.

### Reutilização (D11 / P13)
- Busca realizada: `recommendStations`, `isAnpBaseNotLoaded`, `parseAnpPriceCsv`, `fiscalFlagsFromXlsx`, `syncAnpReference`, `anp_station_quality`
- Existente aproveitado: o mesmo parser do CSV e da planilha de fiscalização, a mesma tela e as mesmas três tabelas
- Algo novo criado? Não. Sem tabela, sem API e sem segundo motor

### Domínio e tipo do dado
- Domínio dono: consulta "Onde abastecer"
- Tipo: satélite. Não é fato de abastecimento, não entra em `vehicle_fueling`, TicketLog, boletim ou balanço

### O que foi alterado
- Cidade sem nenhuma linha e país sem posto com `quality_known` responde `not_loaded` (cartão âmbar). Antes a tabela vazia caía em "Nenhum posto com histórico limpo neste raio."
- Cidade sem posto, depois que a base nacional já tem qualidade conhecida, continua `no_station`
- Posto ainda sem coordenada é buscado pelo endereço. O CEP da BrasilAPI fica como reserva
- A carga continua a mesma de `syncAnpReference`. Este ambiente não gravou preço nem qualidade.

### O que NÃO foi alterado
- Raio de 5 km, custo do abastecimento, regra dos 70%, nota ANP 0–5 (não é inventada)
- NFS-e e a apólice do Mobi

### Causa
- `anp_station_quality` e `anp_fuel_prices` estavam com 0 linhas. `recommendStations` devolvia `no_station` antes de olhar se a base nacional existia. A frase da captura é essa.
- No CEP de São Paulo, a BrasilAPI devolve o centro do município (`-23.5475, -46.63611`) para a maior parte dos códigos. Pirituba fica fora dos 5 km desse ponto.

### Arquivos modificados
- `shared/anp-onde-abastecer.ts`, `shared/anp-onde-abastecer.test.ts`
- `server/lib/anp-onde-abastecer.ts`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- `docs/governanca/RELATORIO-ENTREGA-ONDE-ABASTECER-2026-11-03.md` (o passo 2 da homologação)

### Banco / migrations
- Nenhuma tabela nova e nenhuma linha gravada daqui. `anp_station_quality`, `anp_fuel_prices` e `anp_cep_geo` continuam com 0 linhas.

### Testes executados
| Comando / arquivo | Resultado |
|---|---|
| `npx tsx --test shared/anp-onde-abastecer.test.ts server/lib/anp-fiscal-xlsx.test.ts` | 10 pass |

### Resultados (negócio)
Quem abrir Onde abastecer com a base ainda vazia vê que o histórico não foi carregado, em vez de "nenhum posto neste raio". O posto só aparece depois da carga (admin ou segunda às 04:20). O valor lançado em Abastecer continua sendo o da bomba.

### Segurança
- Secrets no diff? Não
- Webhook/auth/RLS tocados? Não

### Backup / ponto de restauração
- Rollback do código: voltar a branch. As tabelas podem ser esvaziadas sem afetar custo: `DELETE FROM anp_fuel_prices; DELETE FROM anp_station_quality; DELETE FROM anp_cep_geo;`

### Riscos remanescentes
- O endereço longo às vezes cai no meio da rua, não no número. O raio de 5 km usa esse ponto.
- "Cerca de X min" segue a 25 km/h.
- Sem a carga, o cartão segue vazio. Com este código no ar, o aviso é o âmbar de histórico não carregado.
