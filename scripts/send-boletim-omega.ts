import ExcelJS from "exceljs";
import nodemailer from "nodemailer";

async function main() {
  console.log("[boletim-omega] Gerando planilha sem travas...");
  
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
  });

  const black = "FF1B1B1B";
  const white = "FFFFFFFF";
  const red = "FFFF4444";
  const headerFont: Partial<ExcelJS.Font> = { name: "Arial", size: 8, bold: true, color: { argb: white } };
  const dataFont: Partial<ExcelJS.Font> = { name: "Arial", size: 8, color: { argb: "FF333333" } };
  const blackFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: black } };
  const grayFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8F8" } };
  const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCCCCCC" } };
  const borders: Partial<ExcelJS.Borders> = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  ws.columns = [
    { width: 11 }, { width: 55 }, { width: 13 }, { width: 11 },
    { width: 13 }, { width: 11 }, { width: 13 }, { width: 13 },
    { width: 11 }, { width: 13 }, { width: 12 }, { width: 14 },
    { width: 13 }, { width: 11 }, { width: 10 }, { width: 11 },
    { width: 11 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 11 }, { width: 11 }, { width: 13 }, { width: 11 },
  ];

  let r = 1;

  ws.mergeCells(`A${r}:AB${r}`);
  ws.getRow(r).height = 36;
  const c1 = ws.getCell(`A${r}`);
  c1.value = "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL";
  c1.font = { name: "Arial", size: 14, bold: true, color: { argb: white } };
  c1.fill = blackFill;
  c1.alignment = { horizontal: "center", vertical: "middle" };

  r++;
  ws.mergeCells(`A${r}:AB${r}`);
  ws.getRow(r).height = 20;
  const c2 = ws.getCell(`A${r}`);
  c2.value = "GERAL — ABRIL/2026 — MÊS COMPLETO";
  c2.font = { name: "Arial", size: 10, bold: true, color: { argb: white } };
  c2.fill = blackFill;
  c2.alignment = { horizontal: "center", vertical: "middle" };

  r++;
  ws.mergeCells(`A${r}:AB${r}`);
  ws.getRow(r).height = 18;
  const c3 = ws.getCell(`A${r}`);
  c3.value = "REFERENTE AO SERVIÇO DE ESCOLTA ARMADA - OMEGA SOLUTIONS TRANSPORTES LTDA";
  c3.font = { name: "Arial", size: 9, bold: true, color: { argb: red } };
  c3.fill = blackFill;
  c3.alignment = { horizontal: "center", vertical: "middle" };

  r++;
  ws.getRow(r).height = 4;

  r++;
  const groupHeaders = [
    { start: "A", end: "G", label: "TABELA ACORDADA" },
    { start: "H", end: "Q", label: "INFORMAÇÕES DA VIAGEM" },
    { start: "R", end: "T", label: "QUILOMETRAGEM" },
    { start: "U", end: "V", label: "HORÁRIO" },
    { start: "W", end: "Z", label: "KM EXCEDENTE" },
    { start: "AA", end: "AB", label: "HORA EXCEDENTE / VALORES" },
  ];
  ws.getRow(r).height = 22;
  for (const g of groupHeaders) {
    ws.mergeCells(`${g.start}${r}:${g.end}${r}`);
    const cell = ws.getCell(`${g.start}${r}`);
    cell.value = g.label;
    cell.font = headerFont;
    cell.fill = blackFill;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  r++;
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

  ws.getRow(r).height = 26;
  subHeaders.forEach((h, i) => {
    const cell = ws.getRow(r).getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Arial", size: 7, bold: true, color: { argb: white } };
    cell.fill = blackFill;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = borders;
  });

  r++;
  ws.getRow(r).height = 22;
  const vals: (string | number)[] = [
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

  vals.forEach((v, i) => {
    const cell = ws.getRow(r).getCell(i + 1);
    cell.value = v;
    cell.font = dataFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borders;
    if (i % 2 === 0) cell.fill = grayFill;
    if (typeof v === "number" && [2, 4, 6, 26].includes(i)) {
      cell.numFmt = '#,##0.00';
    }
  });

  r++;
  ws.getRow(r).height = 4;

  r++;
  ws.getRow(r).height = 28;
  ws.mergeCells(`A${r}:Z${r}`);
  const totLabel = ws.getCell(`A${r}`);
  totLabel.value = "TOTAL";
  totLabel.font = { name: "Arial", size: 12, bold: true, color: { argb: white } };
  totLabel.fill = blackFill;
  totLabel.alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells(`AA${r}:AB${r}`);
  const totVal = ws.getCell(`AA${r}`);
  totVal.value = 340.00;
  totVal.font = { name: "Arial", size: 13, bold: true, color: { argb: white } };
  totVal.fill = blackFill;
  totVal.alignment = { horizontal: "center", vertical: "middle" };
  totVal.numFmt = '"R$" #,##0.00';

  r += 2;
  ws.mergeCells(`A${r}:AB${r}`);
  ws.getCell(`A${r}`).value = "Torres Vigilância Patrimonial — CNPJ: 36.982.392/0001-89";
  ws.getCell(`A${r}`).font = { name: "Arial", size: 8, italic: true, color: { argb: "FF999999" } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };

  r++;
  ws.mergeCells(`A${r}:AB${r}`);
  ws.getCell(`A${r}`).value = "Av. Raimundo Pereira de Magalhães, 5720 — Pirituba — São Paulo/SP — CEP 02938-000 — (11) 3436-4406";
  ws.getCell(`A${r}`).font = { name: "Arial", size: 8, italic: true, color: { argb: "FF999999" } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const filePath = "/tmp/Boletim_Medicao_OMEGA_SOLUTIONS_Abril_2026.xlsx";
  const fs = await import("fs");
  fs.writeFileSync(filePath, buffer);
  console.log(`[boletim-omega] Planilha gerada: ${filePath} (${(buffer.length / 1024).toFixed(1)} KB)`);

  console.log("[boletim-omega] Enviando por e-mail...");

  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: "escolta@torresseguranca.com.br",
      pass: process.env.SMTP_PASS,
    },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: '"Torres Vigilância Patrimonial" <escolta@torresseguranca.com.br>',
    to: "mariaeduarda.nogueira@omegasolutions.com.br",
    cc: "gr.transportes@omegasolutions.com.br",
    bcc: "thiago@grupotmseg.com.br, financeiro@torresseguranca.com.br",
    subject: "Boletim de Medição — Abril/2026 — Torres Vigilância Patrimonial",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
        <div style="background: #1a1a1a; padding: 20px; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 18px;">Torres Vigilância Patrimonial</h1>
          <p style="color: #aaa; margin: 5px 0 0; font-size: 12px;">Boletim de Medição — Abril/2026</p>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <p>Prezada <strong>Maria Eduarda</strong>,</p>
          <p>Segue em anexo o <strong>Boletim de Medição</strong> referente ao mês de <strong>Abril/2026</strong>, 
          relativo ao serviço de escolta armada prestado à <strong>OMEGA SOLUTIONS TRANSPORTES LTDA</strong>.</p>
          
          <div style="background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <h3 style="margin: 0 0 10px; color: #1a1a1a; font-size: 14px;">Resumo:</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 4px 0; color: #666;">OS:</td><td style="font-weight: bold;">TOR-0039</td></tr>
              <tr><td style="padding: 4px 0; color: #666;">Rota:</td><td>Aeroporto de Guarulhos (GRU) → Omega Solutions</td></tr>
              <tr><td style="padding: 4px 0; color: #666;">Data:</td><td>30/04/2026</td></tr>
              <tr><td style="padding: 4px 0; color: #666;">Valor Total:</td><td style="font-weight: bold; font-size: 16px; color: #1a1a1a;">R$ 340,00</td></tr>
            </table>
          </div>
          
          <p style="font-size: 13px; color: #666;">A planilha em anexo está <strong>sem travas/bloqueios</strong>, podendo ser editada livremente.</p>
          <p>Qualquer dúvida, estamos à disposição.</p>
        </div>
        <div style="background: #1a1a1a; padding: 15px; text-align: center;">
          <p style="color: #aaa; margin: 0; font-size: 11px;">
            <strong style="color: #fff;">Torres Vigilância Patrimonial</strong><br>
            CNPJ: 36.982.392/0001-89 | (11) 3436-4406<br>
            escolta@torresseguranca.com.br
          </p>
        </div>
      </div>
    `,
    attachments: [{
      filename: "Boletim_Medicao_OMEGA_SOLUTIONS_Abril_2026.xlsx",
      content: buffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });

  console.log("[boletim-omega] ✓ E-mail enviado com sucesso!");
  console.log("  → Para: mariaeduarda.nogueira@omegasolutions.com.br");
  console.log("  → CC: gr.transportes@omegasolutions.com.br");
  console.log("  → BCC: thiago@grupotmseg.com.br, financeiro@torresseguranca.com.br");
}

main().catch(err => {
  console.error("[boletim-omega] ERRO:", err.message);
  process.exit(1);
});
