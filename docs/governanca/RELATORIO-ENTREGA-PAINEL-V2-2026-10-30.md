## Relatório de Entrega — Painel Operacional v2 (visual)

**Data:** 2026-10-30
**Branch:** dev
**Commit(s):** não commitado
**Ambiente validado:** [ ] local (tipo conferido; tela logada não exercitada nesta sessão)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca realizada: `operational-grid`, `Grid Operacional`, `VincularOsButton`, `getViaturaStatus`, `/api/operational-grid`, `vehicle-tracking`.
- Existente aproveitado: a página `client/src/pages/admin/operational-grid.tsx` continua dona dos números (veículos, rastreados, com posição, sem sinal, operações). Mapa, alertas, busca por raio, grade Cockpit/Clássico e `VincularOsButton` foram mantidos. Status do card reusa `getViaturaStatus` e os mesmos critérios de ignição/sinal já usados na grade.
- Algo novo criado? [x] Sim — inviabilidade: o visual pedido (cockpit, KPI chanfrado, card da viatura com miniatura) não existia como componente. Criar um segundo painel com API ou cálculo próprio duplicaria a projeção do grid. Os arquivos novos são só moldura; não há motor, tabela nem rota nova.

### Especificação resumida
- Problema: o Painel Operacional não tinha o visual de cockpit pedido (relógio central, KPI em relevo, mapa em moldura, cards da frota com a escolta).
- Causa: a tela já existia em `operational-grid.tsx` com outro acabamento. Não havia componente visual v2.
- Domínio dono: Operational Grid. Tipo do dado: PROJEÇÃO (a UI só lê). Camada: apresentação.
- Regra de negócio: nenhuma. Cancelada, recusada, boletim e faturamento não entram nesta tela.

### O que foi alterado
- Cabeçalho, cinco KPI e a faixa de cards da frota passaram a usar o visual escuro, com os mesmos contadores de antes.
- O mapa ganhou moldura, legenda em pílulas e estilo noturno. A busca de endereço/raio continua a mesma.
- Cada card mostra placa, vigilante 1 da OS ativa, status já calculado, GPS e bateria do rastreador. Sem bateria, o medidor fica "—". O clique no card centraliza a viatura no mapa. Vincular OS abre o diálogo que já existia.
- A grade detalhada (Cockpit/Clássico), alertas, proximidade e espelhamento continuam abaixo dos cards.
- Miniatura `client/public/assets/mini-escolta-3d.png`: fundo do render 3D removido.

### O que NÃO foi alterado
- `/api/operational-grid`, rastreadores, vínculo de OS, faturamento, banco e menu. A rota segue `/admin/operational-grid`.

### Arquivos modificados
- `client/src/pages/admin/operational-grid.tsx`
- `client/src/components/admin/vincular-os-dialog.tsx` (classe opcional do botão; o fluxo de gravação não mudou)
- `client/src/components/painel-v2/PainelV2.tsx`
- `client/src/components/painel-v2/HeaderOperacional.tsx`
- `client/src/components/painel-v2/KpiCard3D.tsx`
- `client/src/components/painel-v2/FleetCard3D.tsx`
- `client/public/assets/mini-escolta-3d.png`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| Diagnóstico do editor nos arquivos alterados | sem erro |
| `npx tsc --noEmit` | o projeto já falha em telas antigas; os arquivos novos do painel v2 não aparecem na lista |

### Resultados (negócio)
O operador vê o cockpit novo no mesmo Painel Operacional, com os números e as ações que já usava.

### Regressões verificadas
- Contadores continuam `onlyVehicles`, `hasTracker`, posição, `noSignalSince` + `isLiveData === false`, e `gridData.length`.
- Vincular OS da faixa usa o mesmo diálogo, com a viatura da linha.
- A grade completa não foi removida.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter os arquivos listados. A miniatura pode ser apagada junto. Nenhum dado de produção foi escrito.

### Deploy
- Não publicado.

### Pendências
- Conferir a tela logada no navegador (mapa Google, cards com frota real e Vincular OS).
- O card "Sem sinal" agora aparece também quando a contagem é zero, para o painel manter as cinco casas. O número é o mesmo.

### Gates G1–G17
- [x] N/A de financeiro, auth, webhook e schema. UI de projeção em cima da fonte que já existia.

### Resumo executivo
1. O Painel Operacional ganhou o visual de cockpit sem um segundo cálculo.
2. Os cards da frota usam a miniatura da escolta e o vínculo de OS que já existia.
3. A grade operacional detalhada permanece na mesma tela.

### Complemento — fila e modal (mesmo dia)
- Grid da frota em 3 colunas (`lg:grid-cols-3`).
- Ordem: em missão ou na origem (`getViaturaStatus`, exceto LIVRE e MISSÃO AGENDADA), depois revisão de óleo vencida, depois rodízio (`isRodizioSP`), depois disponíveis. Viatura sem sinal do rastreador entra como disponível no card.
- Revisão vencida reusa o corte já usado no alerta de frota: `km - last_oil_change_km >= 10000`, e só quando a última troca está registrada. O campo `lastOilChangeKm` passou a ir na resposta que o painel já lia (`/api/vehicle-tracking`). Não há consulta nem tabela nova.
- Badge de revisão vencida: chave (`Wrench`) piscando e texto MANUTENÇÃO VENCIDA. Rodízio: triângulo (`TriangleAlert`) piscando e texto RODÍZIO SP. O brilho do card acompanha esses dois estados. O texto da missão continua o rótulo oficial (`getViaturaStatus`).
- Clique no card abre o modal com a OS já carregada no grid (cliente, rota, KM do item do grid, equipe, kit e últimas mensagens). Vincular/Alterar OS continua o diálogo existente.

### Complemento — ícones dos KPI (mesmo dia)
- Os cinco contadores não mudaram. Só o desenho do canto direito de cada card.
- Veículos continua a miniatura `/assets/escolta-virtus.png`, agora com sombra de contato.
- Rastreados, Com posição, Sem sinal e Operações usam recortes em `client/public/assets/icons/` (satélite, globo, torre e engrenagens). O satélite ganha anéis de pulso em CSS. Cada um fica numa base chanfrada com luz superior.
- Não há cálculo, rota nem tabela nova.

### Complemento — traçado no card (mesmo dia)
- Card em missão ou na origem, com OS ativa, ganha o traçado curvo. Origem e destino saem do texto da OS (`cidadePin`), não de um par fixo SP/RJ.
- Percentual, km percorrido e previsão reusam `getRouteProgress` e `calcEta`. Sem coordenada, o card mostra o trecho e a frase "Sem coordenada para a quilometragem", sem número inventado.
- Velocidade só aparece quando o GPS está ao vivo e o rastreador manda `speed`.
- No card em missão, o traçado virou um painel holográfico iluminado por cima da miniatura. Os números continuam os mesmos.

### Complemento — KPIs operacionais (mesmo dia)
- A faixa superior deixou Rastreados, Com posição, Sem sinal e Operações.
- Os cinco cards agora são: Veículos (miniatura da Virtus e total da frota, sem espião), Em missão (em missão ou na origem), Disponíveis (badge DISPONÍVEL), Em manutenção (revisão de óleo vencida) e Rodízio SP.
- A conta é a mesma fila dos cards (`fleetQueueStatus`). Missão agendada não entra em Disponíveis. Viatura sem sinal do rastreador entra. O total de Veículos continua incluindo esses casos.
- Os cinco cards filtram a faixa da frota. Dá para marcar mais de um. Veículos limpa o filtro e mostra a frota inteira. Clicar de novo no mesmo card desmarca.

### Complemento — carta no card da viatura (mesmo dia)
- O quadro amarelo de "viatura com atualizações" deixa de aparecer no painel. A leitura passou para o card da viatura.
- Mensagem não lida (`/api/mission/updates?unread=true`, mesma marca `read_by_admin`) abre uma carta no card, com farol e borda piscando até "Marcar lidas".
- A viatura entra pela OS ativa, pela OS agendada ou pela placa no grid. Não há tabela nem API nova.
- No mapa principal, a coluna da esquerda empilha uma carta por mensagem não lida. A mais nova fica em cima, com a foto da viatura, o horário e o texto. A carta pisca até o clique, que abre a leitura. Dois minutos sem leitura disparam a sirene do sino, de novo a cada 20 segundos, até marcar lidas.

### Complemento — ficha do card (mesmo dia)
- O card da viatura mostra cliente, origem, destino, condutor e agente. GPS e "Operação em andamento" saíram.
- O rótulo da operação no card ficou NA ORIGEM, EM VIAGEM, PERNOITE ou DISPONÍVEL. Pernoite reusa `isPernoiteMessage` do Agente Central (última mensagem). Manutenção e rodízio continuam quando existem. Sem sinal do rastreador não aparece no card: a viatura fica DISPONÍVEL.
- A lista antiga de veículos (cabeçalho Veículos, Cockpit/Clássico e a grade detalhada) saiu desta tela. A frota fica nos cards.
- O alerta de velocidade que já existia (acima de 110 km/h) passa a tocar um aviso sonoro, no mesmo interruptor do sino.
- Viatura sem OS em andamento, em movimento acima de 2 km/h, entre 22h e 5h, ganha o aviso "Viatura vazia em movimento após 22h" no card. Não altera faturamento.
- Viatura com mensagem não lida abre a fila dos cards, a mais recente primeiro. A OS última da viatura também entra no vínculo, para a carta não se perder quando a ordem deixa de estar ativa.
- No card, condutor e agente ficam ao lado da viatura. O cliente fica à direita, no mapa quando há rota. Origem e destino continuam no traçado, sem repetir a lista empilhada.
- No mapa principal, cada viatura com mensagem não lida aparece num mini card só com a frente do carro. O clique abre o painel da mensagem: texto completo, rota, mapa, link, foto quando existe, copiar mensagem, copiar foto e marcar lidas.
- O farol pisca com mensagem não lida, com velocidade acima de 110 km/h ou com viatura vazia em movimento após 22h. Mensagem lida sem nenhum desses alertas apaga o farol.
- Condutor e agente do card saem da fonte mais recente entre a última OS da viatura (`activeOs` ou `lastOs` de `/api/vehicle-tracking`) e a última identificação (`GET /api/driver-sessions`). Quem tem registro mais novo em outra viatura sai da antiga, que fica sem condutor ou sem agente. No card o nome aparece como primeiro e último. O nome completo continua no detalhe e na dica ao passar o mouse. Não grava OS nem sessão.
- O kit da viatura, lido de `/api/weapon-kits`, aparece só no detalhe da OS. A OS ativa manda no kit; sem OS, vale o kit cujo nome traz a placa. Revólver .38, espingarda 12 e pistola usam o recorte de estúdio correspondente. Os cards da frota e o mapa não mostram o kit. Número de série não aparece.
- Modo TV (`?tv=1` ou o botão no cabeçalho) tira o menu lateral e deixa o painel na tela inteira. O conteúdo do grid permanece.
- Mensagem marcada como lida sai na hora da coluna. O id fica de fora mesmo se a lista não lida chegar atrasada. A gravação continua `read_by_admin = 1` em `/api/mission/updates/mark-read`.
- A simulação SIM9E99 saiu do painel e da coluna de mensagens. Ao lado da placa fica o código da VTR. O campo `vehicles.frota` manda; hoje está vazio, então o número sai do kit (`KIT TORRES - 01` vira VTR-01). Embaixo da placa, menor, fica Mobi, Polo ou Virtus, pelo modelo do cadastro. Viatura sem frota e sem kit não ganha número inventado. `/api/vehicle-tracking` passou a devolver `frota`, coluna que a listagem de veículos já lia.

### Complemento — leitura vale para todas as telas (2026-10-31)
- Problema: quem marcava a carta como lida via ela sumir só no próprio navegador. TV e os outros usuários continuavam com a fila.
- Causa: `read_by_admin` já é fato único em `mission_updates`, mas o outro navegador dependia do `postgres_changes` da tabela. Esse canal entra anônimo e a RLS engole o evento (a mesma razão do canal autenticado de OS/billing). O plano B era um refetch de 30s, pausado com a aba em segundo plano. O conjunto `lidasNaTela` só existe na memória de quem clicou.
- Reutilização: o mesmo `PATCH /api/mission/updates/mark-read` e a mesma lista `GET /api/mission/updates?unread=true`. Não há tabela, política de RLS nem API nova. O aviso é um broadcast público só com ids, para não abrir `mission_updates` no navegador.
- Efeito: depois da gravação, o servidor avisa as telas abertas. Elas tiram essas cartas na hora e buscam de novo a lista oficial. Se o aviso falhar, a lista se atualiza sozinha a cada 5 segundos, também com a aba em segundo plano.
- Domínio: missão (fato `mission_updates.read_by_admin`) e projeção do Painel Operacional. Sem regra de faturamento.
- Rollback: reverter os arquivos desta entrega. A marca no banco continua `read_by_admin = 1`.

### Complemento — mapa e fotos da ficha da OS (2026-10-31)
- O quadro "Rota da origem ao destino" era uma imagem estática que não abria. A ficha passa a usar o mesmo mapa noturno do painel, com origem, destino e a viatura. Sem coordenada, tenta o endereço. Não grava rota na OS.
- Os círculos com a inicial viram a foto do cadastro (`employees.photo_url`, lida em `GET /api/employees/:id` só ao abrir a ficha), no mesmo relevo do kit. Sem foto, fica a inicial no relevo.
- Domínio: painel operacional, projeção. A foto é fato do cadastro de funcionário. Sem tabela nova.
