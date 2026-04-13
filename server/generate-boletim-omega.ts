import ExcelJS from "exceljs";
import path from "path";
import { createSmtpTransporter, getSmtpFrom } from "./routes/_helpers";

const LOGO_PATH = path.resolve("attached_assets/image_1772056652908.png");

export async function generateBoletimOmega(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torres Vigilância Patrimonial";
  wb.created = new Date();

  const ws = wb.addWorksheet("Boletim Medição", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    properties: { defaultColWidth: 12 },
  });

  ws.columns = [
    { key: "A", width: 12 },
    { key: "B", width: 52 },
    { key: "C", width: 14 },
    { key: "D", width: 10 },
    { key: "E", width: 14 },
    { key: "F", width: 10 },
    { key: "G", width: 14 },
    { key: "H", width: 14 },
    { key: "I", width: 12 },
    { key: "J", width: 14 },
    { key: "K", width: 12 },
    { key: "L", width: 14 },
    { key: "M", width: 14 },
    { key: "N", width: 10 },
    { key: "O", width: 10 },
    { key: "P", width: 14 },
    { key: "Q", width: 14 },
    { key: "R", width: 10 },
    { key: "S", width: 10 },
    { key: "T", width: 12 },
    { key: "U", width: 12 },
    { key: "V", width: 12 },
    { key: "W", width: 12 },
    { key: "X", width: 12 },
    { key: "Y", width: 12 },
    { key: "Z", width: 12 },
    { key: "AA", width: 12 },
    { key: "AB", width: 14 },
  ];

  const black = "FF1A1A1A";
  const white = "FFFFFFFF";
  const headerFont: Partial<ExcelJS.Font> = { name: "Arial", size: 9, bold: true, color: { argb: white } };
  const dataFont: Partial<ExcelJS.Font> = { name: "Arial", size: 8, color: { argb: "FF333333" } };
  const titleFont: Partial<ExcelJS.Font> = { name: "Arial", size: 14, bold: true, color: { argb: white } };
  const blackFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: black } };
  const grayFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCCCCCC" } };
  const borders: Partial<ExcelJS.Borders> = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  let row = 1;

  ws.mergeCells(`A${row}:AB${row}`);
  const titleRow = ws.getRow(row);
  titleRow.height = 36;
  const titleCell = ws.getCell(`A${row}`);
  titleCell.value = "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL";
  titleCell.font = titleFont;
  titleCell.fill = blackFill;
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  row++;
  ws.mergeCells(`A${row}:AB${row}`);
  const subtitleRow = ws.getRow(row);
  subtitleRow.height = 20;
  const subtitleCell = ws.getCell(`A${row}`);
  subtitleCell.value = "GERAL — ABRIL/2026 — MÊS COMPLETO";
  subtitleCell.font = { name: "Arial", size: 10, bold: true, color: { argb: white } };
  subtitleCell.fill = blackFill;
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

  row++;
  ws.mergeCells(`A${row}:AB${row}`);
  const clientRow = ws.getRow(row);
  clientRow.height = 18;
  const clientCell = ws.getCell(`A${row}`);
  clientCell.value = "REFERENTE AO SERVIÇO DE ESCOLTA ARMADA - OMEGA SOLUTIONS TRANSPORTES LTDA";
  clientCell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFF4444" } };
  clientCell.fill = blackFill;
  clientCell.alignment = { horizontal: "center", vertical: "middle" };

  row++;
  ws.getRow(row).height = 6;

  row++;
  ws.mergeCells(`A${row}:G${row}`);
  ws.getCell(`A${row}`).value = "TABELA ACORDADA";
  ws.getCell(`A${row}`).font = headerFont;
  ws.getCell(`A${row}`).fill = blackFill;
  ws.getCell(`A${row}`).alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`H${row}:Q${row}`);
  ws.getCell(`H${row}`).value = "INFORMAÇÕES DA VIAGEM";
  ws.getCell(`H${row}`).font = headerFont;
  ws.getCell(`H${row}`).fill = blackFill;
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`R${row}:T${row}`);
  ws.getCell(`R${row}`).value = "QUILOMETRAGEM";
  ws.getCell(`R${row}`).font = headerFont;
  ws.getCell(`R${row}`).fill = blackFill;
  ws.getCell(`R${row}`).alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`U${row}:V${row}`);
  ws.getCell(`U${row}`).value = "HORÁRIO";
  ws.getCell(`U${row}`).font = headerFont;
  ws.getCell(`U${row}`).fill = blackFill;
  ws.getCell(`U${row}`).alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`W${row}:Z${row}`);
  ws.getCell(`W${row}`).value = "KM EXCEDENTE";
  ws.getCell(`W${row}`).font = headerFont;
  ws.getCell(`W${row}`).fill = blackFill;
  ws.getCell(`W${row}`).alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`AA${row}:AB${row}`);
  ws.getCell(`AA${row}`).value = "HORA EXCEDENTE";
  ws.getCell(`AA${row}`).font = headerFont;
  ws.getCell(`AA${row}`).fill = blackFill;
  ws.getCell(`AA${row}`).alignment = { horizontal: "center", vertical: "middle" };

  ws.getRow(row).height = 22;

  row++;
  const subHeaders = [
    "Nº OS", "ROTA", "VALOR", "HR (hh:mm)", "HR EXTRA R$", "KM FRANQ",
    "KM EXTRA R$", "DATA INÍCIO", "HORA INÍCIO", "HORA PADRÃO", "VIATURA",
    "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM",
    "KM", "KM INICIAL", "KM FINAL",
    "HR INÍCIO", "HR FIM", "HR TOTAL",
    "EXC. KM", "VLR KM", "HR EXC", "VLR HR",
    "TOT KM", "TOT HR",
    "VALORES", "PEDÁGIO",
  ];

  const subRow = ws.getRow(row);
  subRow.height = 24;
  subHeaders.forEach((h, i) => {
    const cell = subRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Arial", size: 7, bold: true, color: { argb: white } };
    cell.fill = blackFill;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = borders;
  });

  row++;
  const dataRow = ws.getRow(row);
  dataRow.height = 22;
  const dataValues = [
    "TOR-0039",
    "AEROPORTO DE GUARULHOS (GRU) > OMEGA SOLUTIONS TRANSPORTES (GRU)",
    580.00,
    "03:00",
    130.00,
    100,
    5.80,
    "30/04/2026",
    "19:12",
    "22:12",
    "PAJERO",
    "FLV*85",
    "30/04/2026",
    "19:33",
    21,
    200,
    221,
    "19:12",
    "19:33",
    "00:21",
    0,
    0,
    0,
    0,
    0,
    0,
    340.00,
    0,
  ];

  dataValues.forEach((v, i) => {
    const cell = dataRow.getCell(i + 1);
    cell.value = v;
    cell.font = dataFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borders;
    if (i % 2 === 0) cell.fill = grayFill;

    if (typeof v === "number" && (i === 2 || i === 4 || i === 6 || i >= 26)) {
      cell.numFmt = '#,##0.00';
    }
  });

  row++;
  ws.getRow(row).height = 6;

  row++;
  const totalRow = ws.getRow(row);
  totalRow.height = 28;
  ws.mergeCells(`A${row}:Z${row}`);
  ws.getCell(`A${row}`).value = "TOTAL";
  ws.getCell(`A${row}`).font = { name: "Arial", size: 11, bold: true, color: { argb: white } };
  ws.getCell(`A${row}`).fill = blackFill;
  ws.getCell(`A${row}`).alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells(`AA${row}:AB${row}`);
  ws.getCell(`AA${row}`).value = 340.00;
  ws.getCell(`AA${row}`).font = { name: "Arial", size: 12, bold: true, color: { argb: white } };
  ws.getCell(`AA${row}`).fill = blackFill;
  ws.getCell(`AA${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`AA${row}`).numFmt = '"R$" #,##0.00';

  row += 2;
  ws.mergeCells(`A${row}:AB${row}`);
  ws.getCell(`A${row}`).value = "Torres Vigilância Patrimonial — CNPJ: 36.982.392/0001-89";
  ws.getCell(`A${row}`).font = { name: "Arial", size: 8, italic: true, color: { argb: "FF999999" } };
  ws.getCell(`A${row}`).alignment = { horizontal: "center" };

  row++;
  ws.mergeCells(`A${row}:AB${row}`);
  ws.getCell(`A${row}`).value = "Av. Raimundo Pereira de Magalhães, 5720 — Pirituba — São Paulo/SP — CEP 02938-000 — (11) 3436-4406";
  ws.getCell(`A${row}`).font = { name: "Arial", size: 8, italic: true, color: { argb: "FF999999" } };
  ws.getCell(`A${row}`).alignment = { horizontal: "center" };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function sendBoletimEmail(xlsxBuffer: Buffer): Promise<void> {
  const transporter = createSmtpTransporter();
  if (!transporter) throw new Error("SMTP não configurado");

  const from = getSmtpFrom();
  const to = "mariaeduarda.nogueira@omegasolutions.com.br";
  const cc = "gr.transportes@omegasolutions.com.br";
  const bcc = "thiago@grupotmseg.com.br, financeiro@torresseguranca.com.br";

  await transporter.sendMail({
    from,
    to,
    cc,
    bcc,
    subject: "Boletim de Medição — Abril/2026 — Torres Vigilância Patrimonial",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #1a1a1a;">Boletim de Medição — Abril/2026</h2>
        <p>Prezada Maria Eduarda,</p>
        <p>Segue em anexo o <strong>Boletim de Medição</strong> referente ao mês de <strong>Abril/2026</strong>, 
        relativo ao serviço de escolta armada prestado à <strong>OMEGA SOLUTIONS TRANSPORTES LTDA</strong>.</p>
        <p><strong>Resumo:</strong></p>
        <ul>
          <li>OS: TOR-0039</li>
          <li>Rota: Aeroporto de Guarulhos (GRU) → Omega Solutions Transportes</li>
          <li>Data: 30/04/2026</li>
          <li>Valor Total: <strong>R$ 340,00</strong></li>
        </ul>
        <p>Qualquer dúvida, estamos à disposição.</p>
        <br>
        <p style="font-size: 12px; color: #666;">
          <strong>Torres Vigilância Patrimonial</strong><br>
          CNPJ: 36.982.392/0001-89<br>
          (11) 3436-4406<br>
          escolta@torresseguranca.com.br
        </p>
      </div>
    `,
    attachments: [{
      filename: "Boletim_Medicao_OMEGA_SOLUTIONS_Abril_2026.xlsx",
      content: xlsxBuffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });
}
