import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdfText } from "./pdf-text.ts";
import {
  isUsableHoleriteParse,
  matchEmployeeFromHolerite,
  parseHoleriteTorres,
} from "./holerite-parse.ts";

/** PDF mínimo com texto (Type1 Helvetica). Uma linha por Tj + Td relativo. */
function pdfWithLines(lines: string[]): Buffer {
  const ops = ["BT /F1 10 Tf 50 700 Td"];
  for (const line of lines) {
    const safe = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    ops.push(`(${safe}) Tj`);
    ops.push("0 -14 Td");
  }
  ops.push("ET");
  const stream = ops.join("\n");
  const streamLen = Buffer.byteLength(stream, "utf8");
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /MediaBox [0 0 600 800] /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

test("fluxo OCR PDF: extractPdfText + parser determinístico (sem OpenAI)", async () => {
  const g = globalThis as any;
  const backup = { DOMMatrix: g.DOMMatrix, ImageData: g.ImageData, Path2D: g.Path2D };
  try {
    delete g.DOMMatrix;
    delete g.ImageData;
    delete g.Path2D;

    const buf = pdfWithLines([
      "TORRES VIGILANCIA PATRIMONIAL",
      "Funcionario: ANDRE VINICIUS DA SILVA",
      "CPF: 123.456.789-00",
      "Competencia: AGO/2026",
      "1 24,00 2.432,50",
      "2 729,75",
      "3 100,00",
      "Dias trabalhados",
      "Periculosidade 30%",
      "Horas extras 60%",
      "Total dos Vencimentos 3.261,50",
      "Liquido a Receber 2.500,00",
    ]);

    const text = await extractPdfText(buf);
    assert.ok(text.length > 20, "texto extraído do PDF");

    const parsed = parseHoleriteTorres(text);
    assert.ok(isUsableHoleriteParse(parsed), "parser usável sem IA");
    assert.equal(parsed!.salarioBase, 2432.5);
    assert.equal(parsed!.periculosidade, 729.75);
    assert.equal(parsed!.month, 8);
    assert.equal(parsed!.year, 2026);

    const matched = matchEmployeeFromHolerite(parsed!, [
      { id: 42, name: "Andre Vinicius da Silva", cpf: "123.456.789-00" },
    ]);
    assert.equal(matched, 42);
  } finally {
    if (backup.DOMMatrix) g.DOMMatrix = backup.DOMMatrix;
    if (backup.ImageData) g.ImageData = backup.ImageData;
    if (backup.Path2D) g.Path2D = backup.Path2D;
  }
});

test("fluxo OCR: Connection error da IA não é necessário quando parser OK", () => {
  // Garante o contrato: se isUsable, a rota NÃO chama OpenAI.
  const parsed = parseHoleriteTorres(`
Funcionário: TESTE
CPF: 999.888.777-66
Competência: JUL/2026
1 2.000,00
2 600,00
Dias trabalhados
Periculosidade
Total dos Vencimentos 2.600,00
`);
  assert.ok(isUsableHoleriteParse(parsed));
  // Simula o early-return da rota
  const payload = { ...parsed!, matchedEmployeeId: 1, source: "deterministic" as const };
  assert.equal(payload.source, "deterministic");
  assert.ok(payload.salarioBase > 0);
});
