import jsPDF from "jspdf";
import logoPath from "@assets/WhatsApp_Image_2026-03-19_at_18.10.37_1773954659471.jpeg";

interface ContractData {
  contract_number: string | null;
  contratante_razao: string | null;
  contratante_cnpj: string | null;
  contratante_endereco: string | null;
  contratante_representante: string | null;
  vigencia_tipo: string;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  data_assinatura: string | null;
  aviso_previo_dias: number;
  num_vigilantes: number;
  armamento_descricao: string | null;
  equipamentos: string | null;
  multa_mora_pct: number;
  juros_mora_pct: number;
  indice_correcao: string;
  observacoes: string | null;
}

const MARGIN_L = 25;
const MARGIN_R = 25;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const LINE_H = 5.5;
const PARA_GAP = 3;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fmtDate(d: string | null): string {
  if (!d) return "___/___/______";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR");
}

function extenso(d: string | null): string {
  if (!d) return "________________";
  const dt = new Date(d);
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${dt.getDate()} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}`;
}

export async function generateContractPDF(data: ContractData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 20;

  const logo = await loadImg(logoPath);
  const canvas = document.createElement("canvas");
  canvas.width = logo.naturalWidth;
  canvas.height = logo.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(logo, 0, 0);
  const logoB64 = canvas.toDataURL("image/jpeg", 0.95);

  function checkPage(need: number) {
    if (y + need > 275) {
      doc.addPage();
      y = 20;
    }
  }

  function writeTitle(text: string) {
    checkPage(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(text, PAGE_W / 2, y, { align: "center" });
    y += 8;
  }

  function writeClauseTitle(text: string) {
    checkPage(12);
    y += PARA_GAP;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(text, MARGIN_L, y);
    y += LINE_H + 1;
  }

  function writeParagraph(text: string, indent = 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent);
    for (const line of lines) {
      checkPage(LINE_H);
      doc.text(line, MARGIN_L + indent, y);
      y += LINE_H;
    }
    y += PARA_GAP;
  }

  function writeBoldParagraph(text: string, indent = 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent);
    for (const line of lines) {
      checkPage(LINE_H);
      doc.text(line, MARGIN_L + indent, y);
      y += LINE_H;
    }
    y += PARA_GAP;
  }

  const contratante = data.contratante_razao || "_______________";
  const cnpjContratante = data.contratante_cnpj || "___.___.___/____-__";
  const enderecoContratante = data.contratante_endereco || "_______________";
  const representante = data.contratante_representante || "_______________";
  const numVigilantes = data.num_vigilantes || 2;
  const armamento = data.armamento_descricao || "01 Revolver Cal. 38 + 01 Espingarda Cal. 12 Pump";
  const equipamentos = data.equipamentos || "02 Coletes nível II-A, Rádio, Viatura identificada com rastreamento";
  const avisoPrevio = data.aviso_previo_dias || 30;
  const multaMora = data.multa_mora_pct || 2;
  const jurosMora = data.juros_mora_pct || 1;
  const indiceCorrecao = data.indice_correcao || "INPC";

  doc.addImage(logoB64, "JPEG", PAGE_W / 2 - 20, y, 40, 40);
  y += 45;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", PAGE_W / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(11);
  doc.text("DE ESCOLTA ARMADA", PAGE_W / 2, y, { align: "center" });
  y += 5;

  if (data.contract_number) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Contrato nº ${data.contract_number}`, PAGE_W / 2, y, { align: "center" });
    y += 5;
  }

  y += 8;

  writeParagraph(`Pelo presente instrumento particular, de um lado:`);

  writeBoldParagraph(`CONTRATANTE: ${contratante}, inscrita no CNPJ sob nº ${cnpjContratante}, com sede em ${enderecoContratante}, neste ato representada por ${representante}, doravante denominada simplesmente CONTRATANTE;`);

  writeParagraph(`E de outro lado:`);

  writeBoldParagraph(`CONTRATADA: TORRES VIGILÂNCIA PATRIMONIAL LTDA, inscrita no CNPJ sob nº 36.982.392/0001-89, com sede na Rua Exemplo, nº 000, Bairro, Cidade/UF, neste ato representada por seu sócio-administrador THIAGO MOREIRA DOS SANTOS, doravante denominada simplesmente CONTRATADA;`);

  writeParagraph(`Têm entre si justo e contratado o que se segue, mediante as cláusulas e condições abaixo:`);

  writeClauseTitle("CLÁUSULA PRIMEIRA – DO OBJETO");
  writeParagraph(`O presente contrato tem por objeto a prestação de serviços de escolta armada para transporte de cargas e/ou valores da CONTRATANTE, conforme especificações e condições estabelecidas neste instrumento.`);
  writeParagraph(`§1º – A escolta armada será realizada por ${numVigilantes} (${numVigilantes === 1 ? "um" : numVigilantes === 2 ? "dois" : numVigilantes === 3 ? "três" : numVigilantes}) vigilante(s) devidamente habilitado(s) e armado(s), utilizando viatura(s) adequada(s) ao serviço.`);
  writeParagraph(`§2º – O armamento utilizado será: ${armamento}.`);
  writeParagraph(`§3º – Os equipamentos fornecidos incluem: ${equipamentos}.`);

  writeClauseTitle("CLÁUSULA SEGUNDA – DO PRAZO DE VIGÊNCIA");
  if (data.vigencia_tipo === "indeterminado") {
    writeParagraph(`O presente contrato é celebrado por prazo indeterminado, iniciando-se em ${fmtDate(data.vigencia_inicio)}, podendo ser rescindido por qualquer das partes mediante aviso prévio de ${avisoPrevio} (${avisoPrevio === 30 ? "trinta" : avisoPrevio}) dias.`);
  } else {
    writeParagraph(`O presente contrato é celebrado por prazo determinado, com início em ${fmtDate(data.vigencia_inicio)} e término em ${fmtDate(data.vigencia_fim)}, podendo ser prorrogado mediante acordo entre as partes.`);
  }
  writeParagraph(`Parágrafo Único – Qualquer das partes poderá rescindir o contrato mediante notificação por escrito com antecedência mínima de ${avisoPrevio} (${avisoPrevio === 30 ? "trinta" : avisoPrevio}) dias.`);

  writeClauseTitle("CLÁUSULA TERCEIRA – DAS OBRIGAÇÕES DA CONTRATADA");
  writeParagraph(`A CONTRATADA se obriga a:`);
  writeParagraph(`§1º – Prestar os serviços de escolta armada com zelo, diligência e segurança, utilizando pessoal treinado, qualificado e devidamente habilitado conforme legislação vigente.`);
  writeParagraph(`§2º – Fornecer todos os equipamentos, armamentos e viaturas necessários à execução dos serviços contratados, em perfeito estado de conservação e funcionamento.`);
  writeParagraph(`§3º – Disponibilizar viatura(s) identificada(s), equipada(s) com sistema de rastreamento por GPS, rádio comunicador e demais equipamentos de segurança exigidos.`);
  writeParagraph(`§4º – Manter durante toda a execução do contrato, em compatibilidade com as obrigações por ela assumidas, todas as condições de habilitação e qualificação exigidas, incluindo autorização de funcionamento expedida pela Polícia Federal e demais licenças necessárias.`);
  writeParagraph(`§5º – Manter os equipamentos e veículos em perfeitas condições de uso e com as devidas manutenções em dia, apresentando, quando solicitado pela CONTRATANTE, os comprovantes de revisão e manutenção preventiva.`);
  writeParagraph(`§6º – Providenciar a imediata substituição de qualquer funcionário cujo comportamento seja considerado inadequado pela CONTRATANTE, sem prejuízo das medidas disciplinares cabíveis, no prazo máximo de 24 (vinte e quatro) horas após a comunicação.`);
  writeParagraph(`§7º – Responsabilizar-se por todos os encargos trabalhistas, previdenciários, fiscais e comerciais resultantes da execução do contrato, bem como por eventuais demandas judiciais ou administrativas decorrentes da prestação dos serviços.`);
  writeParagraph(`§8º – Cumprir rigorosamente os itinerários, horários e procedimentos operacionais previamente acordados com a CONTRATANTE.`);
  writeParagraph(`§9º – Manter sigilo absoluto sobre todas as informações relativas às operações da CONTRATANTE, incluindo rotas, horários, valores e demais dados operacionais, sob pena de responsabilidade civil e criminal.`);

  writeClauseTitle("CLÁUSULA QUARTA – DAS OBRIGAÇÕES DA CONTRATANTE");
  writeParagraph(`A CONTRATANTE se obriga a:`);
  writeParagraph(`§1º – Fornecer à CONTRATADA todas as informações necessárias à execução dos serviços, incluindo rotas, horários de carga e descarga, e demais dados operacionais relevantes, com antecedência mínima razoável.`);
  writeParagraph(`§2º – Efetuar os pagamentos devidos nos prazos e condições estabelecidos neste contrato.`);
  writeParagraph(`§3º – Comunicar à CONTRATADA, com antecedência mínima de 24 (vinte e quatro) horas, eventuais alterações nos itinerários, horários ou condições de operação, salvo em casos de urgência devidamente justificada.`);
  writeParagraph(`§4º – Designar um preposto para acompanhar e fiscalizar a execução dos serviços contratados.`);

  writeClauseTitle("CLÁUSULA QUINTA – DA RESPONSABILIDADE CIVIL");
  writeParagraph(`A CONTRATADA se responsabiliza civilmente por danos causados a terceiros ou à CONTRATANTE, decorrentes de culpa ou dolo de seus prepostos na execução dos serviços, respondendo inclusive por eventuais danos materiais e morais.`);
  writeParagraph(`§1º – A CONTRATADA deverá comunicar à CONTRATANTE, por escrito e imediatamente, qualquer ocorrência, acidente ou anormalidade verificada durante a prestação dos serviços, incluindo tentativas de roubo, furto, avarias, acidentes de trânsito e quaisquer outros eventos que possam comprometer a segurança da operação, apresentando relatório detalhado no prazo máximo de 24 (vinte e quatro) horas.`);
  writeParagraph(`§2º – A CONTRATADA deverá manter seguro de responsabilidade civil durante toda a vigência do contrato, apresentando a apólice à CONTRATANTE quando solicitado.`);
  writeParagraph(`§3º – A CONTRATANTE não se responsabiliza por danos causados aos empregados, viaturas ou equipamentos da CONTRATADA durante a execução dos serviços, salvo comprovada culpa exclusiva da CONTRATANTE.`);

  writeClauseTitle("CLÁUSULA SEXTA – DO PREÇO E FORMA DE PAGAMENTO");
  writeParagraph(`Os valores dos serviços serão calculados conforme tabela de preços vigente, acordada entre as partes e anexa a este contrato, considerando os seguintes critérios: quilometragem percorrida (carregado e vazio), franquia mínima de quilômetros, horas de estadia, diárias, VRP (Vale Refeição e Pernoite) e adicionais de periculosidade e noturno, quando aplicáveis.`);
  writeParagraph(`§1º – O pagamento será efetuado mediante apresentação de Boletim de Medição contendo o detalhamento dos serviços prestados no período, acompanhado da respectiva Nota Fiscal.`);
  writeParagraph(`§2º – O prazo para pagamento será de até 30 (trinta) dias após a apresentação da Nota Fiscal, salvo acordo diverso entre as partes.`);

  writeClauseTitle("CLÁUSULA SÉTIMA – DO REAJUSTE");
  writeParagraph(`Os valores dos serviços serão reajustados anualmente, ou na menor periodicidade permitida pela legislação vigente, com base na variação do ${indiceCorrecao} (Índice Nacional de Preços ao Consumidor) ou outro índice que venha a substituí-lo, acumulado no período de 12 (doze) meses.`);
  writeParagraph(`Parágrafo Único – Na hipótese de extinção do índice pactuado, será adotado o que legalmente vier a substituí-lo, mediante acordo entre as partes.`);

  writeClauseTitle("CLÁUSULA OITAVA – DAS PENALIDADES");
  writeParagraph(`O não cumprimento das obrigações assumidas pelas partes ensejará a aplicação das seguintes penalidades:`);
  writeParagraph(`§1º – Em caso de atraso no pagamento pela CONTRATANTE, incidirá multa moratória de ${multaMora}% (${multaMora === 2 ? "dois" : multaMora} por cento) sobre o valor em atraso, acrescida de juros de mora de ${jurosMora}% (${jurosMora === 1 ? "um" : jurosMora} por cento) ao mês, calculados pro rata die.`);
  writeParagraph(`§2º – Em caso de descumprimento de qualquer cláusula contratual, a parte infratora pagará à outra parte multa compensatória correspondente a 20% (vinte por cento) do valor total do contrato, sem prejuízo da indenização por perdas e danos.`);
  writeParagraph(`§3º – A aplicação de qualquer penalidade será precedida de notificação por escrito, concedendo-se prazo de 5 (cinco) dias úteis para defesa.`);

  writeClauseTitle("CLÁUSULA NONA – DA RESCISÃO");
  writeParagraph(`O presente contrato poderá ser rescindido nas seguintes hipóteses:`);
  writeParagraph(`a) Por acordo mútuo entre as partes, formalizado por escrito;`);
  writeParagraph(`b) Por qualquer das partes, mediante aviso prévio por escrito com antecedência mínima de ${avisoPrevio} (${avisoPrevio === 30 ? "trinta" : avisoPrevio}) dias;`);
  writeParagraph(`c) Pela parte inocente, em caso de descumprimento de qualquer cláusula contratual pela outra parte, após notificação e decurso de prazo para regularização;`);
  writeParagraph(`d) Pela ocorrência de caso fortuito ou força maior que impossibilite a continuidade da prestação dos serviços por período superior a 30 (trinta) dias.`);

  writeClauseTitle("CLÁUSULA DÉCIMA – DA CONFIDENCIALIDADE");
  writeParagraph(`As partes se comprometem a manter sigilo absoluto sobre todas as informações obtidas em razão do presente contrato, não podendo divulgar, reproduzir ou utilizar tais informações para fins alheios à execução dos serviços contratados, sob pena de responsabilidade civil e criminal.`);
  writeParagraph(`Parágrafo Único – A obrigação de confidencialidade permanecerá vigente mesmo após a rescisão ou término do presente contrato, pelo prazo de 5 (cinco) anos.`);

  writeClauseTitle("CLÁUSULA DÉCIMA PRIMEIRA – DAS DISPOSIÇÕES GERAIS");
  writeParagraph(`§1º – O presente contrato é celebrado em caráter irretratável e irrevogável, obrigando as partes, seus herdeiros e sucessores.`);
  writeParagraph(`§2º – A tolerância de qualquer das partes quanto ao descumprimento de qualquer cláusula deste contrato não importará em novação ou renúncia de direito.`);
  writeParagraph(`§3º – Qualquer alteração neste contrato somente será válida se efetuada por meio de aditivo contratual, firmado por ambas as partes.`);
  writeParagraph(`§4º – Os casos omissos serão resolvidos de acordo com a legislação vigente e os princípios gerais de direito.`);

  if (data.observacoes) {
    writeClauseTitle("OBSERVAÇÕES");
    writeParagraph(data.observacoes);
  }

  writeClauseTitle("CLÁUSULA DÉCIMA SEGUNDA – DO FORO");
  writeParagraph(`As partes elegem o Foro da Comarca de Rio de Janeiro/RJ para dirimir quaisquer dúvidas ou litígios decorrentes do presente contrato, renunciando a qualquer outro, por mais privilegiado que seja.`);

  y += 8;
  checkPage(30);
  writeParagraph(`E, por estarem assim justas e contratadas, as partes firmam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença das testemunhas abaixo, para que produza seus efeitos legais.`);

  y += 5;
  checkPage(20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Rio de Janeiro, ${extenso(data.data_assinatura || new Date().toISOString())}`, PAGE_W / 2, y, { align: "center" });
  y += 18;

  checkPage(35);
  const colL = MARGIN_L + 10;
  const colR = PAGE_W / 2 + 15;

  doc.setLineWidth(0.3);
  doc.line(colL, y, colL + 60, y);
  doc.line(colR, y, colR + 60, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("CONTRATANTE", colL + 30, y, { align: "center" });
  doc.text("CONTRATADA", colR + 30, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(contratante, colL + 30, y, { align: "center" });
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL LTDA", colR + 30, y, { align: "center" });
  y += 4;
  doc.text(`CNPJ: ${cnpjContratante}`, colL + 30, y, { align: "center" });
  doc.text("CNPJ: 36.982.392/0001-89", colR + 30, y, { align: "center" });

  y += 15;
  checkPage(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TESTEMUNHAS:", MARGIN_L, y);
  y += 8;
  doc.setLineWidth(0.3);
  doc.line(colL, y, colL + 60, y);
  doc.line(colR, y, colR + 60, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Nome:", colL, y);
  doc.text("Nome:", colR, y);
  y += 4;
  doc.text("CPF:", colL, y);
  doc.text("CPF:", colR, y);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`TORRES VIGILÂNCIA PATRIMONIAL LTDA — CNPJ 36.982.392/0001-89`, PAGE_W / 2, 290, { align: "center" });
    doc.text(`Página ${i} de ${totalPages}`, PAGE_W - MARGIN_R, 290, { align: "right" });
    if (data.contract_number) {
      doc.text(`Contrato ${data.contract_number}`, MARGIN_L, 290);
    }
  }

  const fileName = `Contrato_${data.contract_number || "Torres"}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
