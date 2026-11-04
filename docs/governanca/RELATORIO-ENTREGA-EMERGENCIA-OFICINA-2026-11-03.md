## Relatório de Entrega — Socorro de borracharia e mecânico

**Data:** 2026-11-03
**Branch:** `cursor/emergencia-oficina-b534`
**Commit(s):** ponta da branch
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `rankStations`, `rankHospitals`, `anp_station_quality`, `cnes_hospital`, Places Autocomplete, `googleMapsServerKey`, Overpass.
- Existente aproveitado: régua de 5 a 25 km, `haversineKm`, `pickRadiusStep`, `isInsideBrazil`, `isMunicipalCentroid`, `PosicaoConfirmada`, `loadGoogleMapsScript`, `requireAuth`, atalho do Waze.
- Algo novo criado? [ ] Não  [x] Sim — posto e hospital são listas oficiais gravadas. Borracharia e mecânico não têm lista nacional de estrada. Reusar a tabela da ANP misturaria preço e nota de qualidade. Não há tabela nova: a consulta nasce no toque e morre na resposta.

### Domínio e tipo do dado
- Domínio dono: apoio operacional de campo no celular.
- Tipo: Satélite. Não altera abastecimento, boletim, balanço nem `calcularEscolta`.

### O que foi alterado
- Botão Socorro, ao lado de Hospitais. Ao abrir, o celular manda o GPS uma vez.
- A consulta pede borracharia (`shop=tyres`) e mecânico (`shop=car_repair`) numa caixa em volta da posição. O menor degrau com resultado fica na tela.
- Autopeças e guincho isolado não entram. O ponto aceito abre o Waze.
- Se a consulta não responder, a frase é "A busca não respondeu" e o mapa do celular tenta de novo. Isso não vira "nenhum em 25 km".

### O que NÃO foi alterado
- Custo do abastecimento, NFS-e, regra Mobi, lista da ANP, lista do CNES.
- Guincho. Horas do ponto operacional.

### Arquivos modificados
- `shared/emergencia-oficina.ts`, `shared/emergencia-oficina.test.ts`
- `server/lib/emergencia-oficina.ts`, `server/routes/emergencia-oficina.ts`, `server/routes.ts`
- `client/src/pages/mobile/emergencia-oficina.tsx`, `client/src/pages/mobile/home.tsx`, `client/src/App.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando | Resultado |
|---|---|
| `npx tsx --test shared/emergencia-oficina.test.ts shared/hospitais-cnes.test.ts shared/anp-onde-abastecer.test.ts client/src/components/mobile/posicao-confirmada.test.ts` | 23 pass |
| Consulta real no GPS −23.42202, −46.86707 | degrau 10 km: Rubinho Pneus 8,3 km, Tonhão BORRACHARIA 8,5 km, Shop Car Pneus 9,9 km. Os três em Barueri. |

### Resultados
O vigilante pede borracharia ou mecânico só quando precisa, em volta do GPS, e segue no Waze. Não há carga da Receita.

### Segurança
- Secrets no diff? Não
- A leitura continua em `requireAuth`. Sem cron e sem gravação.

### Deploy
- Não publicado.

### Pendências
- Sem sessão de agente, a tela logada não foi aberta daqui.
- A lista só aparece no celular depois de publicar.

### Resumo executivo
1. O botão consulta na hora. Não guarda cadastro.
2. Borracharia e mecânico. Sem guincho e sem autopeças.
3. Não mexe no dinheiro do abastecimento.
