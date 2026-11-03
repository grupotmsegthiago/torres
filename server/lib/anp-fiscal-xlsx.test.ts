import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "zlib";
import { fiscalFlagsFromXlsx } from "./anp-fiscal-xlsx.ts";

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const comp = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(file.data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

test("xlsx de fiscalização marca reprovação recente e ignora coleta", () => {
  const shared = `<?xml version="1.0"?><sst>
    <si><t>CNPJ</t></si><si><t>DATA</t></si><si><t>PROC</t></si>
    <si><t>06321359000147</t></si>
    <si><t>Amostra Prova de Gasolina Reprovada - destilação</t></si>
    <si><t>22222222000122</t></si>
    <si><t>Coleta de amostra de Gasolina comum</t></si>
    <si><t>33333333000133</t></si>
    <si><t>Interdição total</t></si>
  </sst>`;
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="E1" t="s"><v>0</v></c><c r="H1" t="s"><v>1</v></c><c r="K1" t="s"><v>2</v></c></row>
    <row r="2"><c r="E2" t="s"><v>3</v></c><c r="H2"><v>46001</v></c><c r="K2" t="s"><v>4</v></c></row>
    <row r="3"><c r="E3" t="s"><v>5</v></c><c r="H3" t="s"><v>1</v></c><c r="K3" t="s"><v>6</v></c></row>
    <row r="4"><c r="E4" t="s"><v>7</v></c><c r="H4"><v>01/06/2025</v></c><c r="K4" t="s"><v>8</v></c></row>
  </sheetData></worksheet>`;
  const buf = zip([
    { name: "xl/sharedStrings.xml", data: Buffer.from(shared) },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet) },
  ]);
  const flags = fiscalFlagsFromXlsx(buf, "2026-11-03");
  assert.equal(flags.get("06321359000147")?.hasQualityInfraction, true);
  assert.equal(flags.has("22222222000122"), false);
  assert.equal(flags.get("33333333000133")?.isInterdicted, true);
});
