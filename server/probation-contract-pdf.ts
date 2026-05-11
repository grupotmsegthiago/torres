import PDFDocument from "pdfkit";
import type { Response } from "express";
import fs from "fs";
import path from "path";

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
  address: "AV RAIMUNDO PEREIRA DE MAGALHAES, 5720 PIRITUBA",
  city: "SAO PAULO",
  state: "SP",
  cnpj: "36.982.392/0001-89",
};

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmtDateBr(d: string): string {
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

function loadLogo(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), "client/public/icon-192x192.png"),
    path.join(process.cwd(), "client/public/logo-torres-dark.jpeg"),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p); } catch {}
  }
  return null;
}

export function generateProbationContractPDF(res: Response, data: ProbationContractData) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 30, bottom: 25, left: 40, right: 40 },
  });

  res.setHeader("Content-Type", "application/pdf");
  const safeName = data.employeeName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  res.setHeader("Content-Disposition", `inline; filename="Contrato_Experiencia_${safeName}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LM = doc.page.margins.left;

  const F_NORMAL = "Helvetica";
  const F_BOLD = "Helvetica-Bold";
  const SZ = 8.5;
  const SZ_TITLE = 12;
  const LG = 2;
  const PARA_GAP = 0.45;

  doc.fillColor("#000000").strokeColor("#000000");

  // ===== Cabeçalho com logotipo =====
  const logo = loadLogo();
  const headerY = doc.y;
  if (logo) {
    try { doc.image(logo, LM, headerY, { width: 42, height: 42 }); } catch {}
  }
  doc.font(F_BOLD).fontSize(11).fillColor("#000000")
    .text(COMPANY.name, LM + 50, headerY + 4, { width: W - 50 });
  doc.font(F_NORMAL).fontSize(8)
    .text(`CNPJ: ${COMPANY.cnpj}`, LM + 50, headerY + 18, { width: W - 50 })
    .text(`${COMPANY.address} — ${COMPANY.city}/${COMPANY.state}`, LM + 50, headerY + 28, { width: W - 50 });

  doc.moveTo(LM, headerY + 48).lineTo(LM + W, headerY + 48).strokeColor("#000000").lineWidth(0.8).stroke();
  doc.y = headerY + 54;

  // ===== Título =====
  doc.font(F_BOLD).fontSize(SZ_TITLE).fillColor("#000000")
    .text("CONTRATO DE EXPERIÊNCIA", LM, doc.y, { width: W, align: "center" });
  doc.moveDown(0.4);

  // ===== Helper de parágrafo =====
  function para(text: string, opts: { align?: "left"|"center"|"justify"; gap?: number } = {}) {
    doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000");
    doc.text(text, LM, doc.y, { align: opts.align || "justify", lineGap: LG, width: W });
    doc.moveDown(opts.gap ?? PARA_GAP);
  }

  // ===== Cabeçalho qualificativo =====
  para(`Pelo presente instrumento particular de Contrato de Experiência, a empresa ${COMPANY.name} com sede à ${COMPANY.address} Cidade ${COMPANY.city} Estado ${COMPANY.state}, inscrita no CNPJ do MF sob Nº ${COMPANY.cnpj}, denominada Empregadora, E O SR.(A) ${data.employeeName.toUpperCase()}, DOMICILIADO À ${data.employeeAddress.toUpperCase()}, NO BAIRRO ${data.employeeNeighborhood.toUpperCase()}, NA CIDADE DE ${data.employeeCity.toUpperCase()}/${data.employeeState.toUpperCase()}, PORTADOR DA CTPS Nº/SÉRIE ${data.ctpsNumber}/${data.ctpsSerie} DORAVANTE CHAMADO EMPREGADO, FICA JUSTO E ACERTADO O PRESENTE CONTRATO INDIVIDUAL DE TRABALHO, REGIDO PELAS SEGUINTES CLAUSULAS:`);

  para(`1 - O Empregado trabalhará para a Empregadora na função de ${data.funcao.toUpperCase()} e mais as funções que vierem a ser objeto de ordens verbais, cartas ou avisos, segundo as necessidades da Empregadora desde que compatíveis com suas atribuições.`);

  para(`2 - O local de trabalho situa-se ${data.localTrabalho || "O MESMO DA EMPRESA"}, podendo a Empregadora, a qualquer tempo, transferir o Empregado a título temporário ou definitivo, tanto no âmbito da unidade para a qual foi admitido, como para outras, em qualquer localidade deste Estado ou de outro dentro do País, em conformidade com o parágrafo 1º do artigo 469 da Consolidação das Leis do Trabalho.`);

  para(`3 - O horário de trabalho do empregado será o seguinte:`, { gap: 0.15 });
  para(data.jornada || "A jornada de trabalho será flexível", { align: "center" });

  para(`4 - O Empregado perceberá a remuneração de:`, { gap: 0.15 });
  para(fmtBrl(Number(data.remuneracao)), { align: "center" });

  para(`5 - O prazo deste contrato é de ${data.durationDays} dias, com inicio em ${fmtDateBr(data.startDate)} e término em ${fmtDateBr(data.endDate)}.`);

  para(`6 - Além dos descontos previstos na Lei, reserva-se a Empregadora o direito de descontar do Empregado as importâncias correspondentes aos danos causados por ele, com fundamento no parágrafo 1º do artigo 462 da Consolidação das Leis de Trabalho.`);

  para(`7 - O Empregado fica ciente do Regulamento da Empresa e das Normas de Segurança que regulam suas atividades na Empregadora e se compromete a usar os equipamentos de segurança fornecidos, sob a pena de ser punido por falta grave, nos termos da Legislação vigente e demais disposições inerentes à segurança e medicina do trabalho.`);

  para(`8 - Permanecendo o Empregado a serviço da Empregadora após o término da experiência, continuarão em vigor as cláusulas constantes deste contrato.`);

  para(`9 - A rescisão do presente contrato, sem justa causa, por parte da empregadora ou do empregado, antes do término do contrato, implicará em indenização, e por metade, a indenização que teria direito até o término do contrato, conforme art. 479 e 480 da CLT.`);

  para(`Tendo assim contratado, assinam o presente instrumento, em duas vias, na presença da testemunha abaixo.`);

  doc.moveDown(0.4);
  doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000")
    .text(`${data.cidadeContrato.toUpperCase()}, ${fmtDateExtenso(data.startDate)}.`, LM, doc.y, { width: W });
  doc.moveDown(1.2);

  // ===== Bloco assinaturas (compacto, 2 colunas) =====
  const colW = (W - 20) / 2;
  const colLx = LM;
  const colRx = LM + colW + 20;
  let yAss = doc.y;

  // Assinatura digital embutida (se houver) acima da linha do empregado
  if (data.signatureDrawing && /^data:image\//i.test(data.signatureDrawing)) {
    try {
      const base64 = data.signatureDrawing.split(",")[1];
      const imgBuf = Buffer.from(base64, "base64");
      doc.image(imgBuf, colRx + 20, yAss - 20, { width: colW - 40, height: 22, align: "center" });
    } catch {}
  }

  doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000");
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text(COMPANY.name, colLx, yAss + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text(data.employeeName.toUpperCase(), colRx, yAss + 10, { width: colW, align: "center" });

  yAss = yAss + 38;
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text("Testemunha", colLx, yAss + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text("Responsável quando for menor", colRx, yAss + 10, { width: colW, align: "center" });

  doc.y = yAss + 36;

  // ===== Prorrogação (na mesma página, compacta) =====
  doc.moveTo(LM, doc.y).lineTo(LM + W, doc.y).strokeColor("#000000").lineWidth(0.5).stroke();
  doc.moveDown(0.6);

  doc.font(F_BOLD).fontSize(10).fillColor("#000000")
    .text("PRORROGAÇÃO DE CONTRATO DE EXPERIÊNCIA", LM, doc.y, { width: W, align: "center" });
  doc.moveDown(0.5);

  doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000")
    .text("Por mútuo acordo, o presente contrato de experiência fica prorrogado até ____/____/______.", LM, doc.y, { width: W, align: "justify", lineGap: LG });
  doc.moveDown(0.5);
  doc.text("____________________, ___ de __________________ de ________", LM, doc.y, { width: W });
  doc.moveDown(1.4);

  let yP = doc.y;
  doc.text("____________________________________", colLx, yP, { width: colW, align: "center" });
  doc.text(COMPANY.name, colLx, yP + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yP, { width: colW, align: "center" });
  doc.text(data.employeeName.toUpperCase(), colRx, yP + 10, { width: colW, align: "center" });

  yP = yP + 38;
  doc.text("____________________________________", colLx, yP, { width: colW, align: "center" });
  doc.text("Testemunha", colLx, yP + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yP, { width: colW, align: "center" });
  doc.text("Responsável quando for menor", colRx, yP + 10, { width: colW, align: "center" });

  // ===== Evidência da assinatura digital (rodapé compacto, mesma página) =====
  if (data.signedAt) {
    const evY = yP + 30;
    if (evY < doc.page.height - doc.page.margins.bottom - 50) {
      doc.font(F_NORMAL).fontSize(6).fillColor("#000000");
      const ts = new Date(data.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      doc.text(`Assinado eletronicamente em ${ts} (BRT) — IP: ${data.signatureIp || "-"} — Funcionário: ${data.employeeName} — Aceitou termo de ciência e validade jurídica da assinatura eletrônica.`, LM, evY, { width: W, align: "center" });
    }
  }

  doc.end();
}
