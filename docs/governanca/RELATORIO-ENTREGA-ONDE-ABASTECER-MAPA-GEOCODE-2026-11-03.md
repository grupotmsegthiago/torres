## Relatório de Entrega — O mapa lê a latitude do posto

**Data:** 2026-11-03
**Branch:** `cursor/onde-abastecer-mapa-geocode-b534`
**Commit(s):** ponta da branch `cursor/onde-abastecer-mapa-geocode-b534`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim (quando/como)

### Reutilização (D11 / P13)
- Busca realizada: `google.maps.Geocoder` já usado em `places-autocomplete.tsx` e `MapaRotaOs.tsx`; `loadGoogleMapsScript`; `rankStations` / `pickRadiusStep`; tabelas `anp_cep_geo` e `anp_station_quality`; `GET /api/mobile/onde-abastecer`.
- Existente aproveitado: o mapa que já confirma o GPS no celular, a régua e o upsert de CEP. A chave do mapa é restrita ao site, então a leitura fica no aparelho.
- Algo novo criado? [x] Não  [ ] Sim — inviabilidade: nenhuma tabela, rota ou motor novo. Funções puras `acceptMapPoint`, `acceptClientPin` e `rankFromCoordinates` estendem a regra que já existia.

### Domínio e tipo do dado
- Domínio dono: consulta Onde abastecer.
- Tipo: Satélite. Não altera custo de abastecimento, TicketLog, boletim, balanço nem `calcularEscolta`.

### Causa raiz
Produção depois da publicação `53618b6a`: 5.940 postos, 0 latitudes, 0 linhas em `anp_cep_geo`, 0 em Santana de Parnaíba, 20 em Barueri. O servidor não gravou o que Photon/Nominatim devolveriam. A tela fechava sem posto. Um modelo de texto não é fonte da coordenada.

### O que foi alterado
- A resposta sem posto na régua manda até 8 endereços limpos (`toLocate`), com preço da pesquisa.
- O celular lê esses endereços no Geocoder do mapa. Aceita ROOFTOP e RANGE_INTERPOLATED. GEOMETRIC_CENTER ou resultado parcial só com janela de até 1,5 km. APPROXIMATE e o centro `-23.5475, -46.63611` ficam de fora.
- O pino volta no mesmo GET (`pins=cep:lat:lng`). O servidor só grava CEP da lista limpa, dentro do Brasil e a até 30 km do GPS.
- A primeira resposta não espera as 8 chamadas do Nominatim. Photon continua, com tempo curto.

### O que NÃO foi alterado
- NFS-e, regra Mobi, custo do abastecimento, nota de qualidade inventada, cron da ANP, missão, ponto operacional.

### Arquivos modificados
- `shared/anp-onde-abastecer.ts`
- `shared/anp-onde-abastecer.test.ts`
- `server/lib/anp-onde-abastecer.ts`
- `server/routes/anp-stations.ts`
- `client/src/pages/mobile/onde-abastecer.tsx`
- `docs/fluxo-onde-abastecer.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma
- [ ] Sim (listar): grava nas tabelas que já existem.

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/anp-onde-abastecer.test.ts client/src/components/mobile/posicao-confirmada.test.ts server/lib/anp-fiscal-xlsx.test.ts` | ver log da entrega |

### Resultados (negócio)
O posto vizinho, que já estava na lista, ganha latitude lida do endereço e entra na régua. A próxima abertura usa o pino gravado.

### Regressões verificadas
Régua, frase da lista, centro do município e avenida espalhada continuam nos testes puros. A tela de abastecimento não mudou.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não — o GET segue `requireAuth`. Pino de CEP que não está na lista limpa é ignorado.

### Backup / ponto de restauração
`53618b6a` em `main` e `dev`.

### Deploy
- Não publicado. A produção continua em `53618b6a` até o pedido de publicar.

### Evidências
Consulta somente leitura: stations 5940, with_point 0, anp_cep_geo 0, Santana 0, Barueri 20. Teste puro do pino da Piracema a 10 km do GPS `-23.42202, -46.86707`.

### Pendências
Conferir no celular, com a sessão do agente, que o cartão do posto aparece. Sem login o fluxo mobile não abre.

### Gates G1–G16
- [x] Atendidos no que cabe a satélite de consulta / N/A para faturamento, boletim e ledger.

### Resumo executivo (3 linhas)
1. A lista estava no sistema; a coordenada do posto, não.
2. O mapa do celular lê o endereço e a régua usa esse pino.
3. Não publica sozinho e não mexe no custo.
