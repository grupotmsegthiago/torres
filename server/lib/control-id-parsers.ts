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

/**
 * Zera segundos e ms do timestamp.
 * Ponto/folha contam só HH:MM (igual à tela e à planilha manual) —
 * não pode usar fração de segundo da batida no Control iD.
 * Brasil sem offset de meia hora → truncar por epoch-minuto = truncar o relógio BRT.
 */
export function truncateToMinuteMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 60_000) * 60_000;
}

/** Minutos trabalhados entre duas batidas, só no HH:MM (sem segundos). */
export function workedMinutesBetween(startMs: number, endMs: number): number {
  const a = truncateToMinuteMs(startMs);
  const b = truncateToMinuteMs(endMs);
  if (!(b > a)) return 0;
  return (b - a) / 60_000;
}

/** HH:MM em America/Sao_Paulo. */
export function hhmmBRT(d: Date): string {
  return minuteKeyBRT(d).slice(11);
}

/**
 * Marcadores sintéticos do import PDF RHID (folha_pdf_import): 00:00 / 00:01 / 23:59.
 * Inflam first→last do dia; o cartão oficial Control iD não os conta como jornada.
 */
export function isSyntheticMidnightMarker(d: Date): boolean {
  const t = hhmmBRT(d);
  return t === "00:00" || t === "00:01" || t === "23:59";
}

export type DayWorkPair = { inMs: number; outMs: number; workedMin: number };

/**
 * Jornada do dia no estilo cartão Control iD (pagamento Folha / Balanço):
 *  1) dedup por minuto BRT
 *  2) soma pares guloso entrada→saída (cada intervalo entre pares = pausa/almoço)
 *  3) teto diário opcional (default 19:59)
 *
 * IMPORTANTE: por padrão NÃO remove 00:00/00:01/23:59 — esses marcadores do
 * import PDF costuram o turno que cruza a meia-noite (18:00→23:59 + 00:00→06:00).
 * Removê-los zerava HE de vigilantes noturnos (caso Reis em prod 29/07/2026).
 *
 * `stripSyntheticMarkers: true` só para testes / cenários sem virada de dia.
 */
export function computeDayWorkedMinutesFromPunches(
  punchAts: Array<string | Date | number>,
  opts?: { dailyCapMin?: number; hardMaxGapMin?: number; stripSyntheticMarkers?: boolean },
): { workedMin: number; pairs: DayWorkPair[]; ignoredMarkers: number } {
  const dailyCapMin = opts?.dailyCapMin ?? 1199;
  const hardMaxGapMin = opts?.hardMaxGapMin ?? 18 * 60;
  const stripMarkers = opts?.stripSyntheticMarkers === true;

  const raw = punchAts
    .map((p) => (typeof p === "number" ? new Date(p) : new Date(p)))
    .filter((d) => d.getTime() > 0)
    .sort((a, b) => a.getTime() - b.getTime());

  let ignoredMarkers = 0;
  const filtered: Date[] = [];
  for (const d of raw) {
    if (stripMarkers && isSyntheticMidnightMarker(d)) {
      ignoredMarkers++;
      continue;
    }
    filtered.push(d);
  }

  const seen = new Set<string>();
  const cleanMs: number[] = [];
  for (const d of filtered) {
    const k = minuteKeyBRT(d);
    if (seen.has(k)) continue;
    seen.add(k);
    cleanMs.push(truncateToMinuteMs(d.getTime()));
  }

  const pairs: DayWorkPair[] = [];
  for (let i = 0; i < cleanMs.length; ) {
    const inMs = cleanMs[i];
    const outMs = cleanMs[i + 1];
    if (outMs != null && outMs - inMs <= hardMaxGapMin * 60_000 && outMs > inMs) {
      const workedMin = (outMs - inMs) / 60_000;
      pairs.push({ inMs, outMs, workedMin });
      i += 2;
    } else {
      i += 1; // órfã — não conta (esqueceu saída)
    }
  }

  let workedMin = pairs.reduce((s, p) => s + p.workedMin, 0);
  if (dailyCapMin > 0) workedMin = Math.min(workedMin, dailyCapMin);
  return { workedMin: Math.round(workedMin), pairs, ignoredMarkers };
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
/**
 * Extrai o id numérico da RHID de um `external_id`, seja no formato canônico do
 * AFD (`rhid_{id}_{ts}`) ou no formato puro devolvido pelo POST de criação
 * (`{id}`). Retorna `null` quando não há id numérico reconhecível (ex.: legado).
 *
 * Usado pra casar uma batida que NÓS criamos via POST (external_id numérico, ex.
 * "15215") com a mesma batida reexportada pelo AFD (`rhid_15215_...`) — mesmo
 * quando a RHID gravou o horário "encaixado" na escala (minuto diferente), o id
 * é o mesmo. Sem isso, o dedup por minuto falha e a batida duplica.
 */
export function rhidNumericCore(externalId: string | null | undefined): string | null {
  if (externalId == null) return null;
  const s = String(externalId).trim();
  const m = s.match(/^rhid_(\d+)_\d+$/);
  if (m) return m[1];
  if (/^\d+$/.test(s)) return s;
  return null;
}

/**
 * Person ID no RHID é numérico. "0030" e "30" são a mesma pessoa no aparelho;
 * guardar/comparar com zero à esquerda cria mapping fantasma que nunca casa
 * com o AFD (que devolve o id sem padding).
 */
export function canonicalRhidPersonId(id: string | number | null | undefined): string {
  const s = String(id ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return String(Number(s));
  return s;
}

/**
 * Colapsa, PARA EXIBIÇÃO (espelho/folha), a duplicata "hard": a mesma batida
 * gravada 2x — uma que NÓS criamos via POST (`external_id` numérico puro, ex.
 * "14506") e a reexportação do AFD do RHID (`rhid_14506_{ts}`) do MESMO id no
 * MESMO dia BRT. Mantém a batida da Torres (verdade: horário digitado) e descarta
 * a cópia do AFD.
 *
 * SEGURANÇA (não funde batidas distintas):
 *  - só descarta uma linha `rhid_{core}_{ts}` quando existe uma linha puro-numérica
 *    com EXATAMENTE esse `core` NO MESMO dia BRT. O id puro vem do POST e é único
 *    por batida; o `rhid_{core}` do mesmo dia é a reexportação da mesma batida.
 *  - grupos só-AFD (`rhid_*` sem a puro-numérica) NÃO são tocados — ali o `core`
 *    pode ser um personId compartilhado por batidas diferentes (fallback de
 *    `parseRhidAfdRecords`), então fundir apagaria batida real.
 *
 * NÃO altera custos quando os dados já estão limpos (sem duplicata = no-op).
 * Quando há duplicata, corrige a jornada (a cópia inflava o almoço/zerava horas).
 */
export function dedupPunchesByCore<T extends { punch_at: string | Date; external_id?: string | null }>(
  punches: T[],
): T[] {
  // core puro-numérico -> dias BRT em que existe a batida canônica (POST).
  const pureCoreDays = new Map<string, Set<string>>();
  for (const p of punches) {
    const ext = p.external_id == null ? "" : String(p.external_id).trim();
    if (/^\d+$/.test(ext)) {
      const day = minuteKeyBRT(new Date(p.punch_at)).slice(0, 10);
      const set = pureCoreDays.get(ext) || new Set<string>();
      set.add(day);
      pureCoreDays.set(ext, set);
    }
  }
  if (pureCoreDays.size === 0) return punches;
  return punches.filter((p) => {
    const ext = p.external_id == null ? "" : String(p.external_id).trim();
    const m = ext.match(/^rhid_(\d+)_\d+$/);
    if (!m) return true; // não é reexportação do AFD
    const days = pureCoreDays.get(m[1]);
    if (!days) return true; // sem canônica puro-numérica desse core
    const day = minuteKeyBRT(new Date(p.punch_at)).slice(0, 10);
    return !days.has(day); // descarta a reexportação do mesmo dia
  });
}

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

// ============================ MODELO CANÔNICO 4 BATIDAS ============================
//
// Processo operacional (dono 31/07/2026):
//  1) Entrada = Control iD da parede (facial/device) — PRIORIDADE
//  2) Sync diário Control iD → Torres
//  3) Demais batidas = operação (manual): almoço saída, almoço retorno, fim
//  4) No máximo 4 batidas por dia para cálculo de folha
//  5) Virada de meia-noite é normal (turno pode terminar no dia seguinte)
//
// ============================================================================

export type FolhaPunchLike = {
  punch_at: string | Date;
  source?: string | null;
  external_id?: string | null;
  direction?: string | null;
  id?: number | string | null;
};

/** Batida vinda do aparelho / AFD (Control iD da parede). */
export function isControlIdDevicePunch(p: FolhaPunchLike): boolean {
  const src = String(p.source || "").toLowerCase().trim();
  if (src === "facial" || src === "rfid" || src === "digital" || src === "senha") return true;
  // AFD costuma chegar com source null + external_id rhid_{id}_{ts}
  if (!src) {
    const ext = String(p.external_id || "").trim();
    if (/^rhid_\d+_\d+$/.test(ext)) return true;
    // POST facial às vezes fica só com id numérico e source null — sem is_manual
    // tratado como device só se não for manual explícito (já coberto acima).
  }
  return false;
}

/** Batida lançada pela operação / autoatendimento no Torres. */
export function isManualOpsPunch(p: FolhaPunchLike): boolean {
  const src = String(p.source || "").toLowerCase().trim();
  return src === "admin_manual" || src === "self_manual" || src === "manual";
}

export type CanonicalDayPunches<T extends FolhaPunchLike> = {
  /** Até 4 batidas na ordem: entrada, almoço-out, almoço-in, saída. */
  selected: T[];
  entry: T | null;
  lunchOut: T | null;
  lunchIn: T | null;
  exit: T | null;
  discarded: T[];
  flags: string[];
};

const LUNCH_MIN_GAP_MIN = 20;
const LUNCH_MAX_GAP_MIN = 4 * 60;

function punchMs(p: FolhaPunchLike): number {
  return new Date(p.punch_at).getTime();
}

/**
 * Remove só "dupla facial" (rebatida no aparelho em poucos minutos).
 *
 * O cartão Control iD trata batidas em PARES (05:53→07:00 é bloco válido).
 * Não descartar a 2ª batida da parede só por "ponto aberto" — isso quebrava
 * o espelho oficial (Reis 20/07 → NORMAIS 02:16).
 *
 * Descarta apenas device com gap < 5 min após outro device (eco do leitor).
 */
export function stripIllegalDeviceReentries<T extends FolhaPunchLike>(
  punches: T[],
): { kept: T[]; discarded: T[] } {
  const sorted = [...punches]
    .filter((p) => p && p.punch_at != null)
    .sort((a, b) => punchMs(a) - punchMs(b));
  if (sorted.length === 0) return { kept: [], discarded: [] };

  const kept: T[] = [];
  const discarded: T[] = [];
  const DUP_FACIAL_MIN = 5;

  for (const p of sorted) {
    const isDevice = isControlIdDevicePunch(p) && !isManualOpsPunch(p);
    if (isDevice && kept.length > 0) {
      const prev = kept[kept.length - 1];
      const prevDevice = isControlIdDevicePunch(prev) && !isManualOpsPunch(prev);
      const gapMin = (punchMs(p) - punchMs(prev)) / 60000;
      if (prevDevice && gapMin >= 0 && gapMin < DUP_FACIAL_MIN) {
        discarded.push(p);
        continue;
      }
    }
    kept.push(p);
  }
  return { kept, discarded };
}

/**
 * Seleciona as até 4 batidas canônicas do dia para a Folha.
 *
 * Processo (dono 31/07/2026):
 *  - Entrada: 1ª batida do dia. Se a 1ª for só marcador 00:00/00:01 e existir
 *    batida do Control iD (parede) em seguida, a parede vira Entrada (prioridade).
 *  - Saída: última batida do dia (virada de meia-noite OK).
 *  - Almoço: 2 batidas no meio — prioriza manuais da operação com intervalo
 *    típico (20min–4h). Extras (5ª/6ª) são ignoradas no cálculo.
 */
export function selectCanonicalDayPunches<T extends FolhaPunchLike>(
  punches: T[],
): CanonicalDayPunches<T> {
  const flags: string[] = [];
  const stripped = stripIllegalDeviceReentries(punches);
  if (stripped.discarded.length > 0) {
    flags.push(`discard_reentry_x${stripped.discarded.length}`);
  }
  const sorted = stripped.kept
    .filter((p) => p && p.punch_at != null)
    .sort((a, b) => punchMs(a) - punchMs(b));

  // Dedup por minuto BRT — no empate, Control iD (parede) tem prioridade
  const byMinute = new Map<string, T>();
  for (const p of sorted) {
    const k = minuteKeyBRT(new Date(p.punch_at));
    const prev = byMinute.get(k);
    if (!prev) {
      byMinute.set(k, p);
      continue;
    }
    if (!isControlIdDevicePunch(prev) && isControlIdDevicePunch(p)) {
      byMinute.set(k, p);
      flags.push("dedup_prefer_device");
    }
  }
  const unique = [...byMinute.values()].sort((a, b) => punchMs(a) - punchMs(b));

  if (unique.length === 0) {
    return {
      selected: [],
      entry: null,
      lunchOut: null,
      lunchIn: null,
      exit: null,
      discarded: [],
      flags,
    };
  }

  // Entrada: 1ª cronológica. Se o prefixo for só marcador 00:00/00:01 e houver
  // batida da parede depois (que NÃO seja a última do dia = saída), a parede
  // assume a Entrada. Nunca promover a última batida a entrada (vira "open_shift").
  let entry = unique[0];
  const lastPunch = unique[unique.length - 1];
  const firstDevice = unique.find(isControlIdDevicePunch);
  if (
    firstDevice &&
    firstDevice !== entry &&
    firstDevice !== lastPunch &&
    isSyntheticMidnightMarker(new Date(entry.punch_at)) &&
    !isControlIdDevicePunch(entry)
  ) {
    entry = firstDevice;
    flags.push("entry_device_priority");
  } else if (isControlIdDevicePunch(entry)) {
    flags.push("entry_from_device");
  } else {
    flags.push("entry_chrono_first");
  }

  const afterEntry = unique.filter((p) => punchMs(p) > punchMs(entry));
  if (afterEntry.length === 0) {
    return {
      selected: [entry],
      entry,
      lunchOut: null,
      lunchIn: null,
      exit: null,
      discarded: unique.filter((p) => p !== entry),
      flags: [...flags, "open_shift"],
    };
  }

  const exit = afterEntry[afterEntry.length - 1];
  const middle = afterEntry.filter((p) => p !== exit);

  let lunchOut: T | null = null;
  let lunchIn: T | null = null;

  if (middle.length >= 2) {
    const manuals = middle.filter(isManualOpsPunch);
    // 1) Par manual com intervalo de almoço típico (~1h)
    let bestA: T | null = null;
    let bestB: T | null = null;
    let bestScore = -Infinity;
    const consider = (a: T, b: T, bonus: number) => {
      const gap = (punchMs(b) - punchMs(a)) / 60000;
      if (gap < LUNCH_MIN_GAP_MIN || gap > LUNCH_MAX_GAP_MIN) return;
      const score = bonus - Math.abs(gap - 60);
      if (score > bestScore) {
        bestScore = score;
        bestA = a;
        bestB = b;
      }
    };
    for (let i = 0; i < manuals.length; i++) {
      for (let j = i + 1; j < manuals.length; j++) consider(manuals[i], manuals[j], 100);
    }
    if (bestA && bestB) {
      lunchOut = bestA;
      lunchIn = bestB;
      flags.push("lunch_from_manual");
    } else if (manuals.length >= 2) {
      lunchOut = manuals[0];
      lunchIn = manuals[1];
      flags.push("lunch_from_manual_chrono");
    } else {
      // 2) Sem 2 manuais: melhor par do meio com gap típico, senão [0][1]
      bestA = null;
      bestB = null;
      bestScore = -Infinity;
      for (let i = 0; i < middle.length; i++) {
        for (let j = i + 1; j < middle.length; j++) consider(middle[i], middle[j], 0);
      }
      if (bestA && bestB) {
        lunchOut = bestA;
        lunchIn = bestB;
        flags.push("lunch_best_gap");
      } else {
        lunchOut = middle[0];
        lunchIn = middle[1];
        flags.push("lunch_from_middle_chrono");
      }
    }
    if (middle.length > 2) flags.push("extra_punches_ignored");
  } else if (middle.length === 1) {
    flags.push("single_middle_no_lunch");
  }

  const selected = [entry, lunchOut, lunchIn, exit].filter(Boolean) as T[];
  const selectedSet = new Set(selected);
  const discarded = [
    ...stripped.discarded,
    ...unique.filter((p) => !selectedSet.has(p)),
  ];
  if (unique.length > 4) flags.push("capped_to_4");

  return { selected, entry, lunchOut, lunchIn, exit, discarded, flags };
}

/** Almoço < 3h após a entrada é teoricamente estranho (ex.: 05:53 → 07:00). */
const LUNCH_TOO_EARLY_MIN = 180;

export type FolhaDayAnomaly = {
  code:
    | "illegal_reentry"
    | "lunch_too_early"
    | "open_shift"
    | "too_many_punches"
    | "incomplete_lunch";
  severity: "erro" | "aviso";
  message: string;
};

/**
 * Regras de inconsistência para a operação enxergar na Folha (linha vermelha).
 * O cálculo já descarta reentrada ilegal; aqui o alerta continua visível para ajuste.
 */
export function detectFolhaDayAnomalies<T extends FolhaPunchLike>(
  punches: T[],
  canon: CanonicalDayPunches<T>,
): FolhaDayAnomaly[] {
  const anomalies: FolhaDayAnomaly[] = [];
  const sorted = [...punches]
    .filter((p) => p && p.punch_at != null)
    .sort((a, b) => punchMs(a) - punchMs(b));
  if (sorted.length === 0) return anomalies;

  const { discarded: reentries } = stripIllegalDeviceReentries(sorted);
  for (const p of reentries) {
    anomalies.push({
      code: "illegal_reentry",
      severity: "erro",
      message: `Batida duplicada no aparelho às ${hhmmBRT(new Date(p.punch_at))} (< 5 min da anterior). Confira.`,
    });
  }

  if (canon.entry && canon.lunchOut) {
    const gap = (punchMs(canon.lunchOut) - punchMs(canon.entry)) / 60000;
    if (gap > 0 && gap < LUNCH_TOO_EARLY_MIN) {
      anomalies.push({
        code: "lunch_too_early",
        severity: "erro",
        message: `Almoço às ${hhmmBRT(new Date(canon.lunchOut.punch_at))} muito cedo após entrada ${hhmmBRT(new Date(canon.entry.punch_at))} (${Math.round(gap)} min). Não faz sentido — confira.`,
      });
    }
  }

  if (canon.flags.includes("open_shift")) {
    anomalies.push({
      code: "open_shift",
      severity: "aviso",
      message: "Ponto aberto — falta batida de saída.",
    });
  }

  if (sorted.length > 4) {
    anomalies.push({
      code: "too_many_punches",
      severity: "aviso",
      message: `${sorted.length} batidas no dia (esperado até 4). Extras ignoradas no cálculo — revise.`,
    });
  }

  if (canon.flags.includes("single_middle_no_lunch")) {
    anomalies.push({
      code: "incomplete_lunch",
      severity: "aviso",
      message: "Só uma batida no meio do dia — almoço incompleto.",
    });
  }

  return anomalies;
}

export function folhaObservation(anomalies: FolhaDayAnomaly[]): string | null {
  if (!anomalies.length) return null;
  return anomalies.map((a) => a.message).join(" ");
}
