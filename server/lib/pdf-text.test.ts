import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdfText } from "./pdf-text.ts";

function minimalPdfWithText(text: string): Buffer {
  // PDF mínimo com um stream de texto Type1 Helvetica
  const stream = `BT /F1 24 Tf 50 100 Td (${text}) Tj ET`;
  const streamLen = Buffer.byteLength(stream, "utf8");
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /MediaBox [0 0 300 144] /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
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

test("extractPdfText: lê texto sem explodir com DOMMatrix", async () => {
  // Simula serverless sem globals de browser
  const g = globalThis as any;
  const backup = {
    DOMMatrix: g.DOMMatrix,
    ImageData: g.ImageData,
    Path2D: g.Path2D,
  };
  try {
    delete g.DOMMatrix;
    delete g.ImageData;
    delete g.Path2D;
    assert.equal(typeof g.DOMMatrix, "undefined");

    const text = await extractPdfText(minimalPdfWithText("Holerite OCR OK"));
    assert.match(text, /Holerite OCR OK/);
  } finally {
    if (backup.DOMMatrix) g.DOMMatrix = backup.DOMMatrix;
    if (backup.ImageData) g.ImageData = backup.ImageData;
    if (backup.Path2D) g.Path2D = backup.Path2D;
  }
});
