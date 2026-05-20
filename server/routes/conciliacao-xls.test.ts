import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTicketLogXls, detectTicketLogFileKind } from "./conciliacao";

const XLS_PATH = "attached_assets/RFCVTITULO_263076_20260520_121847_(1)_1779312349172.XLS";

test("parseTicketLogXls: parseia o export RFCVTITULO da TicketLog", () => {
  const buf = readFileSync(XLS_PATH);
  const rows = parseTicketLogXls(buf);

  assert.ok(rows.length >= 40, `esperava >= 40 transações, veio ${rows.length}`);

  // Primeira linha de dados conhecida (linha 1 do XLS):
  //   "6035740454382232","UGU6E48",...,"4/30/26 1:41","1071116921","COMPRA",
  //   "GABRIEL APARECIDO DE MELO SOUZA",...,"POSTO CARRETEIRO 2",
  //   "GUARULHOS - SP","11151",...,"ETANOL","61.09",...,"15.31",...
  const first = rows[0];
  assert.equal(first.code, "1071116921");
  assert.equal(first.plate, "UGU6E48");
  assert.equal(first.date, "30/04/2026");
  assert.equal(first.time, "01:41:00");
  assert.equal(first.fuelType, "ETANOL");
  assert.equal(first.km, 11151);
  assert.equal(first.liters, 15.31);
  assert.equal(first.valor, 61.09);
  assert.equal(first.driver, "GABRIEL APARECIDO DE MELO SOUZA");
  assert.equal(first.station, "POSTO CARRETEIRO 2");
  assert.equal(first.city, "GUARULHOS");
  assert.equal(first.uf, "SP");

  // Soma de valor bate com soma direta do XLS (sanity).
  const total = rows.reduce((s, r) => s + (r.valor || 0), 0);
  assert.ok(total > 5000 && total < 10000, `total fora do range esperado: ${total}`);

  // Códigos únicos (transacao não repete no mesmo arquivo).
  const codes = new Set(rows.map((r) => r.code));
  assert.equal(codes.size, rows.length);

  // Todas devem ter placa não-vazia e data preenchida.
  for (const r of rows) {
    assert.ok(r.plate && r.plate.length >= 6, `placa invalida em ${r.code}: "${r.plate}"`);
    assert.ok(r.date, `data nula em ${r.code}`);
  }
});

test("detectTicketLogFileKind: identifica XLS legado mesmo com extensão errada", () => {
  const buf = readFileSync(XLS_PATH);
  // Mesmo se o usuário renomear pro .pdf, magic bytes (D0 CF 11 E0...) ganham.
  assert.equal(detectTicketLogFileKind(buf, "renomeado.pdf"), "xls");
  assert.equal(detectTicketLogFileKind(buf, "qualquer.xls"), "xls");
  assert.equal(detectTicketLogFileKind(buf, undefined), "xls");
});

test("detectTicketLogFileKind: identifica PDF pelo header %PDF-", () => {
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(16)]);
  assert.equal(detectTicketLogFileKind(pdf, "qualquer.bin"), "pdf");
});

test("detectTicketLogFileKind: identifica XLSX (ZIP) pelo magic PK\\x03\\x04", () => {
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]);
  assert.equal(detectTicketLogFileKind(zip, "rfcvtitulo.xlsx"), "xls");
  // Mesmo sem nome o ZIP é tratado como XLS (TicketLog não exporta outro tipo).
  assert.equal(detectTicketLogFileKind(zip, undefined), "xls");
});

test("detectTicketLogFileKind: arquivo desconhecido vira 'unknown'", () => {
  const lixo = Buffer.from("aleatorio sem assinatura conhecida");
  assert.equal(detectTicketLogFileKind(lixo, undefined), "unknown");
  assert.equal(detectTicketLogFileKind(lixo, "qualquer.txt"), "unknown");
});

test("parseTicketLogXls: planilha sem colunas obrigatórias lança erro claro", async () => {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Foo", "Bar", "Baz"],
    ["a", "b", "c"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  assert.throws(
    () => parseTicketLogXls(buf),
    /Colunas obrigatórias ausentes/,
  );
});

test("parseTicketLogXls: buffer sem worksheets retorna []", () => {
  // XLSX.read não falha com buffer vazio (cria workbook vazio), só não tem sheets.
  // O parser cobre os 2 casos: SheetNames vazio OU rows < 2.
  let result: ReturnType<typeof parseTicketLogXls> = [];
  try {
    result = parseTicketLogXls(Buffer.from([]));
  } catch {
    // se a lib mudar e passar a lançar, ok também — só não pode retornar lixo
    return;
  }
  assert.deepEqual(result, []);
});
