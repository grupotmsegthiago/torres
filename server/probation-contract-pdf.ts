import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface ProbationContractData {
  employeeName: string;
  employeeAddress: string;
  employeeNeighborhood: string;
  employeeCity: string;
  employeeState: string;
  ctpsNumber: string;
  ctpsSerie: string;
  funcao: string;
  remuneracao: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  cidadeContrato: string;
  localTrabalho?: string;
  jornada?: string;
  signatureFacial?: string | null;
  signatureDrawing?: string | null;
  signedAt?: string | null;
  signatureIp?: string | null;
}

const COMPANY = {
  name: "TORRES VIGILANCIA PATRIMONIAL LTDA",
  shortName: "TORRES VIGILÂNCIA PATRIMONIAL",
  address: "AV RAIMUNDO PEREIRA DE MAGALHAES, 5720 PIRITUBA",
  city: "SAO PAULO",
  state: "SP",
  cnpj: "36.982.392/0001-89",
  footer: "www.torresseguranca.com.br • @grupotorres.seguranca • (11) 96369-6699 • escolta@torresseguranca.com.br",
};

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmtDateBr(d: string): string {
  // d esperado YYYY-MM-DD
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${String(day).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`;
}

function fmtDateExtenso(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${String(day).padStart(2,"0")} de ${MESES_PT[m-1]} de ${y}`;
}

function fmtBrl(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateProbationContractPDF(res: Response, data: ProbationContractData) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 80, bottom: 70, left: 60, right: 60 },
    bufferPages: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  const safeName = data.employeeName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  res.setHeader("Content-Disposition", `inline; filename="Contrato_Experiencia_${safeName}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LM = doc.page.margins.left;

  const F_NORMAL = "Helvetica";
  const F_BOLD = "Helvetica-Bold";
  const SZ = 10;
  const SZ_TITLE = 14;
  const LG = 4;

  function drawHeader() {
    const y = 25;
    doc.font(F_BOLD).fontSize(10).fillColor("#000000");
    doc.text(COMPANY.shortName, LM, y, { width: W, align: "center" });
    doc.font(F_NORMAL).fontSize(8).fillColor("#555555");
    doc.text(`CNPJ: ${COMPANY.cnpj}`, LM, y + 14, { width: W, align: "center" });
    doc.fillColor("#000000");
  }

  function drawFooter() {
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

  function paragraph(text: string, opts: { bold?: boolean; align?: "left"|"center"|"justify"; indent?: number } = {}) {
    checkPage(30);
    doc.font(opts.bold ? F_BOLD : F_NORMAL).fontSize(SZ).fillColor("#000000");
    doc.text(text, LM, doc.y, {
      align: opts.align || "justify",
      lineGap: LG,
      width: W,
      indent: opts.indent || 0,
    });
    doc.moveDown(0.4);
  }

  drawHeader();
  doc.y = 65;

  doc.moveDown(1);
  doc.font(F_BOLD).fontSize(SZ_TITLE).text("CONTRATO DE EXPERIÊNCIA", LM, doc.y, { width: W, align: "center" });
  doc.moveDown(1.2);

  // Cabeçalho qualificativo
  paragraph(
    `Pelo presente instrumento particular de Contrato de Experiência, a empresa ${COMPANY.name} com sede à ${COMPANY.address} Cidade ${COMPANY.city} Estado ${COMPANY.state}, inscrita no CNPJ do MF sob Nº ${COMPANY.cnpj}, denominada Empregadora, E O SR.(A) ${data.employeeName.toUpperCase()}, DOMICILIADO À ${data.employeeAddress.toUpperCase()}, NO BAIRRO ${data.employeeNeighborhood.toUpperCase()}, NA CIDADE DE ${data.employeeCity.toUpperCase()}/${data.employeeState.toUpperCase()}, PORTADOR DA CTPS Nº/SÉRIE ${data.ctpsNumber}/${data.ctpsSerie} DORAVANTE CHAMADO EMPREGADO, FICA JUSTO E ACERTADO O PRESENTE CONTRATO INDIVIDUAL DE TRABALHO, REGIDO PELAS SEGUINTES CLAUSULAS:`
  );

  doc.moveDown(0.3);

  paragraph(`1 - O Empregado trabalhará para a Empregadora na função de ${data.funcao.toUpperCase()} e mais as funções que vierem a ser objeto de ordens verbais, cartas ou avisos, segundo as necessidades da Empregadora desde que compatíveis com suas atribuições.`);

  paragraph(`2 - O local de trabalho situa-se ${data.localTrabalho || "O MESMO DA EMPRESA"}, podendo a Empregadora, a qualquer tempo, transferir o Empregado a título temporário ou definitivo, tanto no âmbito da unidade para a qual foi admitido, como para outras, em qualquer localidade deste Estado ou de outro dentro do País, em conformidade com o parágrafo 1º do artigo 469 da Consolidação das Leis do Trabalho.`);

  paragraph(`3 - O horário de trabalho do empregado será o seguinte:`);
  paragraph(data.jornada || "A jornada de trabalho será flexível");

  paragraph(`4 - O Empregado perceberá a remuneração de:`);
  paragraph(fmtBrl(Number(data.remuneracao)));

  paragraph(`5 - O prazo deste contrato é de ${data.durationDays} dias, com inicio em ${fmtDateBr(data.startDate)} e término em ${fmtDateBr(data.endDate)}.`);

  paragraph(`6 - Além dos descontos previstos na Lei, reserva-se a Empregadora o direito de descontar do Empregado as importâncias correspondentes aos danos causados por ele, com fundamento no parágrafo 1º do artigo 462 da Consolidação das Leis de Trabalho.`);

  paragraph(`7 - O Empregado fica ciente do Regulamento da Empresa e das Normas de Segurança que regulam suas atividades na Empregadora e se compromete a usar os equipamentos de segurança fornecidos, sob a pena de ser punido por falta grave, nos termos da Legislação vigente e demais disposições inerentes à segurança e medicina do trabalho.`);

  paragraph(`8 - Permanecendo o Empregado a serviço da Empregadora após o término da experiência, continuarão em vigor as cláusulas constantes deste contrato.`);

  paragraph(`9 - A rescisão do presente contrato, sem justa causa, por parte da empregadora ou do empregado, antes do término do contrato, implicará em indenização, e por metade, a indenização que teria direito até o término do contrato, conforme art. 479 e 480 da CLT.`);

  paragraph(`Tendo assim contratado, assinam o presente instrumento, em duas vias, na presença da testemunha abaixo.`);

  doc.moveDown(0.6);
  paragraph(`${data.cidadeContrato.toUpperCase()}, ${fmtDateExtenso(data.startDate)}.`);

  // Bloco de assinaturas
  checkPage(180);
  doc.moveDown(1.5);
  const colW = (W - 30) / 2;
  const colLx = LM;
  const colRx = LM + colW + 30;
  let yAss = doc.y;

  // Empregadora (esq)
  doc.font(F_NORMAL).fontSize(8).fillColor("#000000");
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text(COMPANY.name, colLx, yAss + 12, { width: colW, align: "center" });

  // Empregado (dir) — se assinou, embute imagem da assinatura
  if (data.signatureDrawing && /^data:image\//i.test(data.signatureDrawing)) {
    try {
      const base64 = data.signatureDrawing.split(",")[1];
      const imgBuf = Buffer.from(base64, "base64");
      doc.image(imgBuf, colRx + 30, yAss - 25, { width: colW - 60, height: 35, align: "center" });
    } catch {}
  }
  doc.font(F_NORMAL).fontSize(8).fillColor("#000000");
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text(data.employeeName.toUpperCase(), colRx, yAss + 12, { width: colW, align: "center" });

  doc.y = yAss + 50;
  yAss = doc.y;
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text("Testemunha", colLx, yAss + 12, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text("Responsável quando for menor", colRx, yAss + 12, { width: colW, align: "center" });

  // Bloco de evidência da assinatura digital (se houver)
  if (data.signedAt) {
    doc.moveDown(2);
    checkPage(140);
    const blockY = doc.y;
    doc.rect(LM, blockY, W, 130).strokeColor("#cccccc").stroke();
    doc.font(F_BOLD).fontSize(9).fillColor("#000000")
      .text("ASSINATURA DIGITAL — EVIDÊNCIA", LM + 10, blockY + 8);
    doc.font(F_NORMAL).fontSize(8).fillColor("#555555");
    const ts = new Date(data.signedAt);
    const tsStr = ts.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    doc.text(`Assinado em: ${tsStr} (BRT)`, LM + 10, blockY + 24);
    doc.text(`IP: ${data.signatureIp || "-"}`, LM + 10, blockY + 36);
    doc.text(`Funcionário: ${data.employeeName}`, LM + 10, blockY + 48);
    doc.text(`Aceitou termo de ciência e validade jurídica da assinatura eletrônica.`, LM + 10, blockY + 60);

    if (data.signatureFacial && /^data:image\//i.test(data.signatureFacial)) {
      try {
        const base64 = data.signatureFacial.split(",")[1];
        const imgBuf = Buffer.from(base64, "base64");
        doc.image(imgBuf, LM + 10, blockY + 75, { width: 50, height: 50 });
        doc.fontSize(7).text("Captura facial", LM + 10, blockY + 128, { width: 50, align: "center" });
      } catch {}
    }
    if (data.signatureDrawing && /^data:image\//i.test(data.signatureDrawing)) {
      try {
        const base64 = data.signatureDrawing.split(",")[1];
        const imgBuf = Buffer.from(base64, "base64");
        doc.image(imgBuf, LM + 80, blockY + 75, { width: 150, height: 50 });
        doc.fontSize(7).text("Assinatura digital", LM + 80, blockY + 128, { width: 150, align: "center" });
      } catch {}
    }
  }

  // Página 2 — prorrogação
  doc.addPage();
  drawHeader();
  doc.y = 65;
  doc.moveDown(2);
  doc.font(F_BOLD).fontSize(SZ_TITLE).text("PRORROGAÇÃO DE CONTRATO DE EXPERIÊNCIA", LM, doc.y, { width: W, align: "center" });
  doc.moveDown(1.5);
  paragraph(`Por mútuo acordo, o presente contrato de experiência fica prorrogado até ____/____/______.`);
  doc.moveDown(1);
  paragraph(`____________________, ___ de __________________ de ________`);

  doc.moveDown(2.5);
  let yP = doc.y;
  doc.font(F_NORMAL).fontSize(8);
  doc.text("____________________________________", LM, yP, { width: colW, align: "center" });
  doc.text(COMPANY.name, LM, yP + 12, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yP, { width: colW, align: "center" });
  doc.text(data.employeeName.toUpperCase(), colRx, yP + 12, { width: colW, align: "center" });

  doc.y = yP + 50;
  yP = doc.y;
  doc.text("____________________________________", LM, yP, { width: colW, align: "center" });
  doc.text("Testemunha", LM, yP + 12, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yP, { width: colW, align: "center" });
  doc.text("Responsável quando for menor", colRx, yP + 12, { width: colW, align: "center" });

  // Footers em todas as páginas
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawFooter();
  }

  doc.end();
}
