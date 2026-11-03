## Relatório de Entrega — Onde abastecer mostra posto da cidade vizinha

**Data:** 3 de novembro de 2026
**Branch:** `cursor/onde-abastecer-postos-perto-b534`
**Commit(s):** neste branch, a partir de `c1656e8b`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim (quando/como)

### Reutilização (D11 / P13)
- Busca realizada: `recommendStations`, `geocodeCeps`, `pickRadiusStep`, `catalogPhrase`, `haversineKm`, `anp_station_quality`, `anp_cep_geo`.
- Existente aproveitado: a mesma consulta, a mesma régua e o mesmo cache de CEP. A cidade vizinha entra na consulta que a faixa de CEP já fazia.
- Algo novo criado? [x] Não  [ ] Sim — inviabilidade:

### O que foi alterado
- Latitude nula deixa de virar 0. Antes o posto ia para o Golfo da Guiné, a régua fechava em 25 km e o endereço não era consultado. Por isso `anp_cep_geo` seguia vazio com a lista de 5.940 postos já gravada.
- A faixa de CEP, ao achar Barueri, passa a trazer os postos de Barueri inteiro. Santana de Parnaíba não tem posto na pesquisa da ANP.
- O ponto entra na régua se o número da ANP bater, ou se os acertos do mesmo CEP ficarem a até 1,5 km. A avenida espalhada e o centro de São Paulo continuam de fora.
- A frase da lista conta só a cidade do GPS.

### O que NÃO foi alterado
- `calcularEscolta`, boletim, balanço, `vehicle_fueling`, TicketLog, NFS-e e a regra do Mobi.
- Preço da ANP não preenche o custo. Nota 0–5 não é inventada.
- Nenhuma tabela nova.

### Arquivos modificados
- `shared/anp-onde-abastecer.ts`
- `shared/anp-onde-abastecer.test.ts`
- `server/lib/anp-onde-abastecer.ts`
- `docs/fluxo-onde-abastecer.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma
- [ ] Sim (listar):

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/anp-onde-abastecer.test.ts server/lib/anp-fiscal-xlsx.test.ts` | 15 pass / 0 fail |

### Resultados (negócio)
No GPS de Santana de Parnaíba (−23,42202, −46,86707) a lista continua sendo os 5.940 postos. A cidade não tem posto na pesquisa. O posto da Avenida Piracema, em Barueri, fica na casa dos 10 km e pode aparecer na régua.

### Regressões verificadas
- Número exato da Otaviano Alves de Lima, 3926, continua sendo o ponto usado.
- Avenida Raimundo Pereira de Magalhães, CEP 02938000, com acertos em outros CEPs e espalhados, continua sem ponto.
- Centro municipal de São Paulo continua rejeitado.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- `c1656e8b` na `main`.

### Deploy
- Não publicado neste passo.

### Evidências
- Produção consultada: 5.940 postos, 5.940 com qualidade, 34.669 preços, 0 latitudes, 0 linhas em `anp_cep_geo`.
- Santana de Parnaíba: 0 postos. Faixa 06455175–06615175: 3 postos em Barueri, todos limpos. Barueri inteiro: 20 postos limpos, 14 CEPs.
- Photon da Piracema 601 devolve o CEP 06460-030 com números 69 e 669, a cerca de 9,8 km do GPS.

### Pendências
- O celular só vê o posto depois da publicação. Esta entrega não publicou.

### Gates G1–G17
- [x] Atendidos / N/A justificado — domínio satélite, sem efeito financeiro. G17 registrado acima.

### Resumo executivo (3 linhas)
1. A lista da ANP está no sistema: 5.940 postos.
2. A tela dizia 25 km vazio porque a latitude nula virava o ponto 0 e o endereço nem era buscado.
3. A busca agora inclui a cidade vizinha e aceita um ponto curto do mesmo CEP, sem usar avenida espalhada.
