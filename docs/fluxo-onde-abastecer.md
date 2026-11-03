# Onde abastecer — fluxo proposto

**Status:** proposta para comparação. Não está implementada e não é regra homologada.
**Data da conversa:** 2 de novembro de 2026, horário de Brasília.
**Para que serve este arquivo:** registrar tudo o que foi pedido e fechado, para comparar com outra análise (Gemini) sem depender do chat.

O aplicativo do agente passa a indicar, antes do abastecimento, um posto perto, com preço de gasolina e álcool na última pesquisa da ANP e com histórico limpo de qualidade. O agente abre a rota no Waze ou no Google Maps. O lançamento do abastecimento continua o de hoje. O preço pago na bomba continua sendo o custo oficial.

---

## 1. Como o pedido foi fechado

A conversa andou nesta ordem. O que vale é o fechamento da seção 5. O histórico fica aqui para a comparação não perder o que foi descartado.

1. Dá para puxar a ANP automaticamente para o Torres?
2. Como funcionaria uma rotina semanal de preço médio da cidade, só como referência ao lado do preço pago?
3. O posto dessa pesquisa é “garantido”, sem combustível adulterado?
4. No aplicativo do funcionário, só gasolina e álcool: ao abrir, usar a localização, mostrar o posto mais rápido e mais em conta, e traçar a rota no Waze ou no Google Maps.
5. O posto precisa ser o mais próximo, o mais em conta e com selo de garantia de que não é adulterado. Cruzar as duas pesquisas da ANP: preço e qualidade.
6. Na home do agente, isso é um botão separado do lançamento.

Respostas que ficaram no caminho e não são o desenho final:

- A pesquisa semanal de preço não testa combustível e não é selo de qualidade.
- Não existe preço ao vivo de todos os postos ao redor. Sem preço recente daquele posto, o aplicativo não diz “mais em conta”.
- O selo do Ipem-SP (bomba antifraude) garante a quantidade de litros, não a qualidade química. Cobre poucos postos e só São Paulo. Ficou de fora.
- “Procurar abastecimento” não é o nome do botão. Parece busca de um lançamento antigo.

---

## 2. O que cada base da ANP é

São dois arquivos públicos. Nenhum dos dois é uma API oficial de preço de bomba em tempo real.

### Preço

Levantamento de Preços de Combustíveis (LPC), publicado como Série Histórica / dados abertos.

- Um pesquisador visita uma amostra de postos, olha o painel e anota o preço. Fotografa fachada e painel. Não coleta amostra e não manda para laboratório.
- Produtos: gasolina C comum, gasolina C aditivada, etanol hidratado, diesel S10, diesel S500, GNV e GLP. Este fluxo usa só gasolina e etanol.
- A semana da pesquisa vai de domingo a sábado. O arquivo do mês costuma ser atualizado no começo da semana seguinte.
- O arquivo que serve aqui é o microdado: preço daquele posto (CNPJ), naquele dia, daquele produto. A média do município não escolhe posto.
- O nome e a extensão do arquivo mudam de um mês para o outro. Em 2026 há CSV e também XLSX, e o padrão do nome não é estável. O job procura o arquivo do mês. Não depende de um endereço fixo.
- Fonte: [Série Histórica de Preços](https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/serie-historica-de-precos-de-combustiveis) e a pasta de arquivos do ano.

### Qualidade e nota

Não é a planilha de preço.

- **PMQC:** amostras sorteadas de gasolina, etanol e diesel, analisadas em laboratório. Cada ensaio sai conforme ou não conforme. O monitoramento não autua sozinho. A fiscalização da ANP confirma com nova coleta antes de autuar.
- **Fiscalização:** autos de infração. Vício de qualidade é combustível fora da especificação. Vício de quantidade é bomba que entrega menos do que marca.
- **ANP com Vc — Postos:** aplicativo público da ANP. Usa a localização, lista postos autorizados e mostra nota de 0 a 5, fiscalização dos últimos cinco anos, amostras do PMQC, origem do combustível, CNPJ, endereço e autorização. Não há API documentada. O endereço é um aplicativo Oracle APEX (`anpcomvcpostos.anp.gov.br`). Não raspar essa tela.
- A nota usa infrações e amostras não conformes, com peso maior no que é recente. Infração de 0 a 2 anos pesa 2. Infração de 2 a 5 anos pesa 1. Há liminar da FECOMBUSTÍVEIS: amostra não conforme do PMQC, por enquanto, não entra no cálculo da nota publicada. Posto inativo, interditado por completo, ou com desconto acima de 5, fica com nota zero.
- Nota 5 significa histórico limpo nessa conta. Não significa “o litro de hoje foi testado e não está adulterado”. Posto sem visita recente não ganha selo.
- Fontes: [ANP com Vc — Postos](https://www.gov.br/anp/pt-br/centrais-de-conteudo/aplicativos/anp-com-vc-postos), [como a nota é calculada](https://anpcomvcpostos.anp.gov.br/ordsdw/r/sfi_apex/anpcomvcpostos/informacoes), [PMQC dados abertos](https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/pmqc-programa-de-monitoramento-da-qualidade-dos-combustiveis), [ações de fiscalização](https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/acoes-de-fiscalizacao).

### O que a tela pode escrever

| Situação | Texto |
|---|---|
| A nota oficial da ANP é 5 e não há infração de qualidade nos últimos 2 anos | “Nota ANP 5. Sem infração de qualidade nos últimos 2 anos.” |
| Dá para provar o histórico limpo pelos dados abertos, mas a nota 5 oficial não foi reproduzida (a liminar tira a amostra da nota) | “Sem infração de qualidade registrada nos últimos 2 anos.” Sem inventar “Nota ANP 5”. |
| Qualquer outro caso | O posto não entra na lista. |

A frase “combustível sem adulteração”, “posto garantido” ou “selo de garantia” não aparece. A ANP não publica esse selo.

---

## 3. O que o Torres já tem e deve ser reutilizado

Domínio dono: frota / abastecimento de campo.

| Peça | Onde está | Uso neste fluxo |
|---|---|---|
| Home do agente, card **Abastecer** | `client/src/pages/mobile/home.tsx` | Continua. O card novo fica ao lado. |
| Lançamento de abastecimento | `client/src/pages/mobile/abastecimento.tsx` | Continua o registro. Já é só gasolina e etanol. Já pede os dois preços e aplica a regra dos 70%. Já grava GPS, endereço e nome do posto. |
| GPS do abastecimento | `useGeolocation` na mesma tela | A tela nova pede a localização de novo ao abrir. |
| Rota Waze e Google Maps | `client/src/pages/mobile/missao.tsx` (`waze.com/ul` e `google.com/maps/dir`) | Os mesmos dois botões, agora com o destino no posto. |
| Custo oficial do abastecimento | `vehicle_fueling` (`liters`, `cost_per_liter`, `total_cost`, `gasoline_price`, `ethanol_price`) | Fato. Só o lançamento escreve. |
| Postos TicketLog | `ticketlog_postos` | Não serve. Tem nome, código, endereço e cidade. Não tem coordenada nem preço. |
| Conciliação TicketLog | tela e rotas já existentes | Continua conferindo o que foi pago no cartão. Não escolhe posto. |

A regra dos 70% permanece no lançamento, com os preços que o agente digita na bomba: etanol dividido por gasolina, etanol quando o resultado é até 70%. O preço da pesquisa ANP não entra nessa conta.

Nada disto cria segundo motor de custo, segunda despesa ou escrita em `mission_costs` / `financial_transactions`.

---

## 4. Regra fechada

Raio de trabalho combinado na conversa: **5 km** a partir da localização atual. É parâmetro de tela, fácil de ajustar se a comparação mudar o número.

Entra na lista o posto que, ao mesmo tempo:

1. Está a até 5 km.
2. Está autorizado e não está interditado.
3. Tem nota oficial ANP 5, quando essa nota puder ser lida ou reproduzida com fidelidade. Senão, pelo menos nenhuma infração de qualidade nos últimos 2 anos, e o texto da tela segue a tabela da seção 2.
4. Para ser “o mais em conta”, tem preço de gasolina e preço de álcool na última pesquisa daquele posto.

Ordenação do cartão principal:

- Entre os que passaram nos itens 1 a 4, vence o menor preço do produto que a pesquisa mostrou mais em conta na dupla gasolina/álcool daquele posto. Os dois preços aparecem no cartão.
- Empate de preço: fica o mais próximo.
- Se ninguém no raio tiver os dois preços na última pesquisa, o cartão principal é o mais próximo que passou nos itens 1 a 3, com a frase “preço desta semana ainda não pesquisado”.

O que não entra, mesmo perto e barato:

- Posto com infração de qualidade nos últimos 2 anos.
- Posto interditado ou sem autorização.
- Posto sem preço, na disputa de “mais em conta”. Ele só aparece no modo “preço ainda não pesquisado”, e só se tiver o histórico limpo.

“Mais rápido” (menor tempo de carro) foi pedido no meio da conversa e ficou substituído por esta ordem: o raio garante o perto, o preço escolhe o posto. Minutos de carro aparecem no cartão como informação, calculados para o posto já escolhido. Não desempata no lugar da distância.

Diesel, GNV e GLP ficam de fora desta tela. O lançamento mobile de abastecimento já é só gasolina e etanol.

---

## 5. Como fica no aplicativo

Dois botões na home. Um não substitui o outro.

| Botão | Função |
|---|---|
| **Onde abastecer** | Novo. Indica o posto e abre a rota. Não grava abastecimento. |
| **Abastecer** | O de hoje. Placa, litros, preços da bomba, fotos e gravação. |

“Procurar abastecimento” não é usado.

### Home

O grid atual tem Ponto RH, Ponto Oper., Abastecer, Pedágio, Condutor. **Onde abastecer** entra na mesma grade, ao lado de Abastecer. Subtítulo: “Posto perto e em conta”.

### Tela Onde abastecer

Ao abrir, pede a localização. Enquanto busca, um estado de carregamento. Sem GPS, pede para liberar a localização e não mostra posto antigo de outra cidade.

Cartão principal, quando há preço:

```
Posto Shell da Anhangüera
1,4 km · cerca de 5 min

Gasolina   R$ 5,89
Álcool     R$ 3,79
Pesquisa ANP da semana de 26/10 a 01/11

Nota ANP 5
Sem infração de qualidade nos últimos 2 anos

[ Waze ]          [ Google Maps ]

Ver outros postos
```

Os botões abrem a navegação a partir de onde o agente está, no mesmo formato da missão:

- Google Maps: `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=<lat>,<lng>&travelmode=driving`
- Waze: `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`

`Ver outros postos` lista o restante do raio, todos com o mesmo filtro de qualidade, do mais barato para o mais caro. Cada um tem os mesmos dois botões de rota.

Cartão quando ninguém tem preço na semana:

```
Posto mais próximo com histórico limpo
1,1 km · cerca de 4 min

Preço desta semana ainda não pesquisado

Sem infração de qualidade registrada nos últimos 2 anos

[ Waze ]          [ Google Maps ]
```

Esse cartão não usa a frase “mais em conta”.

### Ligação com Abastecer

O campo **Posto / Local** do lançamento vem preenchido com o nome do posto escolhido nesta tela, se o agente tocar em Abastecer em seguida na mesma sessão. Ele pode apagar e digitar outro. O preço da pesquisa não preenche R$/litro. Litros, preço da bomba, acréscimo, regra dos 70% e as três fotos (bomba, nota, hodômetro) continuam obrigatórios como hoje. O aviso do CNPJ da nota (36.982.392/0001-89) continua no lançamento.

A sugestão não cria `vehicle_fueling`.

---

## 6. Fluxo do agente

1. Na home, toca em **Onde abastecer**.
2. O aplicativo pede a localização atual.
3. O Torres devolve o cartão da seção 5, já filtrado pela regra da seção 4.
4. O agente lê nome, distância, minutos, os dois preços (se houver) e a linha da nota.
5. Toca em Waze ou Google Maps. O aplicativo do mapa abre com a rota até o posto.
6. No posto, confere o painel. A pesquisa pode ser de alguns dias atrás.
7. Abastece.
8. Volta ao Torres e toca em **Abastecer**.
9. Informa os 4 últimos da placa, escolhe a viatura, digita os preços de gasolina e álcool da bomba, litros, hodômetro e fotos. O posto sugerido já está no campo, editável.
10. Confirma a placa fotografada e grava. A partir daqui vale o fluxo atual de abastecimento, inclusive o custo na missão e no balanço.

Se o agente já está no posto e só quer lançar, ele usa **Abastecer** direto e ignora a sugestão.

---

## 7. Fluxo de dados

Quem escreve a referência é um job no cron que o Torres já usa. A tela só lê.

Cada execução:

1. Baixa os dados abertos do mês corrente de preço de gasolina/etanol, no grão do posto.
2. Baixa fiscalização e, no que a liminar permitir usar como fato publicado, o PMQC e o cadastro de revendedores autorizados.
3. Grava por CNPJ, semana, produto e coordenada (ou endereço quando a coordenada não vier no arquivo).
4. Se a mesma semana e o mesmo posto já estiverem gravados, não duplica.
5. Se o download falhar, a última carga boa permanece. A tela mostra a data dessa carga. O lançamento de abastecimento segue normal.

Tipo do dado gravado: **satélite** da ANP. É referência rotulada com a semana da pesquisa. Não é fato financeiro. Não é snapshot de boletim. Não entra em `calcularEscolta`.

A tela, a cada abertura:

1. Recebe latitude e longitude do celular.
2. Seleciona postos do raio de 5 km na carga local. Não chama a ANP na hora do toque.
3. Aplica a regra da seção 4.
4. Para o posto vencedor, calcula distância e tempo de carro para exibir os minutos.
5. Devolve o cartão. Se a carga estiver velha além da última semana publicada, o cartão diz a data da pesquisa em vez de tratar o preço como se fosse de hoje.

Casamento do posto com o mapa: CNPJ quando os dois lados tiverem. Sem CNPJ, nome mais endereço. Sem casar com segurança, o posto não entra na lista. Melhor omitir do que indicar o posto errado.

---

## 8. Casos de borda

| Situação | O que o agente vê |
|---|---|
| GPS negado ou falhou | Pedido para liberar a localização. Nenhum posto. |
| Nenhum posto com histórico limpo no raio | “Nenhum posto com histórico limpo neste raio.” Sem rota. |
| Histórico limpo, sem preço na semana | Cartão do mais próximo, frase “preço desta semana ainda não pesquisado”. Sem “mais em conta”. |
| Preço só de um combustível | Não disputa “mais em conta”. Os dois preços são exigência. |
| Dois postos com o mesmo menor preço | O mais próximo. |
| Posto barato com infração de qualidade nos últimos 2 anos | Fora da lista. |
| Posto interditado ou inativo | Fora da lista. |
| Cidade sem pesquisa na semana | Cai no modo sem preço, se houver posto com histórico limpo. |
| Arquivo do mês ainda não publicado ou com nome novo | Mantém a última carga. Mostra a semana dela. |
| Agente lança abastecimento sem passar por esta tela | Fluxo atual, campo posto vazio. |
| Preço da bomba diferente da pesquisa | Vale o digitado. A pesquisa não corrige o lançamento. |

---

## 9. O que não muda

- Custo da missão, balanço e TicketLog continuam no litro e no valor lançados em **Abastecer**.
- Recomendação álcool ou gasolina continua nos dois preços digitados na bomba, regra dos 70%.
- Nota fiscal no CNPJ da empresa, fotos e confirmação de placa continuam obrigatórias.
- Diesel não ganha esta indicação.
- Ipem-SP, Instituto Combustível Legal e “bandeira tradicional” não entram como selo.
- Não se raspa o aplicativo ANP com Vc.
- Não se preenche R$/litro com o número da ANP.
- Não se cria abastecimento, despesa, transação financeira nem missão a partir do cartão.

---

## 10. Governança desta proposta

| Item | Definição |
|---|---|
| Domínio dono | Frota / abastecimento de campo |
| Tipo do dado novo | Satélite (preço e histórico ANP). A escolha mostrada na tela é projeção rotulada com a semana da pesquisa. |
| Fato que continua dono do custo | `vehicle_fueling` |
| Reutilização | Home mobile, tela de abastecimento, GPS, botões de rota da missão, regra dos 70%. `ticketlog_postos` não resolve. |
| Arquivos se for implementar depois | `client/src/pages/mobile/home.tsx`, tela nova em `client/src/pages/mobile/`, rota de leitura, job de carga, tabela satélite nova só para a referência ANP |
| Risco | Indicar posto errado por casamento frágil de nome; exibir “Nota ANP 5” sem ser a nota oficial; agente tratar preço da semana como preço do painel |
| Teste mínimo futuro | GPS negado; raio vazio; histórico limpo sem preço; com preço; infração recente excluída; empate de preço fica o mais próximo; lançamento sem passar pela sugestão; lançamento com posto preenchido e preço digitado diferente da pesquisa |
| Rollback | Remover o card da home e desligar o job. Lançamentos já gravados não dependem da tabela satélite. |

A regra da seção 4 está no código descrito na seção 12. Publicar em produção continua sendo outro passo, pelo fluxo já existente de publicação.

---

## 12. O que foi montado no código

A tela e a carga seguem a regra da seção 4. O pacote de exemplo que comparava com outro gerador não entrou como está, porque o aplicativo usa `wouter` (não React Router), o layout mobile já existente, e a consulta SQL daquele exemplo era inválida no Postgres (`HAVING` sem agrupamento) e pegava as duas últimas linhas de preço, que podem ser duas gasolinas.

| Peça | Onde |
|---|---|
| Regra pura (preço, raio, texto da nota, semana, infração) | `shared/anp-onde-abastecer.ts` |
| Tabelas satélite | `anp_fuel_prices`, `anp_station_quality`, `anp_cep_geo` |
| Carga semanal, segunda 04:20 BRT | `runAnpStationsCron` |
| Leitura do agente | `GET /api/mobile/onde-abastecer` |
| Carga manual da diretoria | `POST /api/admin/anp-stations/sync` |
| Botão e tela | home mobile e `/mobile/onde-abastecer` |

O CSV da ANP traz endereço e CEP, sem latitude. O posto entra no raio de 5 km depois que o CEP é localizado e guardado. Até 40 CEPs novos por abertura, para a tela não esperar a cidade inteira. Os minutos são estimativa a 25 km/h e a tela diz "cerca de". A frase "Nota ANP 5" só aparece se `anp_score` for 5. A carga não calcula essa nota. Com histórico limpo e sem nota oficial, o texto é "Sem infração de qualidade registrada nos últimos 2 anos."

A carga de qualidade lê a planilha pública de fiscalização. Se ela vier sem nenhum evento reconhecido, a carga para e não marca todo mundo como limpo. Coleta de amostra sem reprovação não é infração.

O campo Posto do lançamento começa com o nome guardado nesta tela, na mesma sessão. O preço da pesquisa não preenche o R$/litro.

A volta da tela é `/mobile`. A API manda `emptyReason`. A tela usa o aviso âmbar só quando esse valor é `not_loaded` (base ainda não sincronizada). Cidade não identificada, raio sem posto e CEP ainda sendo localizado ficam no aviso neutro, com a frase da própria resposta. `mode === "empty"` cobre os quatro casos e não decide o título.

## 13. Pontos úteis para a comparação

Quem ler este arquivo em outra ferramenta pode discordar destes pontos. Estão explícitos para não serem relidos como lacuna:

- Raio de 5 km e desempate por distância, não por tempo de trânsito.
- Exigência dos dois preços (gasolina e álcool) para dizer “mais em conta”.
- Texto “Nota ANP 5” só com a nota oficial. Caso contrário, só o histórico de infração.
- Dados abertos em job, não consulta ao vivo e não raspagem do ANP com Vc.
- Botão separado **Onde abastecer**, sem gravar custo.
- Ipem e selo de “não adulterado” ficaram de fora de propósito.
