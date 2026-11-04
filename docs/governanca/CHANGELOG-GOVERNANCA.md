# Changelog — Governança Torres

## 2026-11-04 — WhatsApp da atualização só no celular, com o mapa da rota

- O botão de compartilhar no WhatsApp fica na visão do celular. No computador ele sai do aviso e da leitura da mensagem.
- O aviso da atualização mostra o mapa da origem ao destino, o mesmo da ordem de serviço, com o ponto da viatura quando há GPS.
- Não entra no custo do abastecimento, no boletim nem no balanço.

## 2026-11-04 — O aviso da atualização mostra a missão e manda o formulário

- A tela da atualização do agente passa a mostrar cliente, origem e destino da ordem de serviço. A leitura usa a OS que está na viatura ou, se o rastreamento ainda não casou, a grade operacional.
- O WhatsApp continua levando a foto junto com o texto. O texto volta a ser o formulário completo da missão, o mesmo modelo já usado no compartilhamento, com a frase desta atualização no campo de atualização.
- Não entra no custo do abastecimento, no boletim nem no balanço.

## 2026-11-04 — WhatsApp de novo leva a foto e o texto da atualização

- No layout novo, a lista que compartilhava a atualização do vigilante ficou escondida. O aviso no celular só marcava como lida.
- O botão verde volta no aviso e na leitura da mensagem. No celular ele abre o compartilhamento com a foto e o texto juntos, para o WhatsApp. O aviso rola na tela do celular para o botão não ficar cortado.
- Não entra no custo do abastecimento, no boletim nem no balanço.

## 2026-11-03 — O hospital ganha pino a partir do endereço

- A lista do CNES já estava no sistema, com 6.746 hospitais e nenhuma latitude. A tela fechava em "nenhum em 25 km" sem marcar o endereço.
- A consulta lê a rua e o número. Entra o nome do hospital ou o número na rua certa. Número igual em outra rua e o centro de São Paulo ficam de fora.
- No GPS de Santana de Parnaíba o degrau fica em 10 km, com o Santa Ana a 5,1 km.
- Não entra no custo do abastecimento.

## 2026-11-03 — Telefone e os dois serviços no socorro

- A lista só fecha quando já tem borracharia e mecânico, ou quando acaba o teto de 25 km. O degrau é o menor que alcança o mais perto de cada um.
- O telefone sai do cadastro do ponto no mapa. Entra no cartão no formato (11) 4688-2029. Sem número no cadastro, o cartão fica com o endereço e o Waze.
- Não entra no custo do abastecimento.

## 2026-11-03 — Socorro de borracharia e mecânico sob demanda

- O botão no celular consulta só quando o vigilante toca. Não baixa o cadastro da Receita e não grava tabela.
- Entram borracharia e mecânico em volta do GPS, na mesma régua de 5 a 25 km. Autopeças e guincho ficam de fora. O Waze abre o ponto aceito.
- Se a consulta não responder, a tela diz isso e tenta o mapa do celular. Lista vazia só fecha em "até 25 km".
- Não entra no custo do abastecimento, no boletim nem no balanço.

## 2026-11-03 — Hospitais do CNES na mesma régua do posto

- A lista oficial é o CSV diário de estabelecimentos do Ministério da Saúde. Entram hospital geral, hospital especializado e pronto-socorro ativos. Clínica, laboratório e hospital-dia ficam de fora.
- Público, particular e filantrópico saem da natureza jurídica. "Atende SUS" sai do campo do próprio CNES. A esfera municipal não separa particular de público.
- A latitude do arquivo não é usada. O mapa do celular lê o endereço e grava o ponto, com a mesma regra do posto. Não entra no custo do abastecimento.

## 2026-11-03 — O mapa do celular lê o endereço do posto

- A lista da ANP já estava no sistema, com 5.940 postos, e nenhuma latitude gravada. Photon e Nominatim, chamados do servidor, não deixaram pino nenhum.
- O mesmo mapa que confirma o GPS lê o endereço da ANP no celular. Entra telhado ou quadra interpolada. Aproximado, centro do município e janela larga ficam de fora. Modelo de texto não inventa coordenada.
- O pino aceito volta no mesmo `GET /api/mobile/onde-abastecer`, só para CEP da lista limpa e a até 30 km. A próxima abertura não lê de novo.
- Não entra no custo do abastecimento.

## 2026-11-03 — Posição confirmada na missão, no ponto operacional e no abastecimento

- O mapa e a frase "Posição confirmada", com a precisão em metros, saem do Onde abastecer e entram na missão, no ponto operacional e no formulário de abastecimento.
- A leitura é a mesma: GPS fino, uma vez, sem um segundo acompanhamento contínuo.
- O lançamento do abastecimento continua gravando a coordenada na hora de salvar. Se essa leitura falhar, vale a posição já confirmada na tela.
- Não entra no custo do abastecimento nem nas horas do ponto.

## 2026-11-03 — Onde abastecer acha posto da cidade vizinha

- A lista nacional já estava no sistema. Latitude nula era lida como 0, o posto caía no Golfo da Guiné e a tela dizia que não havia ninguém em 25 km sem consultar o endereço.
- A faixa de CEP agora puxa o município vizinho inteiro. O ponto entra na régua com o número da ANP ou com um grupo curto do mesmo CEP. Avenida espalhada e o centro de São Paulo continuam de fora.
- A frase da lista conta a cidade do GPS. Santana de Parnaíba, sem posto na pesquisa, não herda a contagem de Barueri.
- Não entra no custo do abastecimento.

## 2026-11-03 — Mapa da posição no Onde abastecer

- A tela mostra o mapa do GPS assim que a posição chega, com a frase "Posição confirmada" e a precisão em metros.
- A mesma resposta traz a contagem da lista já gravada: postos no sistema e quantos estão na cidade do GPS.
- Não entra no custo do abastecimento.

## 2026-11-03 — Régua de raio no Onde abastecer

- A busca não para mais em 5 km. Os degraus são 5, 10, 15 e 25 km. Vale o menor degrau que já tem posto localizado com histórico limpo.
- Sem posto nesse teto, e ainda com CEP por consultar, a tela continua em localização. O vazio só fecha em "até 25 km".
- Não entra no custo do abastecimento.

## 2026-11-03 — Onde abastecer só fala "neste raio" depois de localizar

- A tela dizia "Nenhum posto com histórico limpo neste raio" com `anp_cep_geo` em zero linhas e nenhuma latitude gravada. O nome da cidade, se não batia, encerrava a consulta antes de qualquer endereço.
- O CEP da BrasilAPI para a Avenida Raimundo Pereira de Magalhães devolve o centro de São Paulo (`-23.5475, -46.63611`). Photon sem o número cola a avenida inteira num extremo, a cerca de 9 km do escritório. Nenhum dos dois prova que o posto está fora dos 5 km.
- A consulta agora pega o CEP do mesmo GPS, localiza primeiro a faixa de 80 mil números ao redor e só aceita ponto com o número da casa. Centro do município e avenida sem número não entram no raio. Enquanto sobrar CEP nessa faixa, a resposta é `locating` e o aplicativo tenta de novo.
- Não entra no custo do abastecimento.

## 2026-11-03 — Carga da ANP a cada 30 minutos

- O bucket `thirty-min` já existia (Vercel Cron e `node-cron`). Ele passa a chamar `syncAnpReference`, a mesma carga do `POST /api/admin/anp-stations/sync`.
- Enquanto a base estiver vazia ou a qualidade tiver ficado pela metade (o tempo da função da Vercel estoura), o bucket `minute` continua a mesma carga. Preço já gravado não é baixado de novo, e a qualidade só marca quem ainda está sem `quality_known`. Um lock em `system_settings` impede outra carga paralela por 8 minutos.
- Saiu o horário único de segunda 04:20. O arquivo da ANP é mensal; a repetição só regrava as mesmas linhas.
- Não entra no custo do abastecimento.

## 2026-11-03 — Onde abastecer distinguia base vazia de raio sem posto

- Publicado na `main` e na `dev` em 03/11/2026, horário de Brasília.
- Com as tabelas da ANP em zero linhas, a cidade do GPS caía em "Nenhum posto com histórico limpo neste raio".
- Sem nenhum posto com `quality_known` no país, a resposta é `not_loaded` (cartão âmbar). Cidade sem posto, depois da carga, continua `no_station`.
- Posto ainda sem coordenada é buscado pelo endereço. O CEP da BrasilAPI fica como reserva: em São Paulo ele repete o centro do município e o raio de 5 km em Pirituba ficava vazio.
- A carga em si não muda: segunda às 04:20 (America/Sao_Paulo) ou `POST /api/admin/anp-stations/sync`. Não entra no custo do abastecimento.

## 2026-11-03 — Onde abastecer com a ANP publicado

- O botão **Onde abastecer** entra na home do agente, com preço e histórico de qualidade da ANP.
- A base de preços não vem no deploy. A carga é na segunda às 04:20 (America/Sao_Paulo) ou em `POST /api/admin/anp-stations/sync`.
- Não altera o custo do abastecimento.

## 2026-11-03 — Apólice do Mobi é o contrato já anexado

- O Mobi pedia apólice e contrato separados. Quem anexava o contrato continuava vermelho, com a apólice vazia.
- O contrato já gravado vale como apólice. A tela do Mobi fica com um anexo só.
- Um upload novo grava o arquivo na apólice e, se o contrato estiver vazio, também nessa coluna.

## 2026-11-03 — NFS-e preservada depois da confirmação

- O dono confirmou que a descrição curta e a DPS nacional funcionaram. A regra ficou em `04-REGRAS-NEGOCIO-CRITICAS.md`.
- Ponto de restauração: tag `safety/nfse-dps-ok-2026-11-03` no commit `975fb689`, o mesmo que está em produção.
- Não voltar a listar OS da Torres na nota nem reenviar endereço do prestador, código municipal de 5 dígitos, `pAliq` ou `indTotTrib` no optante sem retenção de ISS.

## 2026-11-03 — Descrição da NFS-e sem a lista de OS

- A sugestão da nota fica em `Ref. escolta armada (período)` ou `Ref. vigilância (período)`, mais a linha do Anexo IV quando há INSS retido e a frase do Simples.
- Número de OS da Torres, vínculo GTM e pedido de compra não entram nesse texto.
- MULTILOG continua com `OS.` e `SM.`. Omega Solutions continua com `PROCESSO` / `PROCESSOS`. As duas regras já existiam no boleto e no boletim.
- A descrição comercial da fatura e o boleto não mudam.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-DESCRICAO-CURTA-2026-11-03.md`.

## 2026-11-03 — Regime do Simples na DPS

- A fatura 241 parou na regra E0166: ME/EPP tem de informar o regime de apuração. A Torres vai com o regime 1, tributos federais e ISS pelo Simples, coerente com o regime especial nenhum.
- Sem retenção de ISS, a alíquota municipal sai do payload. O percentual aproximado do Simples vai em `percentual_total_tributos_simples_nacional`, com o valor já configurado (`FOCUS_ALIQUOTA_SIMPLES` ou 5).
- O indicador de “não informar tributos” sai da nota do optante. A Sefin não aceita esse indicador para ME/EPP.

## 2026-11-03 — DPS sem endereço do prestador

- A Sefin recusou a fatura 241: o endereço nacional do prestador não pode ir na DPS quando a própria Torres emite. Saíram município, CEP, logradouro, número e bairro do prestador. O município da emissão continua `3550308`.

## 2026-11-03 — Sefin recusou a DPS da fatura 241

- O XML saía sem CEP e sem logradouro do prestador. A DPS agora manda o endereço já impresso no boletim: Avenida Raimundo Pereira de Magalhães, 5720, Pirituba, CEP 02938-000.
- `07897` e `07870` não vão mais no campo municipal. A Sefin só aceita 3 dígitos nesse campo. A nota segue com o código nacional e o NBS.
- O grupo de tributos passa a informar que não há estimativa (`indicador_total_tributacao` 0). Não inventamos a alíquota cheia do Simples.

## 2026-11-03 — Observação legal na descrição da NFS-e

- A sugestão da nota termina com a frase do Simples Nacional já usada no boleto.
- Se a fatura tem INSS retido (`valor_inss_retido` > 0), a linha do Anexo IV entra antes dessa frase.
- PIX, agência ou dados bancários que já estejam na fatura seguem para o mesmo rodapé. O texto cabe em 2.000 caracteres e continua editável no modal.

## 2026-11-03 — Conferência da NFS-e antes de emitir

- O botão Emitir NFS-e abre um modal. A Beatriz confirma Escolta (`110301`) ou Vigilância (`110201`) e edita a descrição.
- A sugestão daquela entrega listava OS, SM, controle e PO. A entrada de 2026-11-03 “Descrição da NFS-e sem a lista de OS” substitui essa parte: o texto padrão não lista mais a OS da Torres.
- `POST /api/invoices/:id/emit-nfse` aceita `{ category, descricao_servico }`. Sem esses campos, a emissão automática segue com a regra já gravada.
- A descrição comercial da fatura não é reescrita. O boleto continua com o texto anterior.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-PRE-EMISSAO-2026-11-03.md`.

## 2026-11-03 — NFS-e Ambiente Nacional (Focus /v2/nfsen)

- Emissão nova sai por `POST /v2/nfsen` (DPS). Consulta e cancelamento usam `/v2/nfsen`. Nota já emitida na Paulistana (`/v2/nfse`) só é consultada ou cancelada se o nacional responder 404.
- Vigilância: `110201` / NBS `118025000` / municipal `07870`. Escolta: `110301` / NBS `118023000` / municipal `07897`. A categoria sai de `service_orders.type`; sem tipo, da descrição. Sem sinal, fica escolta.
- Optante do Simples envia `percentual_aliquota_relativa_municipio` (`FOCUS_ALIQUOTA_SIMPLES` ou a alíquota 5 já usada na NFS-e). `valor_cp` só quando `invoices.valor_inss_retido` é maior que zero.
- As mesmas colunas de `invoices` recebem status, número, código de verificação, DANFSe e XML. Boleto segue no Asaas.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-NACIONAL-2026-11-03.md`.

## 2026-10-13 — Protocolo de assinatura de volta na listagem

- O botão **4-PROT ?** da listagem de contas a pagar voltou. Lançamento pago ou aprovado volta a aceitar a foto das contas assinadas.
- A fila Aguardando aprovação continua com o atalho. A API não exige essa fila.
- O teste antigo só procurava a função em qualquer lugar do arquivo e deixou a mudança de 01/10 passar. Agora o teste exige o botão dentro da coluna Conferência.

## 2026-10-03 — Gestão: e-mail ou CPF só para admin/diretoria

- Aba Gestão aceita e-mail **ou** CPF.
- CPF na gestão só resolve se o usuário for `admin` ou `diretoria` (fail-closed no servidor). Funcionário continua na aba Funcionário (app de campo).
- Não altera o motor de faturamento.

## 2026-10-03 — Header da área interna no iPhone (safe-area)

- Causa: o ajuste anterior (`cursor/fix-admin-iphone-safe-area-6527`) **não entrou na main**. O header mobile ficava sob o relógio/Dynamic Island (`viewport-fit=cover` + status bar translúcida), então o botão do menu não respondia ao toque.
- Reaplicado o recuo com `pt-[calc(...+env(safe-area-inset-top))]` (não usar `py-3` + `.safe-area-top`, que se anulam). Drawer fecha ao navegar.

## 2026-10-03 — Ricardo Tadeu: admin operacional sem financeiro

- Usuário ativo do Ricardo Tadeu (id 46) passa a ser administrador do painel, sem ver Controladoria (Balanço, Contas, Relatório de NFs, faturas, Asaas/NFS-e).
- Recorte por pessoa, no mesmo padrão do Moacir: o papel `admin` dos demais não muda.
- Publicação e troca do `role` no banco só após o pedido explícito / merge.

## 2026-09-23 — Datas de input em DD/MM/YYYY (DateInputBR)

- Inputs nativos `type="date"` trocados por `DateInputBR`: exibição sempre `dd/mm/aaaa`, valor interno `YYYY-MM-DD`.
- Independente do locale do SO/navegador (evita `01/21/2026` no Windows em inglês).

## 2026-09-23 — Pedágio: +20% na cobrança, exceto operação DHL

- OS nova com **Operação DHL** desmarcada cobra pedágio ao cliente com acréscimo de 20%. DHL marcado, ou OS antiga sem a escolha, segue repasse 1:1.
- O comprovante e o reembolso operacional não levam o acréscimo. Billing já congelado não é recalculado.

## 2026-09-23 — ISS 5%: retenção desligada (Focus + boleto Asaas)

- Pedido do dono: não cobrar mais ISS 5% na NFS-e Focus nem no boleto Asaas.
- Fonte única: `ISS_RETAIN = false` em `server/lib/asaas-helpers.ts` (Focus `iss_retido`, boleto via `boletoRetentionOpts`, taxes Asaas, e-mail/relatório líquido).
- INSS 11% quando emite NF permanece. Alíquota de referência `ISS_ALIQUOTA = 5` só informa o campo fiscal; sem `valor_iss_retido`.

## 2026-09-22 — Relatório de NF: bruto e líquido na mesma coluna

- O deploy anterior falhou: `asaas.ts` importava `invoice-payment` que não estava no git. Arquivo e o rateio puro (`invoice-allocation`) entram no repositório para o build da Vercel passar.
- Bruto e líquido ficam na coluna Valor (sempre visíveis, sem rolagem extra). Excel continua com colunas separadas.

## 2026-09-22 — Relatório de NF: valor bruto e líquido

- O Relatório de NF passa a mostrar **Valor bruto (NF)** (`invoices.value`) e **Valor líquido** após ISS 5% + INSS 11%, com o mesmo motor do boleto (`netBoletoValue` / `boletoRetentionOpts`). Excel e tabela de notas pagas seguem a mesma regra.

## 2026-09-22 — NFS-e 192 Nimbus: tomador fora de SP

- A Paulistana recusou: município da prestação era São Paulo, mas o tomador é Serra/ES (serviço tributado fora).
- Correção: tomador com IBGE ≠ 3550308 usa natureza 2 e `servico.codigo_municipio` da cidade do tomador. CCM do tomador só entra se ele for de SP.

## 2026-09-22 — NFS-e 192 Nimbus: CCM do tomador só em São Paulo

- A Paulistana recusou a fatura 192: Nimbus é Serra/ES e o cadastro tinha inscrição municipal 4372204. Esse campo só vale para tomador estabelecido em São Paulo.
- Correção: a NFS-e Focus só envia CCM do tomador quando o IBGE é 3550308 (SP). Fora de SP o campo vai vazio.

## 2026-09-22 — NFS-e em erro: consultar e retransmitir

- O Relatório em NF com erro passa a **Retransmitir** (consulta Focus e, se continuar em ERROR, reemite na mesma fatura).
- Token inválido / homologação não sobrescreve o erro fiscal (ex.: e-mail do tomador).
- Abrir ou sincronizar o Relatório reprocessa até 8 NFs em erro. Cron continua a fila. Não gera segundo boleto nem segunda NF autorizada.

## 2026-09-22 — Focus: preview da Vercel não usa homologação com token de produção

- Sintoma: Relatório “Falha ao sincronizar NF / Access token inválido (host: homologacao.focusnfe.com.br)”.
- Causa: preview tem `VERCEL_ENV=preview` e `NODE_ENV=production`. O preview vinha primeiro e a consulta ia para homologação com o token de produção.
- Correção: `FOCUS_NFE_ENV=producao` e `NODE_ENV=production` (sem homolog explícito) usam `api.focusnfe.com.br`.

## 2026-09-22 — Relatório de NF: Sincronizar Focus, não Asaas

- O botão do topo deixa de chamar `/api/asaas/reconcile-all`.
- Passa a consultar a Focus em `/api/relatorio-nf/sync-focus` (o mesmo sync ao abrir a tela).
- Não reemite nota. Boleto continua no Asaas; o Relatório só atualiza o espelho da NFS-e.

## 2026-09-22 — NFS-e: e-mail do tomador só do campo financeiro

- A nota na Focus usa o primeiro e-mail de `clients.email_financeiro` (cadastro Torres). Não mistura operacional, contratual nem o e-mail genérico.
- O e-mail da fatura ao cliente vai para a lista do campo financeiro. CC interno permanece financeiro@ / adm@.

## 2026-09-22 — NFS-e Nimbus 192: e-mail do tomador > 75 caracteres

- Causa: a Paulistana recusou `EmailTomador` com 80 caracteres. O Torres juntava todos os e-mails financeiros da Nimbus numa string e cortava em 80.
- Correção: a NFS-e Focus envia só o primeiro e-mail válido (teto 75). Boleto Asaas da fatura 192 já estava emitido.

## 2026-09-22 — Ver NF: PDF DANFSe, nunca HTML da prefeitura

- Causa: `nfse_url` da fatura 191 era `notaprint.aspx` da prefeitura. Essa página só mostra “Aguarde... Carregando Nota Fiscal...” e depende de JavaScript — o proxy do Torres removia os scripts.
- Correção: `focusPdfUrl` ignora a URL da prefeitura; Ver NF baixa o DANFSe da Focus (S3, PDF de verdade) e grava esse endereço na invoice.

## 2026-09-22 — Ver NF Focus (DANFSe) + sync ao abrir Relatório + e-mail com 3 anexos

- **Ver NF** usa o PDF DANFSe da Focus (`url_danfse`), não a página HTML da prefeitura nem `fiscalInfo` do Asaas.
- Abrir o Relatório de NF dispara `POST /api/relatorio-nf/sync-focus`: consulta status ativo/cancelado na Focus e grava na `invoices`.
- NFS-e Asaas desligada de ponta a ponta (`asaasRequest` recusa `/invoices` fiscal). Boleto/PIX/baixa continuam no Asaas.
- E-mail ao cliente: To do cliente, CC financeiro@ e adm@, BCC thiago@; anexos boleto Asaas + NFS-e Focus + boletim de medição (espelho do snapshot).

## 2026-09-22 — Sync Focus: não usar homologação no ar

- `FOCUS_NFE_ENV` vazio/`[SENSITIVE]` em Vercel production consulta `api.focusnfe.com.br`, não `homologacao.focusnfe.com.br`.
- `/sync` de fatura já autorizada não apaga a NF se a consulta Focus falhar.

## 2026-09-22 — Faturar: boleto Asaas + NFS-e Focus + e-mail; Asaas não emite mais NF

- Gerar Fatura (Relatório de Faturamento) sempre cria boleto Asaas e NFS-e Focus na mesma operação.
- E-mail ao cliente só depois de boleto + NF: To do cliente, CC financeiro@ e adm@, BCC thiago@grupotmseg.com.br.
- Baixa: webhook Asaas (RECEIVED/CONFIRMED) marca fatura/OS pagas (`applyPaymentToInvoice` + MARK_PAID).
- Emissão de NFS-e no Asaas (`POST /invoices` fiscal) bloqueada. Relatório de NFs: boleto Asaas × NF Focus.

## 2026-09-22 — Relatório de NF: tela em branco + coluna Boleto Asaas

- Causa: o import de `AdminLayout` foi trocado por `classifyIssuedOrProcessing` e a página quebrava ao abrir.
- Colunas: **Boleto Asaas** (badge verde Emitido + link) e **NF (Focus)** (status, nº municipal, Ver NF / Emitir NF). Não exibe `inv_*`.
- `inv_*` Asaas já cancelado deixa de bloquear nova emissão Focus na mesma fatura.

## 2026-09-22 — Relatório de NF: coluna Asaas (boleto) × coluna NF Focus

- A tela `/admin/relatorio-nf` deixa de misturar boleto e NFS-e na mesma coluna de status.
- **Asaas**: badge verde “Emitido” com link do boleto (`bank_slip_url` / `invoice_url`).
- **NF (Focus)**: status próprio (Emitida / Emitindo / Erro / Corrigir / Cancelada), número municipal e botão verde “Ver NF”.

## 2026-09-22 — Boleto Asaas + NFS-e Focus em conjunto (ISS 5% / INSS 11%)

- Discriminação única: escolta armada, período, texto INSS Anexo IV e Simples Nacional (art. 30 Lei 10.833/2003) no boleto Asaas e na NFS-e Focus.
- Boleto líquido = bruto − INSS 11% − ISS 5% quando emite NF. NFS-e bruta na Focus.
- Número do tomador extraído do logradouro quando `address_number` está vazio.

## 2026-09-22 — NFS-e via Focus NFe (substitui emissão Asaas)

- Emissão, consulta e cancelamento de NFS-e passam ao satélite Focus NFe (São Paulo / Nota Fiscal Paulistana). Boleto/PIX continuam no Asaas.
- Tabela `invoices` estendida (`nfse_ref`, `nfse_codigo_verificacao`, `nfse_xml_path`, `nfse_provider`). Sem segunda tabela de notas.
- Backend Express (`/api/invoices/:id/emit-nfse`); sem Edge Function (auth/roles oficiais).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-FOCUS-NFE-2026-09-22.md`.

## 2026-09-17 — Quinzena do boletim pela data de agendamento

- Filtro do Relatório de Faturamento, envio ao cliente e gerar fatura usam `service_orders.scheduled_date` (1–15 = 1ª quinzena; 16–último dia = 2ª).
- `escort_billings.data_missao` deixa de definir o ciclo (cancelada lançada depois não mistura quinzenas).
- Gate `enviar-aprovacao` e cobertura do boletim leem a data da OS, não a gravação do billing.

## 2026-09-17 — NFS-e: `municipalServiceId` string `"402"` (não 402.0)

- Causa: o Asaas recebia número (`402.0` no log). Natan: o JSON tem de ser `"municipalServiceId": "402"`.
- Correção: `asMunicipalServiceIdString` no motor único; omitir `municipalServiceCode`; log `[asaas] NFS-e wire JSON` com `typeof` e `JSON.stringify` do ID.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-MUNICIPAL-ID-STRING-2026-09-17.md`.

## 2026-09-14 — NFS-e Asaas: `_NFe002` código municipal ausente

- Causa: Torres no Portal Nacional enviava `municipalServiceId` 402; o portal ignora o código `07870` e devolve `_NFe002`.
- Correção (padrão TM SEG + FAQ Asaas): `municipalServiceCode` 07870, `municipalServiceName` `"07870 - …"`, `municipalServiceId: null`. Código da Torres permanece 07870 (não copiar 07930).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-NFE002-CODIGO-MUNICIPAL-2026-09-14.md`.

## 2026-09-14 — NFS-e Asaas: emissão não conclui (PROCESSING eterno)

- Causa: `setTimeout` da NF isolada morre no Vercel; timeout 8s abortava `POST /invoices`; SYNCHRONIZED + “falha ao comunicar” / `_NFe002` ficava só em consulta; PROCESSING local escondia o botão Emitir.
- Correção: `await emitIsolatedNfse` na mesma isolate; timeout 45s em `/invoices`; `municipalServiceId` 402 padrão; `effectiveDate` BRT; authorize na mesma `inv_*` sem segundo POST; cron NF primeiro no bucket de 5 min.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-TRAVADA-PROCESSANDO-2026-09-14.md`.


## 2026-09-10 — NFS-e isolada (cobrança + worker, espelho TM SEG)

- Cobrança Asaas e NFS-e deixam de ir na mesma request. Fatura local fica `PROCESSING`; `POST /invoices` sai no kick `/api/nf/retry/:id` e no cron de 5 min.
- Sem segundo POST em NF já na prefeitura. Código municipal da Torres permanece `07870` (não o `07930` da TM).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-ISOLADA-2026-09-10.md`.

## 2026-09-10 — Observação da NFS-e (modelo financeiro, ≤250)

- `observations` da NFS-e: CNAE, Escolta Armada, período, INSS Anexo IV, Simples Nacional, bruto/ISS/líquido. Discriminacao municipal permanece o texto CNAE oficial.
- SSOT: `buildNfseObservations` em `asaas-helpers.ts`. Teto `NF_OBSERVATIONS_MAX = 250`.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-OBSERVACOES-2026-09-10.md`.

## 2026-09-10 — Seguro do Mobi (apólice + contrato no cadastro da viatura)

- Só Fiat Mobi: anexar apólice e contrato de seguro no cadastro. Polo não exige.
- Arquivos no bucket privado `vehicle-docs` (caminho curto em `vehicles`); lista em vermelho se faltar.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-VTR-SEGURO-MOBI-2026-09-10.md`.

## 2026-09-10 — NFS-e: INSS 5,5% (50% de 11%) + ISS 2% retido

- Pedido do dono: reter na NF 50% dos 11% de INSS e 2% de ISS (`retainIss: true`).
- Motor único: `buildNfseInvoicePayload` / `netBoletoValue` em `asaas-helpers.ts`. Cadastro `inss_aliquota` continua a alíquota legal.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-RETENCOES-2026-09-10.md`.

## 2026-09-10 — NF e boleto Asaas (SYNCHRONIZED, PIX, e-mail)

- Faturas: `SYNCHRONIZED` sem nº municipal não é mais “NFS-e emitida”.
- Boleto: `notificationDisabled: false` + fallback da política de e-mail no customer (GET notifications do payment dá 404).
- PIX copia-e-cola também no tipo BOLETO; reconcile/`/sync` preenchem se faltar.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-ASAAS-NF-BOLETO-2026-09-10.md`.

## 2026-09-10 — Controle de Faturamento (Diretoria)

- KPI de cobertura por ciclo do cadastro (quinzenal 1–15/16–fim, mensal, diário). Projeção: OS + billing oficial + fatura.
- Gate no boletim: não envia se faltar OS do período ou se não estiver APROVADA (recusada fora).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-CONTROLE-FATURAMENTO-2026-09-10.md`.

## 2026-09-09 — Grid Maps: loader único + chave de servidor na rota

- Causa: dois loaders do Google (Places sem `geometry`) e `/route` no servidor usando só `VITE_GOOGLE_MAPS_API_KEY` (restrita por site).
- Loader único `places+geometry` + `importLibrary`; Directions no servidor usa `googleMapsServerKey()` (mesma cascata do pedágio).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-GRID-MAPS-LOADER-2026-09-09.md`.

## 2026-09-09 — Grid: origem/destino ao lado da placa + % da missão

- Card de atualizações e identidade da viatura passam a mostrar cliente + origem / destino da OS (campos já existentes na API).
- Barra no padrão TMSEG (Acompanhamento KM + % salvo + carro na trilha), cores Torres (âmbar → índigo → negro). Cálculo continua `getRouteProgress`.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-GRID-ORIGEM-DESTINO-PROGRESSO-2026-09-09.md`.

## 2026-09-09 — CCM do tomador no Sincronizar (não é nº da NFS-e)

- `07930` no cadastro Pacheco é CCM do tomador (`clients.inscricao_municipal`), não o número da NFS-e da fatura.
- Customer Asaas passa a receber CCM se o valor Torres for diferente (antes só preenchia se estivesse vazio).
- `/sync` e reconcile enviam CCM ao tomador; **não** reemitem NF já na prefeitura. Sem botão Reemitir em NF processando (esperado).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e lacunas #171/#170 (erro visível, PUT, sem segundo POST)

- #171 (SYNCHRONIZED, sem RPS, Discriminacao antiga) = rejeição escondida: `ERROR` local + Resolver; cancel só no painel Asaas; quando ERROR, PUT na mesma `inv_*`.
- #170 (oficial + RPS 295) = só poll. Sem cancel, sem segundo POST.
- `/sync` não zera relógio em no-op; “Sincronizar c/ Asaas” solta `running` após 3 min.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e #171 Discriminacao antiga travada em SYNCHRONIZED

- FAT #171 ainda tinha `serviceDescription` = Escolta Armada/cliente/OS (payload que a SP já rejeitou na #170). Asaas `SYNCHRONIZED` sem RPS; **recusa cancelar** (“Processando emissão”).
- FAT #170 já está com Discriminacao oficial + RPS 295 — fila real da prefeitura.
- Catch-up: cancel+POST só se Discriminacao antiga e Asaas deixar cancelar; se recusar, espera 30 min. Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e processando: sync não reemite; relógio e rejeição oculta

- `SYNCHRONIZED` sem nº municipal continua só consulta (satélite Asaas). Rejeição escondida em `statusDescription` vira `ERROR` local.
- `/sync` não grava `updated_at` em no-op; `nfReconcileState.running` solta após 3 min se o isolate morrer.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e Discriminacao (Asaas / prefeitura SP)

- `serviceDescription` da NFS-e passa a ser sempre o texto CNAE oficial; nome do cliente e período ficam em `observations`, sem travessão tipográfico.
- Reprocesso de NF em ERROR reutiliza o `inv_*` existente (`PUT` + `authorize`) — não cria segunda nota na mesma cobrança.
- Catch-up automático só para rejeição de schema Discriminacao e cliente `emite_nf=true`. Processando (ex.: FAT #171) continua só consulta. Inscrição municipal da empresa no Asaas (MULTILOG) não é auto-retry.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-DISCRIMINACAO-ASAAS-2026-09-09.md`.

## 2026-09-09 — ACL de linha do perfil comercial

- Perfil `comercial` só lê clientes com `responsavel_comercial_id = users.comercial_id` **ou** `created_by_user_id = users.id`.
- Sem vínculo e sem cadastro próprio: lista vazia (fail-closed). Recurso fora do escopo responde 404.
- Sem tabela `comerciais` e sem FK. Relatório: `docs/governanca/RELATORIO-ENTREGA-ACL-COMERCIAL-ESCOPO-2026-09-09.md`.

## 2026-09-09 — vínculo comercial + ingestão de comissões (TORRES → TM SEG)

- Cadastro de cliente passa a gravar `clients.responsavel_comercial_id` (UUID, sem FK/tabela `comerciais`).
- Lista de comerciais ativos via proxy autenticado `GET /api/comerciais` (token só no servidor).
- Emissão/baixa/cancelamento de fatura disparam POST fail-soft `FATURADO`/`PAGO`/`CANCELADO` para a TM SEG.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-COMISSAO-INGEST-TMSEG-2026-09-09.md`.

## 2026-08-06 — security(users): close plain password removal (PR4C / Fase 4.9)

- PR4B confirmado pelo proprietário como aplicado no projeto Torres (`erjhxwbutjyylxdthuuz`) via migration versionada `20260805210000_drop_users_plain_password`.
- Pré-voo: backup físico de 2026-08-06 07:56:45 UTC disponível para restore; baseline 36 users / filled 0 / null 36 / Auth match 36 / dependências 0.
- Pós-DROP: `verify-drop-plain-password.sql` executado sem exceções; coluna ausente, demais colunas/Auth/RLS/policies/grants preservados.
- Sistema acessado normalmente após o APPLY, sem regressão observada, conforme confirmação humana; rollback não executado.
- PR4C é exclusivamente documental: sem código, banco, migration ou publicação.
- D13 (`users.plain_password`) → **ENCERRADA — COLUNA REMOVIDA E VERIFY APROVADO**.
- Branch: `cursor/pr4b-4-5b-homologacao-35ed` (PR existente #56; nenhum PR novo).

## 2026-08-06 — security(users): strengthen plain password dependency guards (4.5C)

- Fase **4.5C**: finalização/validação dos ajustes preventivos no PR #55 (sem merge, sem DROP, sem alteração de banco).
- Cobertura confirmada: `pg_depend` (relid+attnum), functions/procedures, rules/`pg_rewrite`, grants diagnóstico, fail-closed, sem CASCADE.
- Validação: testes de contrato 104/104; `git diff --check` OK após correção de trailing whitespace no relatório 4.5B.
- Typecheck: ~436 erros pré-existentes no repo; **0** nos arquivos desta PR.
- Build: no agent falha sem `VITE_SUPABASE_*`; com placeholders → **build OK** (sem erros novos desta PR).
- D13 / status: **PR4B PREPARADO — DROP AINDA NÃO APLICADO** (baseline live depende de SQL Editor/MCP autenticado).
- Branch: `security/prepare-drop-plain-password-column` (PR #55)

## 2026-08-06 — security(users): continue PR4B / 4.5B homologation package

- Continuidade da fase **4.5B**: script de homologação live PASS/FAIL (`scripts/security/homologate-drop-plain-password-baseline.sql`) alinhado aos guards da migration.
- Runbook atualizado com matriz 4.5A/4.5B (estática OK; baseline DB pendente; DROP não aplicado).
- Testes de contrato ampliados; **sem** execução de DROP; **sem** alteração de banco/produção.
- D13 permanece: **PR4B / 4.5B HOMOLOGAÇÃO ESTÁTICA OK — BASELINE DB PENDENTE — DROP AINDA NÃO APLICADO**.
- Branch: `cursor/pr4b-4-5b-homologacao-35ed` (continuidade da PR #55)

## 2026-08-05 — security(users): strengthen plain password dependency guards

- PR4B / 4.5B: cobertura preventiva reforçada na migration de DROP (ainda **não** aplicada).
- Diagnóstico 4.5A: zero dependências reais (`pg_depend`=0); lacuna era de governança, não bloqueio técnico.
- Guards: `pg_depend` (deptype `n` + attnum), functions+procedures, rules/`pg_rewrite`; grants só diagnóstico.
- PostgreSQL já era fail-closed sem CASCADE; baseline/verify/testes alinhados ao catálogo canônico.
- Branch: `security/prepare-drop-plain-password-column` (PR #55)

## 2026-08-05 — security(users): prepare plain password column removal

- PR4B: artefatos versionados para DROP de `public.users.plain_password` — **não aplicados**.
- Baseline `scripts/security/baseline-drop-plain-password.sql`, verify `verify-drop-plain-password.sql`, migration `20260805210000_drop_users_plain_password`, rollback estrutural (coluna NULL sem valores), runbook `RUNBOOK-DROP-PLAIN-PASSWORD.md`.
- Fail-closed: total=36, filled=0, null=total, coluna existe, deps=0; sem CASCADE; sem alteração de Auth/RLS.
- PR4A já desacoplou código/tipos; coluna física ainda presente; backup obrigatório antes da aplicação; PR4C documentará o pós-DROP.
- D13 → **PR4B PREPARADO — DROP AINDA NÃO APLICADO**.
- Branch: `security/prepare-drop-plain-password-column`

## 2026-08-05 — security(users): remove plain password from application schema

- PR4A: remove `plainPassword` de `shared/schema.ts` e tipos derivados (`User` / `InsertUser`).
- `sanitizeUserWrite` / `toSafeUser` / `USER_SAFE_SELECT` preservados como bloqueios.
- Zero alteração no banco; coluna física permanece; sem DROP; sem migration nova.
- D13 → **PR4A CONCLUÍDO — CÓDIGO E TIPOS DESACOPLADOS; COLUNA FÍSICA AINDA PRESENTE — PR4B PENDENTE**.
- Branch: `security/remove-plain-password-from-code`

## 2026-08-05 — docs(security): record plain password cleanup incident and outcome

- PR3C: homologação pós-limpeza e documentação transparente do evento ad-hoc.
- Estado: total=36, filled=0, null=36, Auth match=36/36, verify PASS, coluna ainda existe.
- Migration versionada `20260805190500_null_legacy_plain_password` **não** consta no histórico Supabase; **não** se inseriu registro falso.
- Incidente: `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`.
- D13 → **VALORES LEGADOS LIMPOS — HOMOLOGAÇÃO PÓS-LIMPEZA CONCLUÍDA; COLUNA AINDA PRESENTE — PR4 PENDENTE**.
- Branch: `docs/plain-password-cleanup-applied`

## 2026-08-05 — security(users): prepare legacy plain password cleanup

- PR3A: baseline somente leitura, verify pós-limpeza, migration versionada (não aplicada), rollback documental e runbook.
- Artefatos: `scripts/security/baseline-plain-password-cleanup.sql`, `verify-plain-password-cleanup.sql`, `supabase/migrations/20260805190500_null_legacy_plain_password.sql`, `docs/security/RUNBOOK-PLAIN-PASSWORD-CLEANUP.md`.
- Sem UPDATE executado naquele PR; valores legados ainda 36/36 à época; sem hash de senha; sem rollback com senhas.
- D13 (à época) → **PR3A PREPARADO — LIMPEZA AINDA NÃO APLICADA** (depois: limpeza ad-hoc + PR3C).
- Branch: `security/prepare-plain-password-cleanup`

## 2026-08-05 — security(users): stop storing plain text passwords

- Writers de produção não gravam mais `plain_password` (create, reset, change-password, register-by-cpf, auto-login de funcionário).
- `sanitizeUserWrite` / `UserWriteInput` bloqueiam o campo no storage.
- `generateTempPassword` centraliza senha one-shot (sem `torres@123`).
- Create/reset continuam retornando `tempPassword`/`newPassword` só na resposta imediata.
- D13 → **WRITERS INTERROMPIDOS — VALORES LEGADOS AINDA PRESENTES** (PR3 limpeza, PR4 DROP).
- Branch: `security/stop-plain-password-writers`

## 2026-08-05 — security(users): block plain password exposure in API and UI

- `toSafeUser` virou allowlist explícita (`server/lib/safe-user.ts`); sem spread do user.
- `/api/auth/me`, `/api/users`, perfil e listagens não retornam senha (nenhuma role).
- Create/reset/`register-by-cpf` mantêm `tempPassword`/`newPassword` **one-shot** na resposta imediata.
- UI admin (`users.tsx` + modal de acesso em `employees.tsx`): remove senha persistida e fallback `torres@123`.
- Auth cache e leituras `storage` de users usam `USER_SAFE_SELECT` (sem `plain_password`).
- RLS já protege PostgREST; este PR protege API/UI; writers e coluna ainda existem.
- D13 → **MITIGADA NA API/UI — DEPENDÊNCIA E COLUNA AINDA PENDENTES** (PR2 writers, PR3 limpeza, PR4 DROP).
- Branch: `security/block-plain-password-exposure`

## 2026-08-05 — security(users): RLS applied and homologated on shared Supabase

- Migration `harden_users_rls` aplicada no projeto TORRES (~17:36 UTC).
- Verify `scripts/security/verify-users-rls.sql` OK; policies finais: só `users_select_own`.
- Smoke: anon negado; funcionário REST só própria linha e sem `plain_password`; admin `/api/auth/me` e `/api/users` OK; funcionário `/api/users` 403.
- C3 → **CORRIGIDO E HOMOLOGADO**; D10 encerrada; **D13 permanece aberta**.
- Backup nativo usado como rede: 2026-08-05 07:59:48 UTC.
- Sem publish Vercel; `main` intacta.

## 2026-08-05 — security(users): restrict authenticated select to safe columns

- Corrige modelo de grants: sem `GRANT SELECT ON TABLE`; authenticated possui SELECT somente nas colunas seguras + RLS own.
- `plain_password` excluída da lista concedida (forward, rollback e verify).
- Branch: `security/harden-users-rls` (PR #48)

## 2026-08-05 — security(users): harden RLS (migration pronta)

- Migration versionada `supabase/migrations/20260805164000_harden_users_rls.sql`.
- Remove policies `USING (true)` e admin JWT; authenticated só `users_select_own`.
- `REVOKE ALL` de anon; authenticated sem INSERT/UPDATE/DELETE; SELECT somente nas colunas seguras (sem `plain_password`).
- Verify: `scripts/security/verify-users-rls.sql`; runbook: `docs/security/RUNBOOK-USERS-RLS.md`.
- C3 → **MITIGADO PENDENTE DE HOMOLOGAÇÃO** (DB compartilhado Preview/Prod — aplicação não executada neste PR).
- Dívida **D13** registrada: `plain_password` preenchida; remoção em plano separado.
- Branch: `security/harden-users-rls`

## 2026-08-05 — PR1: desativação Banco Inter (fail-closed)

- Integração Inter **desativada por padrão** via `INTER_INTEGRATION_ENABLED` (`server/lib/inter-integration.ts`).
- Webhook `POST /api/inter/webhook/cobranca` → **410** sem mutações quando desativado; **503** se flag on sem config.
- Escritas Inter (cobrança, PIX, boleto, webhook setup) e crons reconcile bloqueados.
- UI: gateway Inter removido de Faturas; Contas a Pagar sem pagamento Inter.
- Histórico / tabelas `inter_*` / colunas invoice / APIs `/api/financeiro/*` preservados.
- C1 em `05-SEGURANCA.md` marcado **MITIGADO**; limpeza definitiva = PR2–PR4.
- Branch: `security/disable-banco-inter`

## 2026-08-05 — Emenda: reutilização obrigatória (P13 / D11 / G17)

- Incluído princípio **P13** e regra de desenvolvimento **D11**: pesquisar o existente antes de implementar; proibido duplicar lógica, segundo motor, nova tabela/API/componente sem evidência de inviabilidade.
- Gate **G17** no checklist de aprovação.
- Atualizados `README`, templates `10`/`11` e regra Cursor `governanca-torres.mdc` (item 0).

## 2026-08-05 — Fase 1.0 — Implantação documental

- Criada pasta normativa `docs/governanca/` com Arquitetura Oficial, Framework, SSOT, regras críticas, segurança, testes, deploy, RACI, dívidas e templates.
- Criada regra Cursor alwaysApply `.cursor/rules/governanca-torres.mdc`.
- Apontadores de precedência adicionados em `docs/ARCHITECTURE.md`, `AGENT_RULES.md`, `RULES.md` (conteúdo técnico antigo preservado).
- Branch: `docs/framework-governanca-torres`
- Ponto de restauração: tag `safety/pre-framework-governanca-6ccdfac0` (commit `6ccdfac0`)
- **Sem** alteração de comportamento de runtime, APIs, telas, banco ou produção.
- Riscos da auditoria: apenas documentados — **não corrigidos**.
