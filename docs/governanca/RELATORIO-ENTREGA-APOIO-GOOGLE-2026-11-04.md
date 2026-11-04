## Relatório de Entrega — Busca de posto, hospital, borracharia e mecânico

**Data:** 2026-11-04
**Branch:** `cursor/apoio-google-lista-7ab0`
**Commit(s):** ponta da branch
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `recommendStations`, `recommendHospitals`, `recommendOficinas`, `rankOficinas`, `oficinaFromPlace`, `pickRadiusStep`, `PlacesService` no celular.
- Existente aproveitado: a lista da ANP, a lista do CNES, a consulta do mapa aberto e a régua de 5 a 25 km. O Google já existia no celular só quando a borracharia falhava.
- Algo novo criado? [x] Sim — a junção da lista oficial com o Google (`shared/apoio-lista.ts`). Não há tabela, API nem motor de cálculo novos. A nota da ANP e a ficha do CNES continuam nos módulos de cada lista.

### Domínio e tipo do dado
- Domínio dono: apoio operacional de campo no celular.
- Tipo: Satélite. Não altera abastecimento, boletim, balanço nem `calcularEscolta`.

### O que foi alterado
- As três telas consultam o Google junto com a lista que já existia. Posto: ANP primeiro, Google só no que não é o mesmo lugar. Hospital: CNES primeiro. Borracharia e mecânico: mapa aberto primeiro.
- O cartão mostra a fonte. Lugar só do Google não recebe nota da ANP nem ficha do Ministério da Saúde.
- O GPS não reaproveita a posição de um minuto atrás. Andar cerca de 1 km, ou tocar em Atualizar lista, pede a lista de novo. Se o lugar novo está além do degrau atual, a régua sobe até 25 km.

### O que NÃO foi alterado
- Custo do abastecimento, NFS-e, boletim, balanço e `calcularEscolta`.
- Quem entra na lista da ANP e quem entra na lista do CNES.
- Guincho e autopeças continuam de fora.

### Arquivos modificados
- `shared/apoio-lista.ts`, `shared/apoio-lista.test.ts`, `shared/emergencia-oficina.ts`, `shared/hospitais-cnes.ts`
- `client/src/lib/lugares-google.ts`
- `client/src/pages/mobile/onde-abastecer.tsx`, `client/src/pages/mobile/hospitais.tsx`, `client/src/pages/mobile/emergencia-oficina.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|---|---|
| `npx tsx --test shared/apoio-lista.test.ts shared/emergencia-oficina.test.ts shared/hospitais-cnes.test.ts shared/anp-onde-abastecer.test.ts` | 27 pass |
| `npx tsc --noEmit` filtrado nos arquivos desta entrega | sem erro novo |

### Resultados (negócio)
A lista deixa de ficar presa na primeira leitura: entra lugar novo do Google, a lista oficial permanece e o cartão diz de onde veio.

### Regressões verificadas
- Os testes da ANP, do CNES e da oficina continuam passando. Guincho, autopeças e posto fechado em definitivo seguem de fora.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter o commit desta branch. Não há migration.

### Deploy
- Não publicado. A Vercel não recebe esta alteração até o pedido de publicação.

### Evidências
- Testes da junção: ANP na frente, Google no degrau seguinte, mesma bomba não duplica, fonte no texto do cartão.
- Nesta máquina não há chave do mapa nem login. A chamada ao Google no celular não foi exercida ao vivo.

### Pendências
- Conferir no celular, com a chave do mapa, se o cartão do Google aparece ao lado da ANP e se Atualizar lista troca a lista depois de andar.

### Gates G1–G17
- [x] N/A justificado — satélite de apoio de campo. Não mexe em dinheiro, boletim, auth nem banco.

### Resumo executivo (3 linhas)
1. Posto, hospital, borracharia e mecânico passam a olhar o Google sempre, sem apagar a lista oficial.
2. O cartão mostra a fonte. A ANP continua na frente do posto.
3. A lista recalcula com GPS novo, ao andar cerca de 1 km e no botão Atualizar lista.
