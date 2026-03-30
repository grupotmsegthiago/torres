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
  shortName: "TORRES VIGILÂNCIA PATRIMONIAL",
  cnpj: "36.982.392/0001-89",
  city: "São Paulo",
  state: "SP",
  footer: "www.torresseguranca.com.br • @grupotorres.seguranca • (11) 96369-6699 • escolta@torresseguranca.com.br",
};

export function generateContractPDF(res: Response, data: ContractData) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 80, bottom: 70, left: 60, right: 60 },
    bufferPages: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  const safeName = data.clientName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  res.setHeader("Content-Disposition", `attachment; filename="Contrato_Escolta_${safeName}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LM = doc.page.margins.left;
  const INDENT = 20;

  const dateStr = data.contractDate || new Date().toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const dateRaw = data.contractDate || new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const dateParts = dateRaw.match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d+)/);
  let vigenciaInicio = "";
  let vigenciaFim = "";
  if (dateParts) {
    vigenciaInicio = `${dateParts[1]}/${dateParts[2] === "janeiro" ? "01" : dateParts[2] === "fevereiro" ? "02" : dateParts[2] === "março" ? "03" : dateParts[2] === "abril" ? "04" : dateParts[2] === "maio" ? "05" : dateParts[2] === "junho" ? "06" : dateParts[2] === "julho" ? "07" : dateParts[2] === "agosto" ? "08" : dateParts[2] === "setembro" ? "09" : dateParts[2] === "outubro" ? "10" : dateParts[2] === "novembro" ? "11" : "12"}/${dateParts[3]}`;
    const y = parseInt(dateParts[3]) + 1;
    vigenciaFim = vigenciaInicio.replace(`/${dateParts[3]}`, `/${y}`);
  } else {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    vigenciaInicio = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    vigenciaFim = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear() + 1}`;
  }

  const F_NORMAL = "Helvetica";
  const F_BOLD = "Helvetica-Bold";
  const F_ITALIC = "Helvetica-Oblique";
  const SZ = 10;
  const SZ_SM = 9;
  const SZ_TITLE = 14;
  const SZ_SUBTITLE = 11;
  const LG = 4;

  function drawHeader() {
    const y = 25;
    doc.font(F_BOLD).fontSize(10).fillColor("#000000");
    doc.text(COMPANY.shortName, LM, y, { width: W, align: "center" });
    doc.font(F_NORMAL).fontSize(8).fillColor("#555555");
    doc.text(`CNPJ: ${COMPANY.cnpj}`, LM, y + 14, { width: W, align: "center" });
    doc.fillColor("#000000");
  }

  function drawFooter(pageNum: number, totalPages: number) {
    const y = doc.page.height - 45;
    doc.font(F_NORMAL).fontSize(7).fillColor("#555555");
    doc.text(COMPANY.footer, LM, y, { width: W, align: "center", lineBreak: false });
    doc.fillColor("#000000");
  }

  function checkPage(needed = 60) {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 10) {
      doc.addPage();
      drawHeader();
      doc.y = 65;
    }
  }

  function clauseTitle(text: string) {
    checkPage(35);
    doc.moveDown(0.6);
    doc.font(F_BOLD).fontSize(SZ).text(` ${text}`, LM, doc.y, { lineGap: LG });
    doc.moveDown(0.4);
  }

  function body(text: string) {
    checkPage(25);
    doc.font(F_NORMAL).fontSize(SZ).text(text, LM, doc.y, {
      align: "justify", lineGap: LG, width: W,
    });
    doc.moveDown(0.3);
  }

  function sub(num: string, text: string) {
    checkPage(25);
    doc.font(F_NORMAL).fontSize(SZ_SM).text(`${num} - ${text}`, LM + INDENT, doc.y, {
      align: "justify", lineGap: 3, width: W - INDENT,
    });
    doc.moveDown(0.2);
  }

  // =====================================================
  // PAGE 1 - HEADER
  // =====================================================
  drawHeader();
  doc.y = 65;

  doc.moveDown(1.5);
  doc.font(F_BOLD).fontSize(SZ_TITLE).text("MINUTA DE CONTRATO", { align: "center" });
  doc.font(F_BOLD).fontSize(SZ_SUBTITLE).text("PRESTAÇÃO DE SERVIÇOS DE ESCOLTA ARMADA", { align: "center" });
  doc.moveDown(1.5);

  // =====================================================
  // QUALIFICAÇÃO
  // =====================================================
  doc.font(F_BOLD).fontSize(SZ).text("CONTRATANTE: ", { continued: true });
  doc.font(F_NORMAL).text(
    `${data.clientName}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${data.clientCnpj}, com sede fiscal na ${data.clientAddress}, ${data.clientCity}, ${data.clientState}, ${data.clientZip}, representado neste ato por ${data.clientContact}.`,
    { align: "justify", lineGap: LG }
  );
  doc.moveDown(0.6);

  doc.font(F_BOLD).fontSize(SZ).text("CONTRATADA: ", { continued: true });
  doc.font(F_NORMAL).text(
    `${COMPANY.name}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${COMPANY.cnpj}, com sede fiscal em ${COMPANY.city}/${COMPANY.state}.`,
    { align: "justify", lineGap: LG }
  );
  doc.moveDown(0.5);

  body("As partes, acima nomeadas e qualificadas, têm entre si como justo e acordado o presente Contrato de Prestação de Serviços de Escolta Armada, que se regerão pelos termos, cláusulas, obrigações e condições adiante articuladas:");

  doc.moveDown(0.3);

  // =====================================================
  // CLÁUSULA 1
  // =====================================================
  clauseTitle("Cláusula 1 – Do Objeto");

  body("A CONTRATADA prestará à CONTRATANTE os serviços especializados de Escolta Armada, através do acompanhamento ostensivo de caminhões e veículos de carga, denominados auto cargas, que transportam mercadorias consideradas de alto risco, quanto a roubos e furtos, conforme discriminação contida no Quadro Resumo, que fica fazendo parte integrante deste instrumento.");

  sub("1.1", "A segurança será realizada através do acompanhamento ostensivo de caminhões e veículos de carga, em vias públicas em geral, contando com o apoio de Viaturas de Escolta, devidamente identificadas com o brasão da CONTRATADA, equipadas com sistema de rádio comunicação e dotadas de 04 (quatro) portas, podendo ser inclusive rastreadas via satélite.");

  sub("1.2", "Os serviços de Escolta Armada serão prestados por vigilantes identificados através de crachá de identificação, treinados, uniformizados, armados e munidos de equipamentos e materiais indispensáveis à execução dos serviços, definidos e discriminados na Cláusula 6 abaixo, obedecida a legislação vigente e as tratativas entre as partes.");

  // =====================================================
  // CLÁUSULA 2
  // =====================================================
  clauseTitle("Cláusula 2 – Do Quadro Resumo");

  body("As partes acordam que o Quadro Resumo, parte integrante do presente instrumento, definirá todos os aspectos operacionais, técnicos e financeiros dos serviços a serem prestados pela CONTRATADA à CONTRATANTE.");

  // =====================================================
  // CLÁUSULA 3
  // =====================================================
  clauseTitle("Cláusula 3 – Dos Documentos Integrantes");

  body("Para melhor caracterização do objeto deste CONTRATO, bem como para definir procedimentos decorrentes das obrigações ora contraídos, integram este instrumento, como se nele estivessem transcritos, os dispositivos pertinentes às normas de segurança; as atas; as correspondências entre as partes, às trocadas e as futuras, e, mais, os documentos técnicos dos serviços solicitados.");

  // =====================================================
  // CLÁUSULA 4
  // =====================================================
  clauseTitle("Cláusula 4 – Das Alterações dos Serviços");

  body("Os serviços prestados poderão sofrer alterações, desde que, antecipadamente, sejam submetidos à análise da CONTRATANTE, através de correspondência própria enviada pela CONTRATADA, levando-se em conta que tais alterações ocorram para melhor adequá-los em razão de operacionalidade e/ou prioridades.");

  // =====================================================
  // CLÁUSULA 5
  // =====================================================
  clauseTitle("Cláusula 5 – Da Individualização dos Serviços");

  body("Os serviços a serem prestados pela CONTRATADA à CONTRATANTE estão descritos e individualizados no Quadro Resumo anexo, que faz parte integrante deste instrumento.");

  // =====================================================
  // CLÁUSULA 6
  // =====================================================
  clauseTitle("Cláusula 6 – Dos Vigilantes, Do Armamento e Dos Equipamentos Indispensáveis à Execução dos Serviços");

  body("Os vigilantes, o armamento e os equipamentos indispensáveis à execução dos serviços de Escolta Armada serão fornecidos pela contratada, sendo todos de sua responsabilidade e patrimônio.");

  sub("6.1", "A contratada disponibilizará 02 (Dois) Vigilantes de Escolta Armada por operação.");
  sub("6.2", "A contratada disponibilizará para cada operação:");
  sub("6.2.1", "01 (um) Revólver Calibre 38 de 5 (cinco) ou de 6 (seis) tiros;");
  sub("6.2.2", "01 (uma) Espingarda Calibre 12 Pistol Grip, tipo Pump ou similar;");
  sub("6.2.3", "12 (doze) cartuchos de munição calibre 38, sendo 6 (seis) cartuchos empregados no municiamento da arma e 6 (seis) no carregador adicional;");
  sub("6.2.4", "02 (dois) Coletes à prova de bala nível II-A;");
  sub("6.2.5", "14 (quatorze) Cartuchos de munição calibre 12, sendo 07 (sete) empregados no municiamento da arma e 07 (sete) armazenados em estojo para municiamento adicional;");
  sub("6.2.6", "01 (um) Rádio transceptor para comunicação entre a equipe, a base e se for o caso entre a contratante;");
  sub("6.2.7", "01 (um) veículo (viatura) de passageiros com capacidade para 5 (cinco) ocupantes, motor 1.0 ou superior, com 4 (quatro) portas, preferencialmente com menos de 2 (dois) anos de uso e/ou fabricação, devidamente identificada com o brasão da empresa e demais elementos de identificação de escolta armada e contatos da empresa, equipado com sistema de rastreamento de veículo tipo satelital e com 2 (dois) botões de pânico a ser acionado em casos de emergências e/ou ocorrências durante a operação;");
  sub("6.3", "A contratada fornecerá a seus funcionários envolvidos na prestação dos serviços conjuntos completos de uniforme, sendo capote, calça terbrim cor preta, camisa terbrim cor preta com brasão de identificação, boina feltro preta, coturnos de cano de lona preta, cordão fiel, coldre de arma com cinto modelo robocop, cinto de lona para calças e capa de colete.");

  // =====================================================
  // CLÁUSULA 7
  // =====================================================
  clauseTitle("Cláusula 7 – Do Prazo de Vigência");

  body(`O prazo de vigência deste contrato é de ${vigenciaInicio} a ${vigenciaFim}, sendo que, qualquer das partes poderá rescindi-lo, a qualquer momento, desde que, notifique a outra, com prévia antecedência de 30 (trinta) dias.`);

  // =====================================================
  // CLÁUSULA 8
  // =====================================================
  clauseTitle("Cláusula 8 – Do Preço");

  body("Os valores inerentes às operações de Escolta Armada serão cobrados conforme o destino da missão, o tempo do deslocamento, os pernoites e os serviços de preservação, podendo estas ser Urbanas ou Rodoviárias dentro da Região da Grande São Paulo ou Operações Estaduais ou Interestaduais, desde que estas se iniciem no Estado de São Paulo; de forma tal que a cada evento de escolta será tratado individualmente e seus custos previamente acordados, sendo estes, descritos no Anexo I.");

  sub("8.1", "O valor dos serviços contratados será pago nas datas, condições e periodicidade constantes da Cláusula 9, abaixo.");
  sub("8.2", "A CONTRATANTE será considerada inadimplente, caso deixe de pagar, na data de vencimento normal da obrigação, o valor dos serviços prestados, constituindo tal fato motivo justo para a rescisão contratual pela CONTRATADA, cabendo ainda a esta o direito de cobrar seu crédito, com os acréscimos constantes do item seguinte.");
  sub("8.3", "No preço do serviço ajustado não estão computados qualquer expectativa inflacionária, razão pela qual sobre os pagamentos vincendos não se aplicarão qualquer índice deflacionário e/ou congelamento e/ou restrições de atualização monetária, tais como, exemplificativamente, tablitas, deflatores, planos econômicos de governo etc.");

  // =====================================================
  // CLÁUSULA 9
  // =====================================================
  clauseTitle("Cláusula 9 – Do Faturamento dos Serviços e Forma de Pagamento");

  body("O pagamento será efetuado pela CONTRATANTE à CONTRATADA posterior a execução do serviço prestado, conforme acordado entre as partes.");

  sub("9.1", "Os serviços que ultrapassarem a carga horária contratada, ou seja, o tempo predeterminado por missão será cobrado horas adicionais, com o valor acordado entre as partes, da mesma forma os serviços que ultrapassarem a quilometragem contratada, ou seja, a distância predeterminada por missão será cobrado quilômetros adicionais, com o valor acordado entre as partes, conforme ANEXO I; ficando avençado que os valores correspondentes à prestação destes serviços serão totalizados e faturados conforme caput da Cláusula 9 deste contrato.");

  // =====================================================
  // CLÁUSULA 10
  // =====================================================
  clauseTitle("Cláusula 10 – Da Alteração de Preços");

  sub("10.1", "Os preços estabelecidos no presente contrato serão atualizados por eventuais aumentos advindos de custos setoriais, equipamentos, materiais e, especialmente, aqueles relacionados com os reajustes dos empregados da CONTRATADA, provenientes de Acordo ou Dissídio Coletivo da Categoria, bem como novos encargos, taxas ou tributos criados pelo Poder Público Federal, Estadual ou Municipal, que impactem a planilha de composição de preços da CONTRATADA, ensejarão uma atualização dos preços contratuais, mediante prévia comunicação escrita da CONTRATADA à CONTRATANTE e mediante prévio acordo entre as partes.");

  sub("10.2", "Fica previamente acordado entre as partes que, caso ocorra uma elevação desproporcional dos índices de custeio deste contrato, em função de reajustes dos custos diretos e indiretos, haverá uma negociação entre as partes, visando a readequação dos preços contratuais, a fim de que se recomponha o equilíbrio econômico-financeiro do contrato.");

  // =====================================================
  // CLÁUSULA 11
  // =====================================================
  clauseTitle("Cláusula 11 – Da Rescisão Contratual");

  sub("11.1", "O presente contrato poderá ser rescindido, sem a incidência de multa, por qualquer das partes, mediante prévio aviso, por escrito, com antecedência mínima de 30 (trinta) dias, contados da data em que a outra parte receber a aludida comunicação, devidamente protocolizada.");

  // =====================================================
  // CLÁUSULA 12
  // =====================================================
  clauseTitle("Cláusula 12 – Da Responsabilidade das Partes");

  body("A CONTRATADA é responsável, direta e exclusiva, pela execução integral dos serviços objeto do presente contrato, bem como por eventuais danos, que por si, seus prepostos, empregados, por dolo ou culpa, causarem à CONTRATANTE, desde que devidamente comprovados e comunicados por escrito, pela CONTRATANTE à CONTRATADA, até o segundo dia útil posterior à ocorrência.");

  sub("12.1", "A CONTRATADA compromete-se a utilizar, na prestação dos serviços, profissionais previamente selecionados, sem antecedentes criminais e político-sociais, bem como profissionais que melhor se adaptem às características exigidas pela CONTRATANTE.");
  sub("12.2", "Os serviços de escolta armada serão prestados por vigilantes treinados, uniformizados, equipados e armados, sempre de comum acordo entre as partes e em conformidade com a Lei nº 7.102, de 20/06/83 e a Lei nº 9.017, de 30/03/95.");
  sub("12.3", "A CONTRATADA fica assegurada no direito de promover substituições, quando necessário, de vigilantes e outros elementos destacados para os serviços aqui descritos e contratado sendo dever da CONTRATADA, promover a substituição imediatamente após comunicação por escrito da CONTRATANTE, qualquer de seus empregados ou prepostos cuja permanência nos locais de prestação de serviço for julgada inconveniente.");
  sub("12.4", "A CONTRATADA não será responsável por eventos decorrentes de deficiência operacional, se esta for proveniente de alterações de ordens ou rotinas dadas unilateralmente pela CONTRATANTE aos vigilantes e prepostos da CONTRATADA.");
  sub("12.5", "Fica entendido entre as partes contratantes que, ao vigilante, não se deve dar incumbência fora de suas atividades específicas.");
  sub("12.6", "A CONTRATADA manterá um serviço de inspeção de seus vigilantes e prepostos, verificando periodicamente, o andamento dos serviços e procedimentos de segurança, sem que isto implique em quaisquer ônus ou acréscimo no preço pago pela CONTRATANTE.");

  // =====================================================
  // CLÁUSULA 13
  // =====================================================
  clauseTitle("Cláusula 13 – Dos Ressarcimentos e Reembolsos");

  body("Correrão por conta exclusiva da CONTRATANTE, todas as despesas referentes a pedágios em estradas estaduais e federais, bem como estadias e despesas em viagens, quando as mesmas forem decorrentes de despesas extraordinárias para os serviços previamente acordados, desde que as mesmas sejam devidamente autorizadas pela CONTRATANTE, devendo, referidas despesas, ser ressarcidas ou reembolsadas, mediante a apresentação, por parte da CONTRATADA, dos respectivos comprovantes e/ou notas fiscais referentes aos desembolsos.");

  // =====================================================
  // CLÁUSULA 14
  // =====================================================
  clauseTitle("Cláusula 14 – Das Omissões do Contrato");

  body("Quaisquer fatos ou casos omissos no presente contrato não ensejarão a sua rescisão.");

  sub("14.1", "O presente contrato obriga as partes, por si, seus herdeiros e sucessores, a qualquer título.");
  sub("14.2", "Qualquer alteração ou modificação às cláusulas e condições deste contrato somente será válida se feita por documento escrito, assinado pelas partes e testemunhas, que se constituirá em aditivo ao presente.");

  // =====================================================
  // CLÁUSULA 15
  // =====================================================
  clauseTitle("Cláusula 15 – Da Exclusão do Vínculo Empregatício");

  body("O presente contrato, em razão do seu objetivo e natureza, não gera para a CONTRATANTE, em relação aos empregados e prepostos da CONTRATADA, qualquer vínculo de natureza trabalhista e/ou previdenciária, respondendo exclusivamente a CONTRATADA por toda e qualquer ação trabalhista e/ou indenizatória por eles propostas, bem como pelo resultado delas.");

  // =====================================================
  // CLÁUSULA 16
  // =====================================================
  clauseTitle("Cláusula 16 – Das Disposições Gerais");

  sub("16.1", "A CONTRATADA somente será responsável pela prestação dos serviços objeto deste contrato, não podendo garantir a inocorrência de fatos delituosos contra o patrimônio da CONTRATANTE ou de terceiros, nem responder pelo desaparecimento, furto, roubo, dano ou destruição de quaisquer bens, cargas ou objetos de propriedade da CONTRATANTE ou de terceiros ou por qualquer outro dano ou prejuízo que venha a ser causado à CONTRATANTE ou a terceiros que não tenha sido causado diretamente pelos funcionários e/ou preposto da CONTRATADA.");
  sub("16.2", "Fica convencionado que a CONTRATADA, em relação aos seus funcionários alocados na CONTRATANTE, se responsabiliza por quaisquer ônus decorrentes de fiscalizações realizadas pelo Ministério do Trabalho e do Emprego, através das Delegacias Regionais do Trabalho, tais como notificações para apresentação de documentos, registros de empregados, esclarecimentos, e outros que forem pertinentes à situação, além da apresentação de defesas e recursos administrativos decorrentes de autuações fiscais, com o necessário pagamento das multas administrativas impostas.");
  sub("16.3", 'É vedado a qualquer das partes utilizar o presente objeto contratual em garantias para transações bancárias e/ou financeiras de qualquer espécie, efetuar operação de desconto, negociar, repassar ou de qualquer forma ceder os créditos decorrentes da execução desse a Bancos, empresas de "factoring" ou terceiros, sem prévia autorização por escrito da outra parte.');
  sub("16.4", "Ficam desde já convencionados que o presente contrato não irá configurar nenhum outro direito para as partes, além da prestação dos serviços supramencionados, devendo este contrato ser interpretado sob o ponto de vista restritivo, de modo a não permitir qualquer interpretação diferente da objetivada pelas partes.");
  sub("16.5", "Eventual tolerância de uma parte a infrações ou descumprimento das condições estipuladas no presente contrato, cometidas pela outra parte, será tida como ato de mera liberalidade, não se constituindo em perdão, precedente, novação ou renúncia a direitos que a legislação ou o contrato assegurem às partes.");
  sub("16.6", "A assinatura do presente contrato representa a aceitação de todas as disposições nele contidas, prevalecendo sobre todas as tratativas e entendimentos mantidos anteriormente entre as partes.");
  sub("16.7", "Se qualquer cláusula ou dispositivo deste contrato for considerado nulo ou sem efeito, no todo ou em parte, as demais deverão permanecer válidas e serão interpretadas de forma a preservar sua validade.");
  sub("16.8", "O presente contrato expressa todos os acordos e condições estipulados pelas partes com relação ao objeto contrato, substituindo todos os eventuais contratos e seus anexos anteriormente firmados entre elas, os quais neste ato são tidos como rescindidos ofertando-se as partes mútua quitação para nada mais reclamar.");

  // =====================================================
  // CLÁUSULA 17
  // =====================================================
  clauseTitle("Cláusula 17 – Do Sigilo");

  body("Toda e qualquer informação relativa ao objeto do presente será sempre considerada sigilosa e confidencial, ficando expressamente vedado à CONTRATADA, bem como aos seus empregados ou prepostos, delas dar conhecimento a terceiros não autorizados, sob pena de responsabilização civil e criminal.");

  // =====================================================
  // CLÁUSULA 18
  // =====================================================
  clauseTitle("Cláusula 18 – Do Foro");

  body("As partes elegem o Foro Central de São Paulo – SP para dirimir eventuais dúvidas ou divergências que as partes venham a ter com relação ao presente contrato. E, por estarem assim ajustadas, declaram as partes aceitar as disposições estabelecidas nas cláusulas do presente contrato, que, após lido e achado conforme, vai assinado pelos representantes legais das partes e pelas testemunhas abaixo.");

  // =====================================================
  // DATA E ASSINATURAS
  // =====================================================
  doc.moveDown(1.5);

  checkPage(250);

  doc.font(F_NORMAL).fontSize(SZ).text(`São Paulo, ${dateStr}.`, { align: "center" });

  doc.moveDown(2);

  const colW = (W - 50) / 2;
  const leftCol = LM;
  const rightCol = LM + colW + 50;
  let sigY = doc.y;

  doc.save();
  doc.rect(leftCol, sigY, colW, 3).fill("#111111");
  doc.rect(rightCol, sigY, colW, 3).fill("#111111");
  doc.restore();

  sigY += 18;

  doc.font(F_BOLD).fontSize(9).fillColor("#000000");
  doc.text("CONTRATADA", leftCol, sigY, { width: colW, align: "center" });
  doc.text("CONTRATANTE", rightCol, sigY, { width: colW, align: "center" });

  sigY += 14;
  doc.font(F_NORMAL).fontSize(8);
  doc.text(COMPANY.name, leftCol, sigY, { width: colW, align: "center" });
  doc.text(data.clientName.toUpperCase(), rightCol, sigY, { width: colW, align: "center" });

  sigY += 12;
  doc.font(F_NORMAL).fontSize(7.5).fillColor("#666666");
  doc.text(`CNPJ: ${COMPANY.cnpj}`, leftCol, sigY, { width: colW, align: "center" });
  doc.text(`CNPJ: ${data.clientCnpj}`, rightCol, sigY, { width: colW, align: "center" });

  doc.fillColor("#000000");

  sigY += 28;
  doc.y = sigY;

  doc.save();
  doc.rect(leftCol, sigY, W, 20).fill("#111111");
  doc.restore();
  doc.font(F_BOLD).fontSize(9).fillColor("#FFFFFF");
  doc.text(" TESTEMUNHAS", leftCol + 6, sigY + 4, { width: W - 12 });
  doc.fillColor("#000000");

  sigY += 30;

  doc.font(F_BOLD).fontSize(SZ_SM);
  doc.text("Testemunha 1:", leftCol, sigY);
  sigY += 22;
  doc.font(F_NORMAL).fontSize(SZ_SM);
  doc.text("RG:   ______________________", leftCol, sigY);
  doc.text("CPF:     ______________________", rightCol, sigY);
  sigY += 26;

  doc.font(F_BOLD).fontSize(SZ_SM);
  doc.text("Testemunha 2:", leftCol, sigY);
  sigY += 22;
  doc.font(F_NORMAL).fontSize(SZ_SM);
  doc.text("RG:   ______________________", leftCol, sigY);
  doc.text("CPF:     ______________________", rightCol, sigY);

  doc.y = sigY + 20;

  // =====================================================
  // HEADER + FOOTER EM TODAS AS PÁGINAS
  // =====================================================
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    if (i > 0) {
      drawHeader();
    }
    drawFooter(i + 1, totalPages);
  }

  doc.end();
}
