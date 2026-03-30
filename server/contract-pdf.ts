import PDFDocument from "pdfkit";
import type { Response } from "express";

interface ContractData {
  clientName: string;
  clientCnpj: string;
  clientAddress: string;
  clientCity: string;
  clientState: string;
  clientZip: string;
  clientContact: string;
  contractDate?: string;
}

const COMPANY = {
  name: "TORRES VIGILÂNCIA PATRIMONIAL LTDA",
  cnpj: "36.982.392/0001-89",
  address: "Rua Antônio de Mariz, 46",
  bairro: "Alto da Lapa",
  city: "São Paulo",
  state: "SP",
  zip: "05050-020",
};

export function generateContractPDF(res: Response, data: ContractData) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 70, bottom: 60, left: 65, right: 65 },
    bufferPages: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  const safeName = data.clientName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  res.setHeader("Content-Disposition", `attachment; filename="Contrato_Escolta_${safeName}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LM = doc.page.margins.left;

  const dateStr = data.contractDate || new Date().toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const FONT_NORMAL = "Helvetica";
  const FONT_BOLD = "Helvetica-Bold";
  const SIZE_TITLE = 13;
  const SIZE_BODY = 10;
  const SIZE_SMALL = 9;
  const LINE_GAP = 4;
  const PARA_GAP = 8;

  function checkPage(needed = 60) {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
    }
  }

  function title(text: string) {
    checkPage(40);
    doc.moveDown(0.8);
    doc.font(FONT_BOLD).fontSize(SIZE_TITLE).text(text, { align: "center", lineGap: LINE_GAP });
    doc.moveDown(0.6);
  }

  function clauseTitle(text: string) {
    checkPage(40);
    doc.moveDown(0.6);
    doc.font(FONT_BOLD).fontSize(SIZE_BODY).text(text, { align: "center", lineGap: LINE_GAP });
    doc.moveDown(0.4);
  }

  function body(text: string) {
    checkPage(30);
    doc.font(FONT_NORMAL).fontSize(SIZE_BODY).text(text, {
      align: "justify",
      lineGap: LINE_GAP,
      paragraphGap: PARA_GAP,
    });
  }

  function paragraph(text: string) {
    checkPage(30);
    doc.font(FONT_NORMAL).fontSize(SIZE_BODY).text(text, {
      align: "justify",
      lineGap: LINE_GAP,
      indent: 0,
    });
    doc.moveDown(0.3);
  }

  function bulletItem(text: string) {
    checkPage(25);
    doc.font(FONT_NORMAL).fontSize(SIZE_SMALL).text(text, LM + 20, doc.y, {
      width: W - 20,
      align: "left",
      lineGap: 3,
    });
    doc.moveDown(0.15);
  }

  // =====================================================
  // TÍTULO
  // =====================================================
  title("CONTRATO DE PRESTAÇÃO DE SERVIÇOS");

  doc.moveDown(0.3);

  // =====================================================
  // QUALIFICAÇÃO DAS PARTES
  // =====================================================
  doc.font(FONT_BOLD).fontSize(SIZE_BODY).text("CONTRATANTE: ", { continued: true });
  doc.font(FONT_NORMAL).text(
    `${data.clientName}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${data.clientCnpj}, com sede fiscal na ${data.clientAddress}, ${data.clientCity}, ${data.clientState}, ${data.clientZip}, representado neste ato por ${data.clientContact}.`
  , { align: "justify", lineGap: LINE_GAP });

  doc.moveDown(0.5);

  doc.font(FONT_BOLD).fontSize(SIZE_BODY).text("CONTRATADA: ", { continued: true });
  doc.font(FONT_NORMAL).text(
    `${COMPANY.name}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${COMPANY.cnpj}, com sede fiscal ${COMPANY.address} – Bairro: ${COMPANY.bairro} Cidade: ${COMPANY.city}/${COMPANY.state}.`
  , { align: "justify", lineGap: LINE_GAP });

  doc.moveDown(0.5);

  body("As partes, acima nomeadas e qualificadas, têm entre si como justo e acordado o presente Contrato de Prestação de Serviços de Escolta Armada, que se regerão pelos termos, cláusulas, obrigações e condições adiante articuladas:");

  // =====================================================
  // CLÁUSULA 1 - DO OBJETO
  // =====================================================
  clauseTitle("CLÁUSULA 1 - DO OBJETO");

  body("A CONTRATADA prestará a CONTRATANTE os serviços especializados de Escolta Armada, através do acompanhamento ostensivo de caminhões e veículos de carga, denominados auto cargas, que transportam mercadorias consideradas de alto risco quanto a roubos e furtos, conforme discriminação contida no Quadro Resumo, que fica fazendo parte integrante deste instrumento.");

  doc.moveDown(0.3);

  paragraph("§1º A segurança será realizada através do acompanhamento ostensivo de caminhões e veículos de carga, em vias públicas em geral, contando com o apoio de Viaturas de Escolta, devidamente identificadas com o brasão da CONTRATADA, equipadas com sistema de rádio comunicação e dotadas de 04 (quatro) portas, podendo ser inclusive rastreadas via satélite.");

  paragraph("§2º Os serviços de Escolta Armada serão prestados por vigilantes identificados através de crachá de identificação, treinados, uniformizados, armados e munidos de equipamentos e materiais indispensáveis à execução dos serviços, definidos e discriminados na Cláusula 6 abaixo, obedecida a legislação vigente e as tratativas entre as partes.");

  paragraph("§3º A atividade desempenhada pela CONTRATADA constitui obrigação de meio, consistente na adoção de procedimentos técnicos de segurança e prevenção de riscos, não representando garantia de resultado quanto à integridade da carga transportada.");

  // =====================================================
  // CLÁUSULA 2 – DO QUADRO RESUMO/ ANEXO I
  // =====================================================
  clauseTitle("CLÁUSULA 2 – DO QUADRO RESUMO/ ANEXO I");

  body("As partes convencionam que as solicitações (e-mail, WhatsApp ou sistema), que integra o presente instrumento para todos os fins de direito, estabelecerá de forma detalhada os aspectos operacionais, técnicos, logísticos e financeiros dos serviços a serem prestados pela CONTRATADA à CONTRATANTE, incluindo, origem e destino da operação, itinerário, horários estimados, características da carga, número de vigilantes, viaturas empregadas, tempo de duração da missão, valor da remuneração por operação ou por período, quilometragem estimada (se aplicável), e todos os demais elementos necessários à completa especificação dos serviços.");

  doc.moveDown(0.3);

  paragraph("§1º As solicitações de serviços de escolta poderão ser realizadas por qualquer meio escrito idôneo, incluindo, mas não se limitando, a comunicações via aplicativo de mensagens (WhatsApp), correio eletrônico (e-mail) ou, havendo, por meio de sistema/plataforma digital previamente disponibilizada para tal finalidade.");

  // =====================================================
  // CLÁUSULA 3 – DAS ALTERAÇÕES DOS SERVIÇOS
  // =====================================================
  clauseTitle("CLÁUSULA 3 – DAS ALTERAÇÕES DOS SERVIÇOS");

  body("Eventuais alterações nas condições originalmente pactuadas para a execução dos serviços deverão ser comunicadas previamente entre as partes, por escrito ou por meio idôneo de comunicação, tais como e-mail ou aplicativos de mensagens eletrônicas, de modo a permitir a adequação das condições operacionais, logísticas e financeiras da operação de escolta.");

  doc.moveDown(0.3);

  paragraph("§1º Caso tais alterações impliquem modificação de rota, destino, horário, características da carga, tempo de operação, número de veículos envolvidos ou qualquer outro elemento capaz de impactar a execução do serviço, as partes deverão ajustar previamente os eventuais acréscimos operacionais e financeiros decorrentes da modificação.");

  paragraph("§2º Na hipótese de alterações promovidas pela CONTRATANTE durante o curso da operação, sem a prévia concordância da CONTRATADA ou sem a devida readequação das condições operacionais e financeiras, faculta-se à CONTRATADA recusar a continuidade da operação, sem que tal circunstância configure inadimplemento contratual, permanecendo, contudo, preservado o direito da CONTRATADA à percepção integral dos valores previamente pactuados pela missão contratada.");

  // =====================================================
  // CLÁUSULA 4 – DA INDIVIDUALIZAÇÃO DOS SERVIÇOS
  // =====================================================
  clauseTitle("CLÁUSULA 4 – DA INDIVIDUALIZAÇÃO DOS SERVIÇOS");

  body("Os serviços a serem prestados pela CONTRATADA à CONTRATANTE estão descritos e individualizados no Quadro Resumo/Anexo I, que faz parte integrante deste instrumento.");

  // =====================================================
  // CLÁUSULA 5 – DOS VIGILANTES, DO ARMAMENTO E DOS EQUIPAMENTOS
  // =====================================================
  clauseTitle("CLÁUSULA 5 – DOS VIGILANTES, DO ARMAMENTO E DOS EQUIPAMENTOS INDISPENSÁVEIS À EXECUÇÃO DOS SERVIÇOS");

  body("Os vigilantes, o armamento e os equipamentos indispensáveis à execução dos serviços de Escolta Armada serão fornecidos pela CONTRATADA, sendo todos de sua responsabilidade e patrimônio.");

  doc.moveDown(0.3);

  paragraph("§1º A CONTRATADA disponibilizará 02 (Dois) Vigilantes de Escolta Armada por operação.");

  paragraph("§2º A CONTRATADA disponibilizará para cada operação o abaixo descrito, salvo se ajustado em quantidade menor para a operação:");

  doc.moveDown(0.2);

  bulletItem("01 (um) Revolver Calibre 38 de 5 (cinco) ou de 6 (seis) tiros;");
  bulletItem("01 (uma) Espingarda Calibre 12 Pistol Grip, tipo Pump ou similar;");
  bulletItem("12 (doze) cartuchos de munição calibre 38, sendo 6 (seis) cartuchos empregados no municiamento da arma e 6 (seis) no carregador adicional;");
  bulletItem("02 (dois) Coletes a prova de bala nível II-A;");
  bulletItem("14 (quatorze) Cartuchos de munição calibre 12, sendo 07 (sete) empregados no municiamento da arma e 07 (sete) armazenados em estojo para municiamento adicional;");
  bulletItem("01 (um) Rádio transceptor Nextel para comunicação entre a equipe, a base e se for o caso entre a contratante;");
  bulletItem("01 (um) veículo (viatura) de passageiros com capacidade para 5 (cinco) ocupantes, motor 1.0 ou superior, com 4 (quatro) portas, preferencialmente com menos de 2 (dois) anos de uso e/ou fabricação, devidamente identificada com o brasão da empresa e demais elementos de identificação de escolta armada e contatos da empresa, equipado com sistema de rastreamento de veículo tipo satélite e com 2 (dois) botões de pânico à ser acionado em casos de emergências e/ou ocorrências durante o transcorrer da missão de escolta;");

  doc.moveDown(0.3);

  paragraph("A contratada fornecerá a seus funcionários envolvidos na prestação dos serviços conjuntos completos de uniforme, sendo capote, calça terbrim cor preta, camisa terbrim cor preta com brasão de identificação, boina feltro preta, coturnos de cano de lona preta, cordão fiel, coldre de arma com cinto modelo robocop, cinto de lona para calças e capa de colete.");

  // =====================================================
  // CLÁUSULA 6 – DO PRAZO DE VIGÊNCIA
  // =====================================================
  clauseTitle("CLÁUSULA 6 – DO PRAZO DE VIGÊNCIA");

  body("O prazo de vigência deste contrato é por tempo indeterminado, sendo que, qualquer das partes poderá rescindi-lo, a qualquer momento, desde que, notifique a outra, com prévia antecedência de 30 (trinta) dias.");

  // =====================================================
  // CLÁUSULA 7 – DO PREÇO
  // =====================================================
  clauseTitle("CLÁUSULA 7 – DO PREÇO");

  body("Os valores inerentes às operações de Escolta Armada serão cobrados conforme o destino da missão, o tempo do deslocamento, os pernoites e os serviços de preservação, podendo estas ser Urbanas ou Rodoviárias dentro da Região da Grande São Paulo ou Operações Estaduais ou Interestaduais; de forma tal que a cada evento de escolta será tratado individualmente e seus custos previamente acordados, sendo estes, descritos no Anexo I ou na solicitação por escrito, nos termos da Cláusula 2.");

  doc.moveDown(0.3);

  paragraph("§1º O valor dos serviços contratados será pago nas datas, condições e periodicidade constantes da Cláusula 9, abaixo.");

  paragraph("§2º A CONTRATANTE será considerada inadimplente, caso deixe de pagar, na data de vencimento normal da obrigação, o valor dos serviços prestados, constituindo tal fato motivo justo para a rescisão contratual pela CONTRATADA, cabendo ainda a esta o direito de cobrar seu crédito, com os acréscimos constantes do item seguinte.");

  paragraph("§3º No preço do serviço ajustado não estão computados qualquer expectativa inflacionária, razão pela qual sobre os pagamentos vincendos não se aplicarão qualquer índice deflacionário e/ou congelamento e/ou restrições de atualização monetária, tais como, exemplificativamente, tablitas, deflatores, planos econômicos de governo etc.");

  paragraph("§4º Nos casos em que a remuneração da operação de escolta seja estipulada com base no tempo de disponibilização da equipe, eventual atraso decorrente de condições alheias à atuação da CONTRATADA, tais como trânsito intenso, acidentes, bloqueios de via, condições climáticas ou quaisquer outros eventos que impactem o deslocamento, não ensejará qualquer abatimento ou desconto na fatura.");

  // =====================================================
  // CLÁUSULA 8 – DO FATURAMENTO DOS SERVIÇOS E FORMA DE PAGAMENTO
  // =====================================================
  clauseTitle("CLÁUSULA 8 – DO FATURAMENTO DOS SERVIÇOS E FORMA DE PAGAMENTO");

  body("O pagamento será efetuado pela CONTRATANTE à CONTRATADA posterior a execução do serviço prestado, conforme acordado entre as partes.");

  doc.moveDown(0.3);

  paragraph("§1º Os serviços que ultrapassarem a carga horária contratada, ou seja, o tempo predeterminado por missão será cobrado horas adicionais, com o valor acordado entre as partes, da mesma forma os serviços que ultrapassarem a quilometragem contratada, ou seja, a distância predeterminada por missão será cobrado quilômetros adicionais, com o valor acordado entre as partes, conforme ANEXO I; ficando avençado que os valores correspondentes à prestação destes serviços serão faturados em periodicidade a ser definida entre as partes ou de acordo com a forma estabelecida para cada cliente através do QUADRO RESUMO/ANEXO I.");

  paragraph("§2º Em caso de atraso no pagamento de qualquer valor devido em razão deste contrato, incidirão multa moratória de 2% (dois por cento) sobre o valor do débito, acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die, bem como correção monetária pelo índice do INPC, ou outro índice oficial que venha a substituí-lo, contados a partir da data do vencimento até o efetivo pagamento.");

  paragraph("§3º Na hipótese de atraso no pagamento de qualquer fatura ou obrigação financeira decorrente deste contrato, faculta-se à CONTRATADA suspender ou recusar a prestação de novos serviços solicitados pela CONTRATANTE, até a regularização integral do débito.");

  paragraph("§4º A CONTRATADA não será responsável por ocorrências decorrentes de atos do motorista, transportador ou prepostos da CONTRATANTE, especialmente nos casos de: desvio de rota paradas não autorizadas quebra de protocolo de segurança comunicação com terceiros estranhos à operação;");

  // =====================================================
  // CLÁUSULA 9 – DA ALTERAÇÃO DE PREÇOS
  // =====================================================
  clauseTitle("CLÁUSULA 9 – DA ALTERAÇÃO DE PREÇOS");

  body("Os preços estabelecidos no presente contrato serão atualizados por eventuais aumentos advindos de custos setoriais, equipamentos, materiais e, especialmente, aqueles relacionados com os reajustes dos empregados da CONTRATADA, provenientes de Acordo ou Dissídio Coletivo da Categoria, bem como novos encargos, taxas ou tributos criados pelo Poder Público Federal, Estadual ou Municipal, que impactem a planilha de composição de preços da CONTRATADA, ensejarão uma atualização automática nos valores dos serviços prestados, mediante comunicação prévia e por escrito à CONTRATANTE, independentemente de formalização de aditivo contratual.");

  doc.moveDown(0.3);

  paragraph("§1º Fica previamente acordado entre as partes que, caso ocorra uma elevação desproporcional dos índices de custeio deste contrato, em função de reajustes dos custos diretos e indiretos, haverá uma negociação entre as partes, visando a readequação dos preços contratuais, a fim de que se recomponha o equilíbrio econômico-financeiro do contrato.");

  // =====================================================
  // CLÁUSULA 10 – DA RESCISÃO CONTRATUAL
  // =====================================================
  clauseTitle("CLÁUSULA 10 – DA RESCISÃO CONTRATUAL");

  body("O presente contrato poderá ser rescindido, sem a incidência de multa, por qualquer das partes, mediante prévio aviso, por escrito, com antecedência mínima de 30 (trinta) dias, contados da data em que a outra parte receber a aludida comunicação, devidamente protocolizada.");

  doc.moveDown(0.3);

  paragraph("§1º O inadimplemento de qualquer obrigação prevista neste contrato por qualquer das partes poderá ensejar a rescisão imediata do presente instrumento, independentemente de aviso prévio ou interpelação judicial ou extrajudicial. A rescisão, entretanto, não exime as partes do cumprimento das obrigações já vencidas, permanecendo exigíveis todos os valores eventualmente em aberto, acrescidos dos encargos previstos neste contrato, até a sua integral quitação.");

  // =====================================================
  // CLÁUSULA 11 – DA RESPONSABILIDADE DAS PARTES
  // =====================================================
  clauseTitle("CLÁUSULA 11 – DA RESPONSABILIDADE DAS PARTES");

  body("A CONTRATADA é responsável, direta e exclusiva, pela execução integral dos serviços objeto do presente contrato, bem como por eventuais danos, que por si, seus prepostos, empregados, por dolo ou culpa, causarem à CONTRATANTE, desde que devidamente comprovados e comunicados por escrito, pela CONTRATANTE à CONTRATADA, até o segundo dia útil posterior à ocorrência. A eventual responsabilidade da CONTRATADA, quando comprovada, ficará limitada ao valor da remuneração recebida pela operação em que ocorreu o evento danoso, não se estendendo a lucros cessantes, danos indiretos ou expectativas de resultado.");

  doc.moveDown(0.3);

  paragraph("§1º A CONTRATADA compromete-se a utilizar, na prestação dos serviços, profissionais previamente selecionados, sem antecedentes criminais e político-sociais, bem como profissionais que melhor se adaptem às características exigidas pela CONTRATANTE.");

  paragraph("§2º Os serviços de escolta armada serão prestados por vigilantes treinados, uniformizados, equipados e armados, sempre de comum acordo entre as partes e em conformidade com a Lei nº 7.102, de 20/06/83 e a Lei nº 9.017, de 30/03/95.");

  paragraph("§3º A CONTRATADA fica assegurada no direito de promover substituições, quando necessário, de vigilantes e outros elementos destacados para os serviços aqui descritos e contratado sendo dever da CONTRATADA, promover a substituição imediatamente após comunicação por escrito da CONTRATANTE, qualquer de seus empregados ou prepostos cuja permanência nos locais de prestação de serviço for julgada inconveniente.");

  paragraph("§4º A CONTRATADA não será responsável por eventos decorrentes de deficiência operacional, se esta for proveniente de alterações de ordens ou rotinas dadas unilateralmente pela CONTRATANTE aos vigilantes e prepostos da CONTRATADA.");

  paragraph("§5º Fica entendido entre as partes contratantes que, ao vigilante, não se deve dar incumbência fora de suas atividades específicas.");

  paragraph("§6º A CONTRATADA manterá um serviço de inspeção de seus vigilantes e prepostos, verificando periodicamente, o andamento dos serviços e procedimentos de segurança, sem que isto implique em quaisquer ônus ou acréscimo no preço pago pela CONTRATANTE.");

  // =====================================================
  // CLÁUSULA 12 – DOS RESSARCIMENTOS E REEMBOLSOS
  // =====================================================
  clauseTitle("CLÁUSULA 12 – DOS RESSARCIMENTOS E REEMBOLSOS");

  body("Correrão por conta exclusiva da CONTRATANTE, todas as despesas referentes a pedágios em estradas estaduais e federais, bem como estadias e despesas em viagens, quando as mesmas forem decorrentes de despesas extraordinárias para os serviços previamente acordados, desde que as mesmas sejam devidamente autorizadas pela CONTRATANTE, devendo, referidas despesas, ser ressarcidas ou reembolsadas, mediante a apresentação, por parte da CONTRATADA, dos respectivos comprovantes e/ou notas fiscais referentes aos desembolsos.");

  // =====================================================
  // CLÁUSULA 13 – DAS OMISSÕES DO CONTRATO
  // =====================================================
  clauseTitle("CLÁUSULA 13 – DAS OMISSÕES DO CONTRATO");

  body("Quaisquer fatos ou casos omissos no presente contrato não ensejarão a sua rescisão.");

  doc.moveDown(0.3);

  paragraph("§1º O presente contrato obriga as partes, por si, seus herdeiros e sucessores, a qualquer título.");

  paragraph("§2º Qualquer alteração ou modificação às cláusulas e condições deste contrato somente será válida se feita por documento escrito, assinado pelas partes e testemunhas, que se constituirá em aditivo ao presente.");

  // =====================================================
  // CLÁUSULA 14 – DA EXCLUSÃO DO VÍNCULO EMPREGATÍCIO
  // =====================================================
  clauseTitle("CLÁUSULA 14 – DA EXCLUSÃO DO VÍNCULO EMPREGATÍCIO");

  body("O presente contrato, em razão do seu objetivo e natureza, não gera para a CONTRATANTE, em relação aos empregados e prepostos da CONTRATADA, qualquer vínculo de natureza trabalhista e/ou previdenciária, respondendo exclusivamente a CONTRATADA por toda e qualquer ação trabalhista e/ou indenizatória por eles propostas, bem como pelo resultado delas.");

  // =====================================================
  // CLÁUSULA 15 – DAS DISPOSIÇÕES GERAIS
  // =====================================================
  clauseTitle("CLÁUSULA 15 – DAS DISPOSIÇÕES GERAIS");

  body("A CONTRATADA somente será responsável pela prestação dos serviços objeto deste contrato, não podendo garantir a inocorrência de fatos delituosos contra o patrimônio da CONTRATANTE ou de terceiros, nem responder pelo desaparecimento, furto, roubo, dano ou destruição de quaisquer bens, cargas ou objetos de propriedade da CONTRATANTE ou de terceiros ou por qualquer outro dano ou prejuízo que venha a ser causado à CONTRATANTE ou a terceiros que não tenha sido causado diretamente pelos funcionários e/ou preposto da CONTRATADA.");

  doc.moveDown(0.3);

  paragraph("§1º Fica convencionado que a CONTRATADA, em relação aos seus funcionários alocados na CONTRATANTE, se responsabiliza por quaisquer ônus decorrentes de fiscalizações realizadas pelo Ministério do Trabalho e do Emprego, através das Delegacias Regionais do Trabalho, tais como notificações para apresentação de documentos, registros de empregados, esclarecimentos, e outros que forem pertinentes à situação, além da apresentação de defesas e recursos administrativos decorrentes de autuações fiscais, com o necessário pagamento das multas administrativas impostas.");

  paragraph("§2º É vedado a qualquer das partes utilizar o presente objeto contratual em garantias para transações bancárias e/ou financeiras de qualquer espécie, efetuar operação de desconto, negociar, repassar ou de qualquer forma ceder os créditos decorrentes da execução desse a Bancos, empresas de \"factoring\" ou terceiros, sem prévia autorização por escrito da outra parte.");

  paragraph("§3º Ficam desde já convencionados que o presente contrato não irá configurar nenhum outro direito para as partes, além da prestação dos serviços supramencionados, devendo este contrato ser interpretado sob o ponto de vista restritivo, de modo a não permitir qualquer interpretação diferente da objetivada pelas partes.");

  paragraph("§4º Eventual tolerância de uma parte a infrações ou descumprimento das condições estipuladas no presente contrato, cometidas pela outra parte, será tida como ato de mera liberalidade, não se constituindo em perdão, precedente, novação ou renúncia a direitos que a legislação ou o contrato assegurem às partes.");

  paragraph("§5º A assinatura do presente contrato representa a aceitação de todas as disposições nele contidas, prevalecendo sobre todas as tratativas e entendimentos mantidos anteriormente entre as partes.");

  paragraph("§6º Se qualquer cláusula ou dispositivo deste contrato for considerado nulo ou sem efeito, no todo ou em parte, as demais deverão permanecer válidas e serão interpretadas de forma a preservar sua validade.");

  paragraph("§7º O presente contrato expressa todos os acordos e condições estipulados pelas partes com relação ao objeto contrato, substituindo todos os eventuais contratos e seus anexos anteriormente firmados entre elas, os quais neste ato são tidos como rescindidos ofertando-se as partes mútua quitação para nada mais reclamar.");

  paragraph("§8º A CONTRATANTE declara que a carga transportada encontra-se devidamente coberta por apólice de seguro própria, responsabilizando-se integralmente pelos riscos inerentes ao transporte, inclusive roubo, furto, extravio ou avarias. A CONTRATADA presta exclusivamente serviços de escolta armada e gerenciamento de risco, não assumindo, em hipótese alguma, a condição de seguradora da carga transportada, nem garantindo a inviolabilidade ou recuperação da mercadoria em caso de sinistro.");

  // =====================================================
  // CLÁUSULA 16 – DO SIGILO
  // =====================================================
  clauseTitle("CLÁUSULA 16 – DO SIGILO");

  body("Toda e qualquer informação relativa ao objeto do presente será sempre considerada sigilosa e confidencial, ficando expressamente vedado à CONTRATADA, bem como aos seus empregados ou prepostos, delas dar conhecimento a terceiros não autorizados, sob pena de responsabilização civil e criminal.");

  // =====================================================
  // CLÁUSULA 17 – DO FORO
  // =====================================================
  clauseTitle("CLÁUSULA 17 – DO FORO");

  body("As partes elegem o Foro Central de São Paulo – SP para dirimir eventuais dúvidas ou divergências que as partes venham a ter com relação ao presente contrato. E, por estarem assim ajustadas, declaram as partes aceitar as disposições estabelecidas nas cláusulas do presente contrato, que, após lido e achado conforme, vai assinado pelos representantes legais das partes e pelas testemunhas abaixo.");

  // =====================================================
  // DATA E ASSINATURAS
  // =====================================================
  doc.moveDown(1.5);

  checkPage(280);

  doc.font(FONT_NORMAL).fontSize(SIZE_BODY).text(`São Paulo, ${dateStr}.`, { align: "center" });

  doc.moveDown(2);

  const colW = (W - 40) / 2;
  const leftCol = LM;
  const rightCol = LM + colW + 40;
  let sigY = doc.y;

  doc.save();
  doc.rect(leftCol, sigY, colW, 3).fill("#111111");
  doc.rect(rightCol, sigY, colW, 3).fill("#111111");
  doc.restore();

  sigY += 20;

  doc.font(FONT_BOLD).fontSize(10).fillColor("#000000");
  doc.text("CONTRATADA", leftCol, sigY, { width: colW, align: "center" });
  doc.text("CONTRATANTE", rightCol, sigY, { width: colW, align: "center" });

  sigY += 16;
  doc.font(FONT_NORMAL).fontSize(SIZE_SMALL);
  doc.text(COMPANY.name, leftCol, sigY, { width: colW, align: "center" });
  doc.text(data.clientName.toUpperCase(), rightCol, sigY, { width: colW, align: "center" });

  sigY += 14;
  doc.font(FONT_NORMAL).fontSize(8).fillColor("#666666");
  doc.text(`CNPJ: ${COMPANY.cnpj}`, leftCol, sigY, { width: colW, align: "center" });
  doc.text(`CNPJ: ${data.clientCnpj}`, rightCol, sigY, { width: colW, align: "center" });

  doc.fillColor("#000000");

  sigY += 30;
  doc.y = sigY;

  doc.save();
  doc.rect(leftCol, sigY, W, 22).fill("#111111");
  doc.restore();
  doc.font(FONT_BOLD).fontSize(9).fillColor("#FFFFFF");
  doc.text("TESTEMUNHAS", leftCol + 8, sigY + 5, { width: W - 16 });
  doc.fillColor("#000000");

  sigY += 32;

  doc.font(FONT_BOLD).fontSize(SIZE_SMALL);
  doc.text("Testemunha 1:", leftCol, sigY);
  sigY += 20;
  doc.font(FONT_NORMAL).fontSize(SIZE_SMALL);
  doc.text("RG: _________________________", leftCol, sigY, { continued: false });
  doc.text("CPF: _________________________", leftCol + colW + 40, sigY);
  sigY += 24;

  doc.font(FONT_BOLD).fontSize(SIZE_SMALL);
  doc.text("Testemunha 2:", leftCol, sigY);
  sigY += 20;
  doc.font(FONT_NORMAL).fontSize(SIZE_SMALL);
  doc.text("RG: _________________________", leftCol, sigY, { continued: false });
  doc.text("CPF: _________________________", leftCol + colW + 40, sigY);

  doc.y = sigY + 20;

  // =====================================================
  // RODAPÉ EM TODAS AS PÁGINAS
  // =====================================================
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.font(FONT_NORMAL).fontSize(7).fillColor("#999999");
    doc.text(
      `${COMPANY.name} — CNPJ ${COMPANY.cnpj} — Página ${i + 1} de ${totalPages}`,
      LM,
      doc.page.height - 40,
      { width: W, align: "center", lineBreak: false }
    );
    doc.fillColor("#000000");
  }

  doc.end();
}
