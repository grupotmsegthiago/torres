import jsPDFImport from "jspdf";

const jsPDF = (typeof jsPDFImport === "function" ? jsPDFImport : (jsPDFImport as { default: typeof jsPDFImport }).default) as typeof jsPDFImport;

export type PatrimonialProposalPdfLine = {
  funcao: string;
  escala: string;
  postos: number;
  total: number;
};

function brl(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** PDF da apresentação. Não inclui margem, custo nem linha do tempo. */
export function buildPatrimonialProposalPdf(input: {
  clientName: string;
  city: string;
  uf: string;
  lines: PatrimonialProposalPdfLine[];
  total: number;
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Torres Vigilância Patrimonial", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Proposta comercial", 14, 20);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(input.clientName || "Cliente", 14, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${input.city}/${input.uf}`, 14, 48);

  let y = 60;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 5, 182, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("FUNÇÃO", 16, y);
  doc.text("ESCALA", 100, y);
  doc.text("POSTOS", 145, y, { align: "right" });
  doc.text("TOTAL", 194, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  y += 8;
  for (const line of input.lines) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(line.funcao || "Função"), 16, y);
    doc.text(String(line.escala || ""), 100, y);
    doc.text(String(line.postos || 0), 145, y, { align: "right" });
    doc.text(brl(line.total), 194, y, { align: "right" });
    y += 7;
  }

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(29, 78, 216);
  doc.text(`Total da proposta  ${brl(input.total)}`, 194, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL  •  CNPJ 36.982.392/0001-89  •  www.torresseguranca.com.br", 105, 287, { align: "center" });

  return doc;
}

export function downloadPatrimonialProposalPdf(input: Parameters<typeof buildPatrimonialProposalPdf>[0]) {
  const slug = (input.clientName || "cliente").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente";
  buildPatrimonialProposalPdf(input).save(`proposta-patrimonial-${slug}.pdf`);
}
