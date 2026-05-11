import PDFDocument from "pdfkit";
import type { Response } from "express";
import fs from "fs";
import path from "path";

export interface PermanentContractData {
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
  cidadeContrato: string;
  localTrabalho?: string;
  jornada?: string;
  signatureFacial?: string | null;
  signatureDrawing?: string | null;
  signedAt?: string | null;
  signatureIp?: string | null;
}

export interface PermanentContractTemplate {
  cabecalho: string;
  clausula1: string;
  clausula2: string;
  clausula3Titulo: string;
  jornadaPadrao: string;
  clausula4Titulo: string;
  clausula5: string;
  clausula6: string;
  clausula7: string;
  clausula8: string;
  fechamento: string;
}

export const DEFAULT_PERMANENT_TEMPLATE: PermanentContractTemplate = {
  cabecalho: `Pelo presente instrumento particular de Contrato Individual de Trabalho por Prazo Indeterminado, a empresa {{empresa_nome}} com sede à {{empresa_endereco}} Cidade {{empresa_cidade}} Estado {{empresa_estado}}, inscrita no CNPJ do MF sob Nº {{empresa_cnpj}}, denominada Empregadora, E O SR.(A) {{empregado_nome}}, DOMICILIADO À {{empregado_endereco}}, NO BAIRRO {{empregado_bairro}}, NA CIDADE DE {{empregado_cidade}}/{{empregado_estado}}, PORTADOR DA CTPS Nº/SÉRIE {{ctps_numero}}/{{ctps_serie}} DORAVANTE CHAMADO EMPREGADO, FICA JUSTO E ACERTADO, EM SEQUÊNCIA AO CONTRATO DE EXPERIÊNCIA JÁ CUMPRIDO, O PRESENTE CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO, REGIDO PELAS SEGUINTES CLÁUSULAS:`,
  clausula1: `1 - O Empregado continuará trabalhando para a Empregadora na função de {{funcao}} e mais as funções que vierem a ser objeto de ordens verbais, cartas ou avisos, segundo as necessidades da Empregadora desde que compatíveis com suas atribuições.`,
  clausula2: `2 - O local de trabalho situa-se {{local_trabalho}}, podendo a Empregadora, a qualquer tempo, transferir o Empregado a título temporário ou definitivo, tanto no âmbito da unidade para a qual foi admitido, como para outras, em qualquer localidade deste Estado ou de outro dentro do País, em conformidade com o parágrafo 1º do artigo 469 da Consolidação das Leis do Trabalho.`,
  clausula3Titulo: `3 - O horário de trabalho do empregado será o seguinte:`,
  jornadaPadrao: `A jornada de trabalho será flexível`,
  clausula4Titulo: `4 - O Empregado perceberá a remuneração de:`,
  clausula5: `5 - O presente contrato é por PRAZO INDETERMINADO, com início em {{data_inicio}}, sucedendo o Contrato de Experiência cumprido pelo Empregado, na forma do art. 451 da CLT.`,
  clausula6: `6 - Além dos descontos previstos na Lei, reserva-se a Empregadora o direito de descontar do Empregado as importâncias correspondentes aos danos causados por ele, com fundamento no parágrafo 1º do artigo 462 da Consolidação das Leis de Trabalho.`,
  clausula7: `7 - O Empregado fica ciente do Regulamento da Empresa e das Normas de Segurança que regulam suas atividades na Empregadora e se compromete a usar os equipamentos de segurança fornecidos, sob a pena de ser punido por falta grave, nos termos da Legislação vigente e demais disposições inerentes à segurança e medicina do trabalho.`,
  clausula8: `8 - A rescisão do presente contrato observará as regras da CLT aplicáveis aos contratos por prazo indeterminado, inclusive quanto a aviso prévio, multa do FGTS e demais verbas rescisórias.`,
  fechamento: `Tendo assim contratado, assinam o presente instrumento, em duas vias, na presença da testemunha abaixo.`,
};

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

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));
}

export function generatePermanentContractPDF(
  res: Response,
  data: PermanentContractData,
  template: PermanentContractTemplate = DEFAULT_PERMANENT_TEMPLATE
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 30, bottom: 25, left: 40, right: 40 },
  });

  res.setHeader("Content-Type", "application/pdf");
  const safeName = data.employeeName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  res.setHeader("Content-Disposition", `inline; filename="Contrato_Definitivo_${safeName}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LM = doc.page.margins.left;

  const F_NORMAL = "Helvetica";
  const F_BOLD = "Helvetica-Bold";
  const SZ = 9;
  const SZ_TITLE = 12;
  const LG = 2;
  const PARA_GAP = 0.5;

  const vars: Record<string, string> = {
    empresa_nome: COMPANY.name,
    empresa_endereco: COMPANY.address,
    empresa_cidade: COMPANY.city,
    empresa_estado: COMPANY.state,
    empresa_cnpj: COMPANY.cnpj,
    empregado_nome: data.employeeName.toUpperCase(),
    empregado_endereco: data.employeeAddress.toUpperCase(),
    empregado_bairro: data.employeeNeighborhood.toUpperCase(),
    empregado_cidade: data.employeeCity.toUpperCase(),
    empregado_estado: data.employeeState.toUpperCase(),
    ctps_numero: data.ctpsNumber,
    ctps_serie: data.ctpsSerie,
    funcao: data.funcao.toUpperCase(),
    remuneracao: fmtBrl(Number(data.remuneracao)),
    data_inicio: fmtDateBr(data.startDate),
    cidade_contrato: data.cidadeContrato.toUpperCase(),
    data_extenso: fmtDateExtenso(data.startDate),
    jornada: data.jornada || template.jornadaPadrao,
    local_trabalho: data.localTrabalho || "O MESMO DA EMPRESA",
  };
  const sub = (s: string) => applyTemplate(s, vars);

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
    .text("CONTRATO INDIVIDUAL DE TRABALHO — PRAZO INDETERMINADO", LM, doc.y, { width: W, align: "center" });
  doc.moveDown(0.5);

  function para(text: string, opts: { align?: "left"|"center"|"justify"; gap?: number } = {}) {
    doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000");
    doc.text(text, LM, doc.y, { align: opts.align || "justify", lineGap: LG, width: W });
    doc.moveDown(opts.gap ?? PARA_GAP);
  }

  para(sub(template.cabecalho));
  para(sub(template.clausula1));
  para(sub(template.clausula2));
  para(sub(template.clausula3Titulo), { gap: 0.15 });
  para(sub(vars.jornada), { align: "center" });
  para(sub(template.clausula4Titulo), { gap: 0.15 });
  para(vars.remuneracao, { align: "center" });
  para(sub(template.clausula5));
  para(sub(template.clausula6));
  para(sub(template.clausula7));
  para(sub(template.clausula8));
  para(sub(template.fechamento));

  doc.moveDown(0.4);
  doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000")
    .text(`${vars.cidade_contrato}, ${vars.data_extenso}.`, LM, doc.y, { width: W });
  doc.moveDown(1.4);

  // ===== Bloco assinaturas =====
  const colW = (W - 20) / 2;
  const colLx = LM;
  const colRx = LM + colW + 20;
  let yAss = doc.y;

  if (data.signatureDrawing && /^data:image\//i.test(data.signatureDrawing)) {
    try {
      const base64 = data.signatureDrawing.split(",")[1];
      const imgBuf = Buffer.from(base64, "base64");
      doc.image(imgBuf, colRx + 20, yAss - 22, { width: colW - 40, height: 22, align: "center" });
    } catch {}
  }

  doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000");
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text(COMPANY.name, colLx, yAss + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text(vars.empregado_nome, colRx, yAss + 10, { width: colW, align: "center" });

  yAss = yAss + 38;
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text("Testemunha", colLx, yAss + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text("Testemunha", colRx, yAss + 10, { width: colW, align: "center" });

  doc.y = yAss + 36;

  // ===== Evidência da assinatura digital =====
  if (data.signedAt) {
    const evY = doc.y + 10;
    if (evY < doc.page.height - doc.page.margins.bottom - 30) {
      doc.font(F_NORMAL).fontSize(6).fillColor("#000000");
      const ts = new Date(data.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      doc.text(`Assinado eletronicamente em ${ts} (BRT) — IP: ${data.signatureIp || "-"} — Funcionário: ${data.employeeName} — Aceitou termo de ciência e validade jurídica da assinatura eletrônica conforme MP 2.200-2/2001 e Lei 14.063/2020.`, LM, evY, { width: W, align: "center" });
    }
  }

  doc.end();
}
