import ExcelJS from "exceljs";
import fs from "fs";

async function main() {
  console.log("[boletim-omega] Gerando planilha SEM TRAVAS...");

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
    properties: {
      defaultColWidth: 12,
      showGridLines: true,
    },
  });

  (ws as any).sheetProtection = null;

  ws.columns = [
    { width: 11 }, { width: 55 }, { width: 13 }, { width: 11 },
    { width: 13 }, { width: 11 }, { width: 13 }, { width: 13 },
    { width: 11 }, { width: 13 }, { width: 12 }, { width: 14 },
    { width: 13 }, { width: 11 }, { width: 10 }, { width: 11 },
    { width: 11 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 11 }, { width: 11 }, { width: 13 }, { width: 11 },
  ];

  const black = "FF1B1B1B";
  const white = "FFFFFFFF";
  const red = "FFFF4444";
  const headerFont: Partial<ExcelJS.Font> = { name: "Arial", size: 8, bold: true, color: { argb: white } };
  const dataFont: Partial<ExcelJS.Font> = { name: "Arial", size: 8, color: { argb: "FF333333" } };
  const blackFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: black } };
  const grayFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8F8" } };
  const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCCCCCC" } };
  const borders: Partial<ExcelJS.Borders> = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const unlocked: Partial<ExcelJS.Protection> = { locked: false };

  function setCell(cell: ExcelJS.Cell, value: any, font: Partial<ExcelJS.Font>, fill?: ExcelJS.FillPattern, align?: Partial<ExcelJS.Alignment>, border?: Partial<ExcelJS.Borders>) {
    cell.value = value;
    cell.font = font;
    if (fill) cell.fill = fill;
    if (align) cell.alignment = align;
    if (border) cell.border = border;
    cell.protection = unlocked;
  }

  let r = 1;

  ws.mergeCells(`A${r}:AB${r}`);
  ws.getRow(r).height = 36;
  setCell(ws.getCell(`A${r}`),
    "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL",
    { name: "Arial", size: 14, bold: true, color: { argb: white } },
    blackFill,
    { horizontal: "center", vertical: "middle" }
  );

  r++;
  ws.mergeCells(`A${r}:AB${r}`);
  ws.getRow(r).height = 20;
  setCell(ws.getCell(`A${r}`),
    "GERAL — ABRIL/2026 — MÊS COMPLETO",
    { name: "Arial", size: 10, bold: true, color: { argb: white } },
    blackFill,
    { horizontal: "center", vertical: "middle" }
  );

  r++;
  ws.mergeCells(`A${r}:AB${r}`);
  ws.getRow(r).height = 18;
  setCell(ws.getCell(`A${r}`),
    "REFERENTE AO SERVIÇO DE ESCOLTA ARMADA - OMEGA SOLUTIONS TRANSPORTES LTDA",
    { name: "Arial", size: 9, bold: true, color: { argb: red } },
    blackFill,
    { horizontal: "center", vertical: "middle" }
  );

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
    setCell(ws.getCell(`${g.start}${r}`), g.label, headerFont, blackFill, { horizontal: "center", vertical: "middle" });
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
    setCell(cell, h,
      { name: "Arial", size: 7, bold: true, color: { argb: white } },
      blackFill,
      { horizontal: "center", vertical: "middle", wrapText: true },
      borders
    );
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
    cell.protection = unlocked;
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
  setCell(ws.getCell(`A${r}`), "TOTAL",
    { name: "Arial", size: 12, bold: true, color: { argb: white } },
    blackFill,
    { horizontal: "right", vertical: "middle" }
  );

  ws.mergeCells(`AA${r}:AB${r}`);
  const totVal = ws.getCell(`AA${r}`);
  totVal.value = 340.00;
  totVal.font = { name: "Arial", size: 13, bold: true, color: { argb: white } };
  totVal.fill = blackFill;
  totVal.alignment = { horizontal: "center", vertical: "middle" };
  totVal.numFmt = '"R$" #,##0.00';
  totVal.protection = unlocked;

  r += 2;
  ws.mergeCells(`A${r}:AB${r}`);
  setCell(ws.getCell(`A${r}`),
    "Torres Vigilância Patrimonial — CNPJ: 36.982.392/0001-89",
    { name: "Arial", size: 8, italic: true, color: { argb: "FF999999" } },
    undefined,
    { horizontal: "center" }
  );

  r++;
  ws.mergeCells(`A${r}:AB${r}`);
  setCell(ws.getCell(`A${r}`),
    "Av. Raimundo Pereira de Magalhães, 5720 — Pirituba — São Paulo/SP — CEP 02938-000 — (11) 3436-4406",
    { name: "Arial", size: 8, italic: true, color: { argb: "FF999999" } },
    undefined,
    { horizontal: "center" }
  );

  for (let row = 1; row <= r + 5; row++) {
    const rowObj = ws.getRow(row);
    for (let col = 1; col <= 28; col++) {
      const cell = rowObj.getCell(col);
      cell.protection = { locked: false };
    }
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const filePath = "/home/runner/workspace/Boletim_Medicao_OMEGA_SOLUTIONS_Abril_2026.xlsx";
  fs.writeFileSync(filePath, buffer);
  console.log(`[boletim-omega] Planilha gerada SEM TRAVAS: ${filePath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log("[boletim-omega] Arquivo disponível para download.");
}

main().catch(err => {
  console.error("[boletim-omega] ERRO:", err.message);
  process.exit(1);
});
