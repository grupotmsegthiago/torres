/**
 * Texto da DPS nacional (`descricao_servico` / xDescServ).
 * Não altera a descrição comercial da fatura nem o boleto.
 * A Sefin aceita até 2.000 caracteres e recusa `<`, `>`, `&` e controles ASCII.
 */

export const NFSE_DESCRICAO_MAX = 2000;
export const NFSE_DESCRICAO_MIN = 10;

/** Mesmas frases do boleto. A nota leva as duas para o cliente conferir no DANFSe. */
export const NF_INSS_ANEXO_IV_TEXTO =
  "Retenção de INSS sobre cessão de mão-de-obra (ANEXO IV) - Art. 111, II da IN RFB nº 2.110/2022";
export const NF_SIMPLES_NACIONAL_TEXTO =
  "Empresa optante pelo Simples Nacional. Não sujeita à retenção das contribuições conforme art. 30 da Lei 10.833/2003";

export type NfseCategoriaFiscal = "escolta" | "vigilancia";

export const NFSE_CATEGORIA_OPCOES: ReadonlyArray<{ value: NfseCategoriaFiscal; label: string }> = [
  { value: "escolta", label: "Escolta — Nac: 110301 | NBS: 1.1802.30.00 | Mun: 07897" },
  { value: "vigilancia", label: "Vigilância (Posto) — Nac: 110201 | NBS: 1.1802.50.00 | Mun: 07870" },
];

export type NfseDescriptionInput = {
  category: NfseCategoriaFiscal;
  description?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  osNumbers?: Array<string | number | null | undefined>;
  controles?: Array<string | number | null | undefined>;
  poNumbers?: Array<string | number | null | undefined>;
  smNumbers?: Array<string | number | null | undefined>;
  /** INSS já retido na fatura. A linha do Anexo IV só entra se este valor for maior que zero. */
  valorInssRetido?: number | string | null;
  /** Torres é optante. Sem este campo, a sugestão leva a frase do Simples. */
  incluirSimples?: boolean;
};

export function cleanNfseDescription(text: string): { text: string; removedInvalid: boolean; truncated: boolean } {
  const original = String(text ?? "");
  const stripped = original
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>&]/g, "");
  const normalized = stripped
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: normalized.slice(0, NFSE_DESCRICAO_MAX),
    removedInvalid: stripped !== original,
    truncated: normalized.length > NFSE_DESCRICAO_MAX,
  };
}

export function sanitizeNfseDescription(text: string): string {
  const cleaned = cleanNfseDescription(text);
  if (cleaned.text.length < NFSE_DESCRICAO_MIN) {
    throw new Error(`A descrição do serviço precisa ter pelo menos ${NFSE_DESCRICAO_MIN} caracteres.`);
  }
  return cleaned.text;
}

export function parseNfseCategory(raw: unknown): NfseCategoriaFiscal | null {
  const token = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!token) return null;
  if (token === "escolta") return "escolta";
  if (token === "vigilancia") return "vigilancia";
  return null;
}

function toBrDate(value: string | null | undefined): string | null {
  const s = String(value || "").trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return null;
}

function monthYearFromBr(br: string | null): string {
  if (!br) return "";
  return `${br.slice(3, 5)}/${br.slice(6, 10)}`;
}

/** Intervalo explícito vira DD/MM/AAAA a DD/MM/AAAA. Sem intervalo, MM/AAAA. */
export function nfsePeriodoLabel(input: {
  description?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): string {
  const blob = `${input.description || ""}\n${input.notes || ""}`;
  const found = blob.match(/Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (found && found[1] !== found[2]) return `${found[1]} a ${found[2]}`;
  const start = toBrDate(input.periodStart);
  const end = toBrDate(input.periodEnd);
  if (start && end && start !== end) return `${start} a ${end}`;
  const anchor = (found && found[1]) || start || end || toBrDate(input.dueDate);
  if (anchor) return monthYearFromBr(anchor);
  const isoMonth = String(input.dueDate || "").match(/^(\d{4})-(\d{2})/);
  if (isoMonth) return `${isoMonth[2]}/${isoMonth[1]}`;
  return "";
}

export function nfseCategoryPrefix(category: NfseCategoriaFiscal, periodo: string): string {
  const name = category === "vigilancia" ? "Ref. vigilância" : "Ref. escolta armada";
  return periodo ? `${name} (${periodo})` : name;
}

export function nfseCategoryPrefixes(periodo: string): Record<NfseCategoriaFiscal, string> {
  return {
    escolta: nfseCategoryPrefix("escolta", periodo),
    vigilancia: nfseCategoryPrefix("vigilancia", periodo),
  };
}

/** Troca só o prefixo da categoria enquanto o usuário não editou esse trecho. */
export function swapNfseCategoryPrefix(text: string, from: string, to: string, prefixTouched: boolean): string {
  if (prefixTouched || !from || !to || from === to) return text;
  if (!text.startsWith(from)) return text;
  return `${to}${text.slice(from.length)}`;
}

function uniqueTokens(values: Array<string | number | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const token = String(raw ?? "").trim().replace(/^#/, "");
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function extractList(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const tail = String(match[1] || "").split(/\s+-\s+/)[0];
    for (const part of tail.split(/[,;]/)) {
      const token = part.trim().replace(/^#/, "");
      if (token && /^[A-Za-z0-9][\w./-]*$/.test(token)) out.push(token);
    }
  }
  return out;
}

function sourceText(input: NfseDescriptionInput): string {
  return `${input.description || ""}\n${input.notes || ""}`;
}

function isBoilerplate(chunk: string): boolean {
  const s = chunk.replace(/\s+/g, " ").trim();
  if (!s) return true;
  if (/^referente aos servi[cç]os de escolta armada\.?$/i.test(s)) return true;
  if (/^per[ií]odo:/i.test(s)) return true;
  if (/^\([A-Za-zçãéíóúâêô]+\/\d{4}\)$/i.test(s)) return true;
  if (/^vigil[aâ]ncia, seguran[cç]a ou monitoramento/i.test(s)) return true;
  if (/anexo iv/i.test(s)) return true;
  if (/simples nacional/i.test(s)) return true;
  if (/^retenc[aã]o de inss/i.test(s)) return true;
  if (/^empresa optante pelo simples/i.test(s)) return true;
  if (/^(OS|SM)\.?\s*[:#]?\s*\S/i.test(s)) return true;
  if (/^controle\b/i.test(s)) return true;
  if (/^(pedido de compra|p\.?o\.?)\b/i.test(s)) return true;
  if (/^ref\. (escolta armada|vigil[aâ]ncia)\b/i.test(s)) return true;
  return false;
}

function isBankLine(s: string): boolean {
  return /\b(pix|ag[eê]ncia|conta corrente|dados banc[aá]rios)\b/i.test(s);
}

function isInssLine(s: string): boolean {
  return /anexo iv|reten[cç][aã]o de inss/i.test(s);
}

function isSimplesLine(s: string): boolean {
  return /simples nacional/i.test(s);
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = String(raw || "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function linesOf(text: string): string[] {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function joinNfseDescription(head: string, suffixLines: string[]): string {
  const suffix = uniqueLines(suffixLines).join("\n");
  if (!suffix) return sanitizeNfseDescription(head);
  const maxHead = NFSE_DESCRICAO_MAX - suffix.length - 1;
  const trimmedHead = maxHead > 0 ? head.trim().slice(0, maxHead).trim() : "";
  const combined = trimmedHead ? `${trimmedHead}\n${suffix}` : suffix.slice(0, NFSE_DESCRICAO_MAX);
  return sanitizeNfseDescription(combined);
}

function extraClientLines(text: string): string[] {
  const chunks = String(text || "")
    .split(/\n+/)
    .flatMap((line) => (/^referente aos servi/i.test(line.trim()) ? line.split(/\s+-\s+/) : [line]))
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part && !isBoilerplate(part));
  return uniqueTokens(chunks);
}

export function buildDefaultNfseDescription(input: NfseDescriptionInput): string {
  const periodo = nfsePeriodoLabel(input);
  const prefix = nfseCategoryPrefix(input.category, periodo);
  const blob = sourceText(input);
  const os = uniqueTokens([
    ...(input.osNumbers || []),
    ...extractList(blob, /\bOS\b\s*[#.:]?\s*([^\n]+)/gi),
  ]);
  const sm = uniqueTokens([
    ...(input.smNumbers || []),
    ...extractList(blob, /\bSM\b\s*[#.:]?\s*([^\n]+)/gi),
  ]);
  const controles = uniqueTokens([
    ...(input.controles || []),
    ...extractList(blob, /controle(?:\s+cliente)?\s*[:#]\s*([^\n]+)/gi),
  ]);
  const pos = uniqueTokens([
    ...(input.poNumbers || []),
    ...extractList(blob, /\b(?:pedido de compra(?:\s*\/\s*po)?|p\.?o\.?)\s*[:#]\s*([^\n]+)/gi),
  ]);
  const extras = extraClientLines(blob).filter((line) => {
    if (isBankLine(line) || isInssLine(line) || isSimplesLine(line)) return false;
    const folded = line.toLowerCase();
    return ![...os, ...sm, ...controles, ...pos].some((token) => folded === token.toLowerCase());
  });
  const parts = [prefix];
  if (os.length) parts.push(`OS: ${os.join(", ")}`);
  if (sm.length) parts.push(`SM: ${sm.join(", ")}`);
  if (controles.length) parts.push(`Controle: ${controles.join(", ")}`);
  if (pos.length) parts.push(`PO: ${pos.join(", ")}`);
  if (extras.length) parts.push(extras.join(" | "));

  const stored = linesOf(blob).filter((line) => !/^referente aos servi/i.test(line) && !/^ref\. (escolta armada|vigil[aâ]ncia)\b/i.test(line));
  const inssGuardado = stored.filter(isInssLine);
  const simplesGuardado = stored.filter(isSimplesLine);
  const banco = stored.filter(isBankLine);
  const inssValor = Number(input.valorInssRetido);
  const temRetencaoInss = Number.isFinite(inssValor) && inssValor > 0;
  const inss = inssGuardado.length ? inssGuardado : (temRetencaoInss ? [NF_INSS_ANEXO_IV_TEXTO] : []);
  const simples = input.incluirSimples === false
    ? simplesGuardado
    : (simplesGuardado.length ? simplesGuardado : [NF_SIMPLES_NACIONAL_TEXTO]);
  return joinNfseDescription(parts.join(" - "), [...banco, ...inss, ...simples]);
}
