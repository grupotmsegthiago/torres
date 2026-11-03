## Relatório de Entrega — Onde abastecer localiza o endereço antes do raio vazio

**Data:** 03/11/2026, horário de Brasília
**Branch:** `cursor/onde-abastecer-localiza-antes-b534`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Sim — fast-forward para `main` e `dev` no mesmo passo. A Vercel publica a `main`.

### Reutilização (D11 / P13)
- Busca realizada: `recommendStations`, `geocodeCeps`, `stationGeocodeQuery`, `anp_cep_geo`, `anp_station_quality`, tela `onde-abastecer.tsx`.
- Existente aproveitado: a mesma consulta e a mesma tabela de CEP. Sem segundo motor e sem tabela nova.
- Algo novo criado? [x] Não

### Domínio e tipo do dado
- Domínio dono: consulta Onde abastecer (frota / abastecimento de campo).
- Tipo: Satélite. Não grava abastecimento e não entra em `calcularEscolta`.

### O que foi alterado
- A frase "Nenhum posto com histórico limpo neste raio" só sai depois que os CEPs da faixa em volta do GPS foram consultados.
- Nome de cidade que não bate não encerra mais a busca se houver posto na faixa de CEP do estado.
- Ponto sem o número da casa, e o centro do município que a BrasilAPI repete em São Paulo, não contam como posto fora do raio.
- A tela mostra "Localizando os postos" e tenta de novo sozinha.

### O que NÃO foi alterado
- Custo do abastecimento, TicketLog, boletim, balanço, NFS-e, apólice do Mobi e a carga de 30 minutos.

### Arquivos modificados
- `shared/anp-onde-abastecer.ts`
- `shared/anp-onde-abastecer.test.ts`
- `server/lib/anp-onde-abastecer.ts`
- `client/src/pages/mobile/onde-abastecer.tsx`
- `docs/fluxo-onde-abastecer.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Causa raiz
- Em produção, `anp_cep_geo` estava com 0 linhas e nenhum posto tinha latitude, enquanto a tela já dizia que não havia posto no raio.
- Esse texto saía quando o município do GPS não batia com `city_norm`, antes de geocodificar.
- CEP 02938-000 na BrasilAPI volta `-23.5475, -46.63611` (centro de São Paulo). Photon na Avenida Raimundo Pereira de Magalhães ignora o número e cai a cerca de 9 km do escritório.

### Testes executados
| Comando / arquivo | Resultado |
|---|---|
| `npx tsx --test shared/anp-onde-abastecer.test.ts server/lib/anp-fiscal-xlsx.test.ts` | ver o commit |

### Resultados (negócio)
O aplicativo não declara o raio vazio antes de buscar o endereço dos postos da faixa.

### Regressões verificadas
- Âmbar de base não carregada continua só em `not_loaded`.
- Posto com o número da casa dentro de 5 km continua elegível.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Rollback
- Reverter o commit desta branch. As linhas já gravadas em `anp_cep_geo` podem ficar: coordenada nula não entra no raio.

### Pendências
- A faixa de CEP não é distância. Um posto perto, com CEP fora dos 80 mil números, espera outra abertura com coordenada já gravada.
- Login do agente no aparelho não foi refeito daqui.
