import { inflateRawSync } from "zlib";
import {
  decodeXml,
  digitsCnpj,
  isDesinterdiction,
  isFuelQualityProcedure,
  isTotalInterdiction,
  parseFlexibleDate,
  summarizeFiscal,
  type FiscalEvent,
  type FiscalFlags,
} from "@shared/anp-onde-abastecer";

export function readZipEntry(buf: Buffer, nameEndsWith: string): Buffer {
  let offset = 0;
  while (offset + 30 < buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (name === nameEndsWith || name.endsWith(nameEndsWith)) {
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Zip method ${method} em ${name}`);
    }
    offset = dataStart + compSize;
  }
  throw new Error(`Entrada não encontrada: ${nameEndsWith}`);
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRe.exec(xml))) {
    const parts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    out.push(parts.join(""));
  }
  return out;
}

function cellText(attrs: string, body: string, shared: string[]): string {
  const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
  const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? inline ?? "";
  if (attrs.includes('t="s"') || attrs.includes("t='s'")) return shared[Number(value)] ?? "";
  return decodeXml(value);
}

/**
 * Coluna E = CNPJ, H = data do documento, K = resultado (o texto da infração).
 * A coluna J é só o tipo do documento (auto, boletim, notificação).
 * Coleta sem reprovação não entra.
 */
export function fiscalEventsFromSheet(xml: string, shared: string[]): FiscalEvent[] {
  const events: FiscalEvent[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<row ", cursor);
    if (start < 0) break;
    const end = xml.indexOf("</row>", start);
    if (end < 0) break;
    const chunk = xml.slice(start, end);
    cursor = end + 6;
    const rowNo = /<row\b[^>]*\br="(\d+)"/.exec(chunk)?.[1];
    if (!rowNo || rowNo === "1") continue;
    let cnpj = "";
    let date = "";
    let procedure = "";
    const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(chunk))) {
      const col = cell[1];
      if (col !== "E" && col !== "H" && col !== "K") continue;
      const text = cellText(cell[2], cell[3], shared).trim();
      if (col === "E") cnpj = text;
      else if (col === "H") date = text;
      else if (col === "K") procedure = text;
    }
    if (!procedure) continue;
    if (!isFuelQualityProcedure(procedure) && !isTotalInterdiction(procedure) && !isDesinterdiction(procedure)) continue;
    const id = digitsCnpj(cnpj);
    const iso = parseFlexibleDate(date);
    if (!id || !iso) continue;
    events.push({ cnpj: id, date: iso, procedure });
  }
  return events;
}

export function fiscalFlagsFromXlsx(buf: Buffer, asOfIso: string): Map<string, FiscalFlags> {
  const sharedXml = readZipEntry(buf, "xl/sharedStrings.xml").toString("utf8");
  const sheetXml = readZipEntry(buf, "xl/worksheets/sheet1.xml").toString("utf8");
  const events = fiscalEventsFromSheet(sheetXml, parseSharedStrings(sharedXml));
  return summarizeFiscal(events, asOfIso);
}
