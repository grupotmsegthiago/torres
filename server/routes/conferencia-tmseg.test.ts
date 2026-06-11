import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { findHeaderRow, extractCity } from "./conferencia-tmseg";

// Letra de coluna (A=1) -> índice 1-based usado pelo exceljs/findHeaderRow.
function col(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function wsFromHeader(headers: string[]): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("x");
  // grava célula a célula (getCell é 1-based): headers[0] -> coluna A.
  headers.forEach((h, i) => { ws.getRow(1).getCell(i + 1).value = h; });
  return ws;
}

// Layout TORRES (fornecedor): K=placa, O/P/Q = km ini/fim/total, AA=pedágio,
// AB=valor final. Há 5 colunas "TOTAL" (Q,T,W,Z,AB) — o parser tem de pegar a
// ÚLTIMA como valor final e a 1ª após KM FINAL como km total.
const TORRES_HEADER = [
  "Nº", "STATUS", "ROTA", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA", "KM EXTRA",
  "DATA INÍCIO", "HORA INÍCIO", "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM",
  "INICIAL", "FINAL", "TOTAL", "INICIAL", "FINAL", "TOTAL", "KM", "VALOR", "TOTAL",
  "HORA", "VALOR", "TOTAL", "PEDÁGIO", "TOTAL",
];

// Layout do sistema (boletim gerado pelo Torres): J=placa, N/O/P = km, Z=pedágio,
// AA=total. Só existe UMA coluna "TOTAL" (AA), então a correção "última total"
// não pode alterar nada aqui.
const SISTEMA_HEADER = [
  "Nº", "ROTA", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA R$", "KM EXTRA R$",
  "DATA INÍCIO", "HORA INÍCIO", "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM",
  "KM INICIAL", "KM FINAL", "KM TOTAL", "HR INÍCIO", "HR FIM", "HR TOTAL", "KM EXC.",
  "VLR KM", "TOT KM", "HR EXC.", "VLR HR", "TOT HR", "PEDÁGIO", "TOTAL",
];

test("findHeaderRow: layout TORRES mapeia km total (Q) e valor final (AB) sem confundir os 5 'TOTAL'", () => {
  const h = findHeaderRow(wsFromHeader(TORRES_HEADER));
  assert.ok(h, "cabeçalho TORRES deveria ser detectado");
  const { cols } = h!;
  assert.equal(cols.viatura, col("K"), "placa/viatura = coluna K");
  assert.equal(cols.kmInicial, col("O"), "km inicial = coluna O");
  assert.equal(cols.kmFinal, col("P"), "km final = coluna P");
  assert.equal(cols.kmTotal, col("Q"), "km total = 1ª 'total' após km final (Q)");
  assert.equal(cols.pedagio, col("AA"), "pedágio = coluna AA");
  assert.equal(cols.total, col("AB"), "valor final = ÚLTIMA 'total' (AB), não a km total");
});

test("findHeaderRow: layout do sistema permanece intacto (única 'TOTAL' = AA)", () => {
  const h = findHeaderRow(wsFromHeader(SISTEMA_HEADER));
  assert.ok(h, "cabeçalho do sistema deveria ser detectado");
  const { cols } = h!;
  assert.equal(cols.viatura, col("J"), "placa/viatura = coluna J");
  assert.equal(cols.kmInicial, col("N"), "km inicial = coluna N");
  assert.equal(cols.kmFinal, col("O"), "km final = coluna O");
  assert.equal(cols.kmTotal, col("P"), "km total = coluna P (header explícito 'km total')");
  assert.equal(cols.pedagio, col("Z"), "pedágio = coluna Z");
  assert.equal(cols.total, col("AA"), "valor final = AA (last === first, sem efeito colateral)");
});

// ---------------------------------------------------------------------------
// extractCity — puxa a CIDADE do endereço completo (Origem × Destino na
// Conferência TM SEG). Antes devolvia o 1º trecho (nome do local/empresa).
// ---------------------------------------------------------------------------
test("extractCity extrai a cidade real de endereços completos BR", () => {
  const cases: [string, string][] = [
    ["Mineração Taboca - Pirapora - Estr. dos Romeiros, 49 - Jardim Bom Jesus, Pirapora do Bom Jesus - SP, 06550-000, Brasil", "PIRAPORA DO BOM JESUS"],
    ["Brasil Terminal Portuário - Avenida Engenheiro Augusto Barata - Alemoa, Santos - SP, Brasil", "SANTOS"],
    ["Praça Yara Santini, 1223 - Vicente de Carvalho, Guarujá - SP, Brasil", "GUARUJÁ"],
    ["Av. Francisco Roveri, 1413 - Jardim Novo Horizonte, Jundiaí - SP, Brasil", "JUNDIAÍ"],
    ["BTP - Brasil Terminal Portuário - Av. Engenheiro Augusto Barata, s/n - Porto Alemoa, Santos - SP, 11.095-650", "SANTOS"],
    ["Guarulhos, SP, Brasil", "GUARULHOS"],
    ["CEVA Logistics - Avenida Francisco Roveri - Parque Residencial Almerinda Chaves, Jundiaí - SP, Brasil", "JUNDIAÍ"],
    ["Brasília - DF, Brasil", "BRASÍLIA"],
  ];
  for (const [addr, expected] of cases) {
    assert.equal(extractCity(addr), expected, `falhou para: ${addr}`);
  }
});

test("extractCity: variantes CIDADE/UF e delimitadores atípicos", () => {
  assert.equal(extractCity("Santos/SP"), "SANTOS");
  assert.equal(extractCity("São Paulo / SP"), "SÃO PAULO");
  assert.equal(extractCity("Rio de Janeiro-RJ"), "RIO DE JANEIRO");
});

test("extractCity tem fallback sem UF reconhecida e trata vazio", () => {
  assert.equal(extractCity(""), "");
  assert.equal(extractCity("200 KM SENT. SERRA - ES"), "200 KM SENT. SERRA");
  assert.equal(extractCity("PIRAPORA"), "PIRAPORA");
});
