import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { findHeaderRow, extractCity, matchRows } from "./conferencia-tmseg";

// ---- helpers p/ montar linhas do matching em camadas ----
function ext(o: Partial<any> & { linha: number }): any {
  return {
    numero: "", rota: "", rotaCidades: "", data: null, placa: "", placaRaw: "",
    escoltado: "", kmInicial: 0, kmFinal: 0, kmTotal: 0, kmFranq: 0, hrFranq: "",
    pedagio: 0, total: 0, ...o,
  };
}
function sys(o: Partial<any> & { billingId: number }): any {
  return {
    serviceOrderId: o.billingId, osNumber: `TOR-${o.billingId}`, data: null, placa: "",
    placaRaw: "", rotaCidades: "", origem: "", destino: "", kmInicial: 0, kmFinal: 0,
    kmTotal: 0, kmFranq: 0, hrFranqHoras: 0, pedagio: 0, total: 0, status: "APROVADA",
    revenueValue: 0, custoFornecedor: 0, matched: false, ...o,
  };
}

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

// ===========================================================================
// matchRows — matching em CAMADAS (Camada 1 = KM, Camada 2 = ROTA)
// ===========================================================================
const PERIOD = ["2026-05-01", "2026-05-31"] as const;

test("Camada 1: casa por DATA+PLACA+KM (confiança alta), KM tem prioridade", () => {
  const extRows = [ext({ linha: 1, data: "2026-05-18", placa: "UDE1G87", placaRaw: "UDE-1G87",
    rotaCidades: "JUNDIAÍ×CAMPINAS", kmInicial: 562, kmFinal: 1901, kmTotal: 1339, total: 12579.27 })];
  const sysRows = [
    sys({ billingId: 100, data: "2026-05-18", placa: "UDE1G87", placaRaw: "UDE-1G87",
      rotaCidades: "JUNDIAÍ×CAMPINAS", kmInicial: 562, kmFinal: 1901, kmTotal: 1339, total: 12579.27 }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 1);
  assert.equal(r.matchedRows[0].matchType, "km");
  assert.equal(r.matchedRows[0].matchConfidence, "alta");
  assert.equal(r.matchedRows[0].hasDivergence, false);
  assert.equal(r.missingInSystem.length, 0);
  assert.equal(r.missingInSheet.length, 0);
});

test("Camada 2: KM zerado no sistema → casa por DATA+PLACA+ROTA e EXIBE divergência de valor", () => {
  // cenário real 5254: GUARULHOS×BRASÍLIA, planilha 7907.81 × sistema 7613.17 (km não bate)
  const extRows = [ext({ linha: 1, data: "2026-05-27", placa: "UER7D08", placaRaw: "UER7D08",
    rotaCidades: "GUARULHOS×BRASÍLIA", kmInicial: 0, kmFinal: 0, kmTotal: 0, total: 7907.81 })];
  const sysRows = [
    sys({ billingId: 200, data: "2026-05-27", placa: "UER7D08", placaRaw: "UER7D08",
      rotaCidades: "GUARULHOS×BRASÍLIA", kmInicial: 21922, kmFinal: 21922, kmTotal: 0,
      total: 7613.17, status: "A_VERIFICAR" }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 1);
  assert.equal(r.matchedRows[0].matchType, "rota");
  assert.equal(r.matchedRows[0].matchConfidence, "média");
  assert.equal(r.matchedRows[0].hasDivergence, true, "diferença de R$294 deve aparecer como divergência");
  assert.equal(r.missingInSystem.length, 0);
  assert.equal(r.missingInSheet.length, 0);
});

test("Camada 2: rotas diferentes NÃO casam (fica fora do sistema)", () => {
  const extRows = [ext({ linha: 1, data: "2026-05-20", placa: "UER7D08", placaRaw: "UER7D08",
    rotaCidades: "FLORIANÓPOLIS×FLORIANÓPOLIS", total: 489.17 })];
  const sysRows = [
    sys({ billingId: 300, data: "2026-05-20", placa: "UER7D08", placaRaw: "UER7D08",
      rotaCidades: "SANTOS×SÃO PAULO", kmInicial: 100, kmFinal: 200, total: 489.17 }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 0);
  assert.equal(r.missingInSystem.length, 1);
  assert.equal(r.missingInSheet.length, 1, "a OS do sistema não casada deve aparecer em 'fora da planilha'");
});

test("Sem placa (cancelada) NÃO casa nas Camadas 1+2 — continua fora do sistema", () => {
  const extRows = [ext({ linha: 1, data: "2026-05-19", placa: "", placaRaw: "",
    rotaCidades: "BARUERI×BARUERI", total: 480 })];
  const sysRows = [
    sys({ billingId: 400, data: "2026-05-19", placa: "", placaRaw: "",
      rotaCidades: "BARUERI×BARUERI", kmInicial: 0, kmFinal: 0, total: 480, status: "CANCELADO" }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 0, "sem placa não casa (Camada 3 não foi habilitada)");
  assert.equal(r.missingInSystem.length, 1);
});

test("KM tem prioridade global: roda antes da rota e reserva a OS certa", () => {
  // duas OS mesma placa/data/rota; só uma tem KM batendo com a planilha.
  const extRows = [
    ext({ linha: 1, data: "2026-05-26", placa: "UGU6E48", placaRaw: "UGU6E48",
      rotaCidades: "GUARULHOS×GUARULHOS", kmInicial: 23770, kmFinal: 23775, kmTotal: 5, total: 491 }),
    ext({ linha: 2, data: "2026-05-26", placa: "UGU6E48", placaRaw: "UGU6E48",
      rotaCidades: "GUARULHOS×GUARULHOS", kmInicial: 0, kmFinal: 0, kmTotal: 0, total: 676.17 }),
  ];
  const sysRows = [
    sys({ billingId: 500, data: "2026-05-26", placa: "UGU6E48", placaRaw: "UGU6E48",
      rotaCidades: "GUARULHOS×GUARULHOS", kmInicial: 23773, kmFinal: 23773, kmTotal: 0, total: 491 }),
    sys({ billingId: 501, data: "2026-05-26", placa: "UGU6E48", placaRaw: "UGU6E48",
      rotaCidades: "GUARULHOS×GUARULHOS", kmInicial: 0, kmFinal: 0, kmTotal: 0, total: 676.17 }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 2);
  const byExtTotal = Object.fromEntries(r.matchedRows.map((m: any) => [m.fields.total.ext, m]));
  // a linha com KM (491) casa por KM; a outra (676.17) sobra p/ rota
  assert.equal(byExtTotal[491].matchType, "km");
  assert.equal(byExtTotal[491].osNumber, "TOR-500");
  assert.equal(byExtTotal[676.17].matchType, "rota");
  assert.equal(byExtTotal[676.17].osNumber, "TOR-501");
});

test("Camada 2: entre 2 candidatos de mesma rota, desempata pelo TOTAL mais próximo", () => {
  const extRows = [ext({ linha: 1, data: "2026-05-26", placa: "UGL7E48", placaRaw: "UGL7E48",
    rotaCidades: "PIRAPORA DO BOM JESUS×GUARULHOS", total: 874.97 })];
  const sysRows = [
    sys({ billingId: 600, data: "2026-05-26", placa: "UGL7E48", placaRaw: "UGL7E48",
      rotaCidades: "PIRAPORA DO BOM JESUS×GUARULHOS", kmInicial: 0, kmFinal: 0, total: 480 }),
    sys({ billingId: 601, data: "2026-05-26", placa: "UGL7E48", placaRaw: "UGL7E48",
      rotaCidades: "PIRAPORA DO BOM JESUS×GUARULHOS", kmInicial: 0, kmFinal: 0, total: 865 }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 1);
  assert.equal(r.matchedRows[0].osNumber, "TOR-601", "865 é mais perto de 874.97 que 480");
  assert.equal(r.matchedRows[0].matchType, "rota");
});

test("Fallback ±1 dia continua valendo na Camada 2 (missão que vira a noite)", () => {
  const extRows = [ext({ linha: 1, data: "2026-05-30", placa: "UGL7E48", placaRaw: "UGL7E48",
    rotaCidades: "JUNDIAÍ×EMBU DAS ARTES", total: 703.83 })];
  const sysRows = [
    sys({ billingId: 700, data: "2026-05-29", placa: "UGL7E48", placaRaw: "UGL7E48",
      rotaCidades: "JUNDIAÍ×EMBU DAS ARTES", kmInicial: 0, kmFinal: 0, total: 704.4 }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 1);
  assert.equal(r.matchedRows[0].matchType, "rota");
});

test("Camada 2 NÃO dispara quando KM existe nos 2 lados e diverge (>5km) — fica fora do sistema", () => {
  // KM disponível e divergente => provável missão diferente; não forçar por rota.
  const extRows = [ext({ linha: 1, data: "2026-05-22", placa: "UGU6E48", placaRaw: "UGU6E48",
    rotaCidades: "SANTOS×SÃO PAULO", kmInicial: 1000, kmFinal: 1100, kmTotal: 100, total: 880 })];
  const sysRows = [
    sys({ billingId: 800, data: "2026-05-22", placa: "UGU6E48", placaRaw: "UGU6E48",
      rotaCidades: "SANTOS×SÃO PAULO", kmInicial: 5000, kmFinal: 5200, kmTotal: 200, total: 881.1,
      status: "A_VERIFICAR" }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 0, "KM comparável e divergente não deve casar por rota");
  assert.equal(r.missingInSystem.length, 1);
  assert.equal(r.missingInSheet.length, 1);
});

test("Camada 2: dispara quando KM falta só de um lado (planilha sem odômetro)", () => {
  const extRows = [ext({ linha: 1, data: "2026-05-22", placa: "UGU6E48", placaRaw: "UGU6E48",
    rotaCidades: "SANTOS×SÃO PAULO", kmInicial: 0, kmFinal: 0, total: 880 })];
  const sysRows = [
    sys({ billingId: 810, data: "2026-05-22", placa: "UGU6E48", placaRaw: "UGU6E48",
      rotaCidades: "SANTOS×SÃO PAULO", kmInicial: 5000, kmFinal: 5200, total: 881.1,
      status: "A_VERIFICAR" }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 1);
  assert.equal(r.matchedRows[0].matchType, "rota");
});

test("routeMatches por par: NÃO casa quando só uma metade coincide (anti-substring)", () => {
  // sem KM nos 2 lados (Camada 2 elegível); rotas com 'GUARULHOS' em metades trocadas.
  const extRows = [ext({ linha: 1, data: "2026-05-26", placa: "UGU6E48", placaRaw: "UGU6E48",
    rotaCidades: "SANTOS×GUARULHOS", total: 700 })];
  const sysRows = [
    sys({ billingId: 820, data: "2026-05-26", placa: "UGU6E48", placaRaw: "UGU6E48",
      rotaCidades: "GUARULHOS×CONTAGEM", kmInicial: 0, kmFinal: 0, total: 700, status: "A_VERIFICAR" }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 0, "origem≠origem e destino≠destino não pode casar");
  assert.equal(r.missingInSystem.length, 1);
});

test("routeMatches por par: casa com containment dentro da metade (EMBU ⊆ EMBU DAS ARTES)", () => {
  const extRows = [ext({ linha: 1, data: "2026-05-30", placa: "UGL7E48", placaRaw: "UGL7E48",
    rotaCidades: "JUNDIAÍ×EMBU", total: 703.83 })];
  const sysRows = [
    sys({ billingId: 830, data: "2026-05-30", placa: "UGL7E48", placaRaw: "UGL7E48",
      rotaCidades: "JUNDIAÍ×EMBU DAS ARTES", kmInicial: 0, kmFinal: 0, total: 704.4, status: "A_VERIFICAR" }),
  ];
  const r = matchRows(extRows, sysRows, PERIOD[0], PERIOD[1]);
  assert.equal(r.matchedRows.length, 1);
  assert.equal(r.matchedRows[0].matchType, "rota");
});
