/**
 * Pure helpers da integração Control iD / RHID — criptografia de credenciais,
 * normalização de eventos, fuzzy match de nomes e ciclo de fechamento de ponto.
 *
 * Extraído para teste — sem dependência de Supabase/Express.
 */
import crypto from "node:crypto";

// ============================ CRIPTOGRAFIA ============================

function getEncKey(): Buffer {
  const raw =
    process.env.CONTROLID_ENC_KEY ||
    process.env.SESSION_SECRET ||
    "torres-default-encryption-key-change-me-please-32";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(b64: string): string {
  try {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch (err: any) {
    throw new Error(`Falha ao descriptografar credencial: ${err.message}`);
  }
}

// ============================ EVENTOS ============================

export interface ControlIdEvent {
  id: string;
  userId: string;
  userName?: string;
  time: string;
  direction?: "in" | "out" | "unknown";
  source?: "facial" | "rfid" | "digital" | "senha";
  raw: any;
}

export function parseRhidDate(d: any): Date {
  if (!d) return new Date(0);
  if (typeof d === "string") {
    const m = d.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
    if (m) return new Date(parseInt(m[1]));
    return new Date(d);
  }
  return new Date(d);
}

export function parseRhidAfdRecords(afdData: any, since: Date | null): ControlIdEvent[] {
  const records = Array.isArray(afdData) ? afdData : (afdData?.data || afdData?.records || []);
  const sinceMs = since ? since.getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000;
  const events: ControlIdEvent[] = [];

  for (const rec of records) {
    const punchDate = parseRhidDate(
      rec.dateTime || rec.DateTime || rec.PunchDate || rec.punchDate || rec.Date || rec.date,
    );
    if (punchDate.getTime() <= 0 || punchDate.getTime() < sinceMs) continue;

    const personId = String(
      rec.idPerson || rec.IdPerson || rec.PersonId || rec.personId || rec.EmployeeId || rec.id || "",
    );
    const personName = rec.personName || rec.PersonName || rec.Name || rec.name || "";
    const punchIso = punchDate.toISOString();

    events.push({
      id: `rhid_${rec.id || personId}_${punchDate.getTime()}`,
      userId: personId,
      userName: personName,
      time: punchIso,
      direction: "unknown",
      source: rec.faceScore > 0 ? "facial" : undefined,
      raw: rec,
    });
  }

  return events;
}

export function normalizeEvent(raw: any): ControlIdEvent {
  const id = String(
    raw.id ?? raw.event_id ?? raw.access_log_id ?? raw.uuid ?? `${raw.user_id || raw.userId}-${raw.time}`,
  );
  let t = raw.time ?? raw.timestamp ?? raw.date ?? raw.event_time ?? raw.access_time;
  let punchIso: string;
  if (typeof t === "number") {
    punchIso = new Date(t < 1e12 ? t * 1000 : t).toISOString();
  } else if (typeof t === "string") {
    const num = Number(t);
    if (!isNaN(num) && num > 1e9) {
      punchIso = new Date(num < 1e12 ? num * 1000 : num).toISOString();
    } else {
      punchIso = new Date(t).toISOString();
    }
  } else {
    punchIso = new Date().toISOString();
  }
  const dirRaw = String(raw.direction || raw.flow || raw.tipo || raw.event || "").toLowerCase();
  let direction: "in" | "out" | "unknown" = "unknown";
  if (/in|entrada|1/.test(dirRaw)) direction = "in";
  else if (/out|saida|saída|2/.test(dirRaw)) direction = "out";
  const srcRaw = String(raw.source || raw.identification_method || raw.type || "").toLowerCase();
  let source: "facial" | "rfid" | "digital" | "senha" | undefined;
  if (/face|facial/.test(srcRaw)) source = "facial";
  else if (/rfid|card|cartao|cartão/.test(srcRaw)) source = "rfid";
  else if (/digital|fingerprint|biometr/.test(srcRaw)) source = "digital";
  else if (/pass|senha|password/.test(srcRaw)) source = "senha";

  return {
    id,
    userId: String(raw.user_id ?? raw.userId ?? raw.person_id ?? raw.matricula ?? raw.idUser ?? ""),
    userName: raw.user_name || raw.userName || raw.name || raw.nome,
    time: punchIso,
    direction,
    source,
    raw,
  };
}

// ============================ NAME MATCHING ============================

/**
 * Chave "YYYY-MM-DD HH:mm" em BRT a partir de um Date.
 * Usada para casar batidas por minuto entre o nosso sistema e o RHID,
 * robusto contra diferença de ms/segundos e de formato de external_id.
 */
export function minuteKeyBRT(d: Date): string {
  const date = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

export function normalizeName(s: string): string {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function nameTokens(s: string): string[] {
  return normalizeName(s).split(" ").filter((t) => t.length >= 3);
}

export function nameMatchScore(a: string, b: string): number {
  const ta = nameTokens(a),
    tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.includes(t)) common++;
  return common / Math.max(ta.length, tb.length);
}

// ============================ FECHAMENTO ============================

/**
 * Converte um mês "YYYY-MM" no ciclo de fechamento RHID (dia 26 do mês anterior
 * 00:00 BRT até dia 26 do mês informado 00:00 BRT — fim exclusivo, abrange até
 * 25 23:59:59 BRT). Clamp inferior em 2026-03-01 (início dos dados).
 *
 * IMPORTANTE: os limites são em BRT (UTC-3), não em UTC. 00:00 BRT = 03:00 UTC.
 * Sem essa correção, batidas de turno noturno entre 21:00 e 24:00 BRT do dia
 * de virada (25) caíam no bucket errado — o que fazia a tela de Ponto Eletrônico
 * mostrar números diferentes do que o badge "26/04 → 25/05" prometia.
 */
export function monthToFechamento(monthYear: string): { start: Date; end: Date } {
  const [yyyy, mm] = monthYear.split("-").map(Number);
  // BRT é UTC-3, então 00:00 BRT = 03:00 UTC do mesmo dia.
  let start = new Date(Date.UTC(yyyy, mm - 2, 26, 3));
  const end = new Date(Date.UTC(yyyy, mm - 1, 26, 3));
  const minStart = new Date(Date.UTC(2026, 2, 1, 3));
  if (start.getTime() < minStart.getTime()) start = minStart;
  return { start, end };
}

// ============================ DEDUP DE IMPORT (AFD → local) ============================

/**
 * Decide o que fazer com um evento do AFD do RHID ao importá-lo para
 * `control_id_punches`, evitando duplicar uma batida que já existe localmente.
 *
 * Contexto: o POST de criação devolve um id numérico, mas o AFD reexporta a mesma
 * batida com `external_id` em formato `rhid_{id}_{ts}`. O dedup por `external_id`
 * sozinho falha (formatos diferentes) → batida duplicada. A verdade é o nosso
 * sistema: se já temos uma batida no mesmo minuto (BRT) pro funcionário, não
 * inserimos outra. Quando isso acontece e o `external_id` local ainda não é o
 * canônico do AFD, ADOTAMOS o id do AFD (`adopt-external-id`) pra que os próximos
 * syncs casem direto por `external_id`.
 *
 * @param externalIdExists  o `external_id` do evento já existe em `control_id_punches` (device+id)
 * @param localExternalIdAtMinute  `external_id` da batida local existente no mesmo minuto;
 *   `undefined` = não há batida local nesse minuto; `null` = há, mas sem external_id (legado)
 * @param eventExternalId  id canônico do evento vindo do AFD
 */
export type ImportDecision = "insert" | "skip" | "adopt-external-id";

export function decideImport(params: {
  externalIdExists: boolean;
  localExternalIdAtMinute: string | null | undefined;
  eventExternalId: string;
}): ImportDecision {
  if (params.externalIdExists) return "skip";
  if (params.localExternalIdAtMinute === undefined) return "insert";
  // Já existe batida local nesse minuto: nunca duplica.
  return params.localExternalIdAtMinute === params.eventExternalId ? "skip" : "adopt-external-id";
}
