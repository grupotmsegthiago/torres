/**
 * INTEGRAÇÃO CONTROL iD (iDFace MAX via Control iD Cloud / iDSecure Cloud)
 *
 * Estratégia:
 * 1) Login retorna session token (`/login` POST {login, password})
 * 2) Token cacheado no banco (sessionToken/sessionExpires) — re-loga se expirar
 * 3) load_objects POST {object, where, limit} para puxar usuários/eventos
 * 4) Cron de 5min puxa eventos novos desde lastSyncAt e persiste em controlIdPunches
 *
 * Senhas guardadas com AES-256-GCM no banco (CONTROLID_ENC_KEY ou SESSION_SECRET).
 */
import crypto from "node:crypto";
import { supabaseAdmin } from "./supabase";

// ============================ CRIPTOGRAFIA ============================

function getEncKey(): Buffer {
  const raw = process.env.CONTROLID_ENC_KEY || process.env.SESSION_SECRET || "torres-default-encryption-key-change-me-please-32";
  return crypto.createHash("sha256").update(raw).digest(); // 32 bytes
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

// ============================ TIPOS ============================

export interface DeviceRow {
  id: number;
  nome: string;
  tipo: string;
  base_url: string;
  login: string;
  password_enc: string;
  session_token: string | null;
  session_expires: string | null;
  ativo: boolean;
}

export interface ControlIdEvent {
  id: string;          // ID externo da batida
  userId: string;      // ID do usuário no aparelho
  userName?: string;
  time: string;        // ISO timestamp
  direction?: "in" | "out" | "unknown";
  source?: "facial" | "rfid" | "digital" | "senha";
  raw: any;
}

// ============================ HTTP CORE ============================

async function tryFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs || 15000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function joinUrl(base: string, path: string): string {
  return `${String(base).replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

// ============================ LOGIN ============================

/**
 * Faz login e retorna session token. Cacheado no banco (12h).
 */
export async function loginDevice(device: DeviceRow): Promise<string> {
  const password = decryptSecret(device.password_enc);

  if (device.tipo === "rhid_cloud") {
    return loginRhidCloud(device, password);
  }

  const candidates = [
    { url: joinUrl(device.base_url, "/login"), parse: (j: any) => j?.session || j?.token || j?.access_token },
    { url: joinUrl(device.base_url, "/api/login"), parse: (j: any) => j?.token || j?.access_token || j?.session },
    { url: joinUrl(device.base_url, "/api/auth/login"), parse: (j: any) => j?.token || j?.access_token },
  ];

  let lastErr = "";
  for (const c of candidates) {
    try {
      const r = await tryFetch(c.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: device.login, password, username: device.login }),
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const token = c.parse(j);
        if (token) {
          const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin.from("control_id_devices").update({
            session_token: token, session_expires: expires,
          }).eq("id", device.id);
          return token;
        }
        lastErr = `Endpoint ${c.url} respondeu OK mas sem token`;
      } else {
        lastErr = `${c.url} → HTTP ${r.status}`;
      }
    } catch (err: any) {
      lastErr = `${c.url} → ${err.message}`;
    }
  }
  throw new Error(`Falha no login Control iD: ${lastErr}`);
}

async function loginRhidCloud(device: DeviceRow, password: string): Promise<string> {
  const url = joinUrl(device.base_url, "/login.svc/");
  const r = await tryFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: device.login, password }),
    timeoutMs: 20000,
  });
  if (!r.ok) throw new Error(`RHID login falhou: HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  const token = j?.accessToken || j?.access_token || j?.token || "";
  if (!token) throw new Error("RHID login: resposta sem accessToken");
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.from("control_id_devices").update({
    session_token: token, session_expires: expires,
  }).eq("id", device.id);
  console.log(`[RHID] Login OK para ${device.login}`);
  return token;
}

async function getOrLoginToken(device: DeviceRow): Promise<string> {
  if (device.session_token && device.session_expires) {
    const expires = new Date(device.session_expires).getTime();
    if (expires > Date.now() + 60_000) return device.session_token;
  }
  return loginDevice(device);
}

// ============================ FETCH EVENTOS ============================

async function postJson(device: DeviceRow, token: string, path: string, body: any): Promise<any> {
  const url = joinUrl(device.base_url, path);
  let r = await tryFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Session": token, "Authorization": `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (r.status === 401 || r.status === 403) {
    // re-login e tenta de novo
    const newToken = await loginDevice(device);
    r = await tryFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Session": newToken, "Authorization": `Bearer ${newToken}` },
      body: JSON.stringify(body),
    });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`POST ${path} → HTTP ${r.status} ${txt.slice(0, 200)}`);
  }
  return r.json();
}

/**
 * Busca eventos (batidas) desde `since`. Tenta múltiplos endpoints conhecidos.
 */
export async function fetchEvents(device: DeviceRow, since: Date | null): Promise<ControlIdEvent[]> {
  if (device.tipo === "rhid_cloud") {
    return fetchEventsRhid(device, since);
  }

  const token = await getOrLoginToken(device);
  const sinceIso = since ? since.toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sinceUnix = Math.floor(new Date(sinceIso).getTime() / 1000);

  try {
    const j = await postJson(device, token, "/load_objects", {
      object: "access_logs",
      where: { time: { ">=": sinceUnix } },
      order: { time: "asc" },
      limit: 500,
    });
    const list = j?.access_logs || j?.events || j?.objects || [];
    if (Array.isArray(list)) return list.map(normalizeEvent);
  } catch {}

  try {
    const url = joinUrl(device.base_url, `/api/events?from=${encodeURIComponent(sinceIso)}&limit=500`);
    const r = await tryFetch(url, { headers: { "Authorization": `Bearer ${token}`, "Session": token } });
    if (r.ok) {
      const j = await r.json();
      const list = j?.events || j?.data || j || [];
      if (Array.isArray(list)) return list.map(normalizeEvent);
    }
  } catch {}

  try {
    const url = joinUrl(device.base_url, `/api/access_logs?since=${encodeURIComponent(sinceIso)}&limit=500`);
    const r = await tryFetch(url, { headers: { "Authorization": `Bearer ${token}`, "Session": token } });
    if (r.ok) {
      const j = await r.json();
      const list = j?.access_logs || j?.data || j || [];
      if (Array.isArray(list)) return list.map(normalizeEvent);
    }
  } catch {}

  return [];
}

function parseRhidDate(d: any): Date {
  if (!d) return new Date(0);
  if (typeof d === "string") {
    const m = d.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
    if (m) return new Date(parseInt(m[1]));
    return new Date(d);
  }
  return new Date(d);
}

async function fetchEventsRhid(device: DeviceRow, since: Date | null): Promise<ControlIdEvent[]> {
  const token = await getOrLoginToken(device);

  const afdUrl = joinUrl(device.base_url, "/customerdb/afd.svc/a");
  let afdRes = await tryFetch(afdUrl, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    timeoutMs: 60000,
  });
  if (afdRes.status === 401 || afdRes.status === 403) {
    const newToken = await loginDevice(device);
    afdRes = await tryFetch(afdUrl, {
      headers: { "Authorization": `Bearer ${newToken}`, "Accept": "application/json" },
      timeoutMs: 60000,
    });
  }
  if (!afdRes.ok) throw new Error(`RHID AFD falhou: HTTP ${afdRes.status}`);
  const afdData = await afdRes.json();
  return parseRhidAfdRecords(afdData, since);
}

/**
 * Busca TODOS os eventos do dispositivo (sem filtro de data) — para backfill histórico completo.
 */
export async function fetchAllEvents(device: DeviceRow): Promise<ControlIdEvent[]> {
  if (device.tipo === "rhid_cloud") {
    return fetchEventsRhid(device, new Date(0));
  }
  return fetchEvents(device, new Date(0));
}

function parseRhidAfdRecords(afdData: any, since: Date | null): ControlIdEvent[] {
  const records = Array.isArray(afdData) ? afdData : (afdData?.data || afdData?.records || []);
  const sinceMs = since ? since.getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000;
  const events: ControlIdEvent[] = [];

  for (const rec of records) {
    const punchDate = parseRhidDate(rec.dateTime || rec.DateTime || rec.PunchDate || rec.punchDate || rec.Date || rec.date);
    if (punchDate.getTime() <= 0 || punchDate.getTime() < sinceMs) continue;

    const personId = String(rec.idPerson || rec.IdPerson || rec.PersonId || rec.personId || rec.EmployeeId || rec.id || "");
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

  console.log(`[RHID] AFD: ${records.length} total, ${events.length} desde ${since?.toISOString() || "7d atrás"}`);
  return events;
}

function normalizeEvent(raw: any): ControlIdEvent {
  // ID externo: tenta vários nomes
  const id = String(raw.id ?? raw.event_id ?? raw.access_log_id ?? raw.uuid ?? `${raw.user_id || raw.userId}-${raw.time}`);
  // Timestamp: pode vir como unix segundos, unix ms, ou ISO string
  let t = raw.time ?? raw.timestamp ?? raw.date ?? raw.event_time ?? raw.access_time;
  let punchIso: string;
  if (typeof t === "number") {
    punchIso = new Date(t < 1e12 ? t * 1000 : t).toISOString();
  } else if (typeof t === "string") {
    // pode ser ISO ou epoch como string
    const num = Number(t);
    if (!isNaN(num) && num > 1e9) {
      punchIso = new Date(num < 1e12 ? num * 1000 : num).toISOString();
    } else {
      punchIso = new Date(t).toISOString();
    }
  } else {
    punchIso = new Date().toISOString();
  }
  // Direção: in/out
  const dirRaw = String(raw.direction || raw.flow || raw.tipo || raw.event || "").toLowerCase();
  let direction: "in" | "out" | "unknown" = "unknown";
  if (/in|entrada|1/.test(dirRaw)) direction = "in";
  else if (/out|saida|saída|2/.test(dirRaw)) direction = "out";
  // Source biométrico
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

/**
 * Busca cadastro de usuários do aparelho — pra ajudar o admin a fazer mapping.
 */
export async function fetchUsers(device: DeviceRow): Promise<Array<{ id: string; name: string; matricula?: string }>> {
  if (device.tipo === "rhid_cloud") {
    return fetchUsersRhid(device);
  }

  const token = await getOrLoginToken(device);
  try {
    const j = await postJson(device, token, "/load_objects", { object: "users", limit: 1000 });
    const list = j?.users || j?.objects || [];
    if (Array.isArray(list)) {
      return list.map((u: any) => ({
        id: String(u.id ?? u.user_id ?? u.userId),
        name: String(u.name || u.nome || u.user_name || ""),
        matricula: u.matricula || u.registration || u.pis || undefined,
      }));
    }
  } catch {}
  return [];
}

async function fetchUsersRhid(device: DeviceRow): Promise<Array<{ id: string; name: string; matricula?: string }>> {
  const token = await getOrLoginToken(device);

  const personUrl = joinUrl(device.base_url, "/customerdb/person.svc/a");
  let personRes = await tryFetch(personUrl, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    timeoutMs: 20000,
  });
  if (personRes.status === 401 || personRes.status === 403) {
    const newToken = await loginDevice(device);
    personRes = await tryFetch(personUrl, {
      headers: { "Authorization": `Bearer ${newToken}`, "Accept": "application/json" },
      timeoutMs: 20000,
    });
  }
  if (!personRes.ok) throw new Error(`RHID persons falhou: HTTP ${personRes.status}`);
  const personData = await personRes.json();
  const persons = Array.isArray(personData) ? personData : (personData?.data || personData?.records || []);

  return persons.filter((p: any) => !p.excluded).map((p: any) => ({
    id: String(p.id || p.Id || p.PersonId || ""),
    name: String(p.name || p.Name || p.PersonName || ""),
    matricula: p.registration || p.Registration || p.pis || p.Pis || undefined,
  }));
}

// ============================ TESTE DE CONEXÃO ============================

export async function testConnection(device: DeviceRow): Promise<{ ok: boolean; message: string; details?: any }> {
  try {
    await loginDevice(device);
    const users = await fetchUsers(device).catch(() => []);
    return { ok: true, message: `Conexão OK. ${users.length} usuário(s) encontrados no aparelho.`, details: { totalUsers: users.length } };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

// ============================ SYNC PERSISTENTE ============================

/**
 * Sincroniza batidas novas de 1 device. Persiste em control_id_punches (dedup por external_id).
 * Auto-mapeia employee_id se houver mapping ativo em control_id_users_map.
 */
export async function syncDevice(deviceId: number, opts: { fullBackfill?: boolean } = {}): Promise<{ fetched: number; saved: number; mapped: number; skipped: number; message: string }> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  if (!device.ativo && !opts.fullBackfill) return { fetched: 0, saved: 0, mapped: 0, skipped: 0, message: "Device inativo" };

  let since: Date | null = null;
  if (!opts.fullBackfill) {
    if (device.last_sync_at) since = new Date(device.last_sync_at);
    const { data: lastPunch } = await supabaseAdmin
      .from("control_id_punches")
      .select("punch_at")
      .eq("device_id", deviceId)
      .order("punch_at", { ascending: false })
      .limit(1).maybeSingle();
    if (lastPunch?.punch_at) since = new Date(lastPunch.punch_at);
  } else {
    since = new Date(0);
  }

  let events: ControlIdEvent[] = [];
  try {
    events = opts.fullBackfill
      ? await fetchAllEvents(device as DeviceRow)
      : await fetchEvents(device as DeviceRow, since);
  } catch (err: any) {
    await supabaseAdmin.from("control_id_devices").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "erro",
      last_sync_message: err.message,
    }).eq("id", deviceId);
    throw err;
  }

  if (events.length === 0) {
    await supabaseAdmin.from("control_id_devices").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "ok",
      last_sync_message: "Nenhuma batida nova",
    }).eq("id", deviceId);
    return { fetched: 0, saved: 0, mapped: 0, skipped: 0, message: "Nenhuma batida nova" };
  }

  // Carrega mapping (controlIdUserId → employeeId)
  const { data: mappings } = await supabaseAdmin
    .from("control_id_users_map")
    .select("control_id_user_id, employee_id")
    .eq("device_id", deviceId).eq("ativo", true);
  const mapByUserId = new Map<string, number>();
  (mappings || []).forEach((m: any) => mapByUserId.set(String(m.control_id_user_id), Number(m.employee_id)));

  // Carrega externalIds já existentes pra dedup
  const externalIds = events.map(e => e.id);
  const { data: existing } = await supabaseAdmin
    .from("control_id_punches")
    .select("external_id")
    .eq("device_id", deviceId)
    .in("external_id", externalIds);
  const existingSet = new Set((existing || []).map((e: any) => String(e.external_id)));

  let saved = 0, mapped = 0, skipped = 0;
  const toInsert: any[] = [];
  for (const ev of events) {
    if (existingSet.has(ev.id)) { skipped++; continue; }
    const employeeId = mapByUserId.get(ev.userId) || null;
    if (employeeId) mapped++;
    toInsert.push({
      device_id: deviceId,
      control_id_user_id: ev.userId,
      employee_id: employeeId,
      punch_at: ev.time,
      direction: ev.direction || "unknown",
      source: ev.source || null,
      raw_event: ev.raw,
      external_id: ev.id,
      processed: false,
    });
    saved++;
  }

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from("control_id_punches").insert(toInsert);
    if (error) throw new Error(`Erro ao salvar batidas: ${error.message}`);
  }

  await supabaseAdmin.from("control_id_devices").update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_message: `${saved} nova(s), ${mapped} mapeada(s), ${skipped} duplicada(s)`,
  }).eq("id", deviceId);

  console.log(`[ControlID] Sync device #${deviceId}: ${events.length} eventos, ${saved} novos, ${mapped} mapeados`);
  return { fetched: events.length, saved, mapped, skipped, message: `${saved} batida(s) nova(s)` };
}

// ============================ AUTO-IMPORT PERSONS ↔ EMPLOYEES ============================

function normalizeName(s: string): string {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function nameTokens(s: string): string[] {
  return normalizeName(s).split(" ").filter(t => t.length >= 3);
}

function nameMatchScore(a: string, b: string): number {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.includes(t)) common++;
  return common / Math.max(ta.length, tb.length);
}

/**
 * Importa todos os funcionários do aparelho RHID e tenta auto-mapear com employees locais por nome (fuzzy).
 * Cria mappings para os que casarem com score >= 0.5. Retorna lista de não-mapeados para mapping manual.
 */
export async function autoImportPersons(deviceId: number): Promise<{
  created: number;
  alreadyMapped: number;
  unmatched: Array<{ rhidId: string; rhidName: string }>;
  matched: Array<{ rhidId: string; rhidName: string; employeeId: number; employeeName: string; score: number }>;
}> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);

  const persons = await fetchUsers(device as DeviceRow);
  console.log(`[ControlID] Auto-import: ${persons.length} pessoas no aparelho`);

  const { data: employees } = await supabaseAdmin.from("employees").select("id, name").in("status", ["ativo", "active"]);
  const localList = (employees || []) as Array<{ id: number; name: string }>;

  const { data: existingMappings } = await supabaseAdmin
    .from("control_id_users_map").select("control_id_user_id")
    .eq("device_id", deviceId).eq("ativo", true);
  const mappedIds = new Set((existingMappings || []).map((m: any) => String(m.control_id_user_id)));

  const matched: any[] = [];
  const unmatched: any[] = [];
  let alreadyMapped = 0;
  const toInsert: any[] = [];

  for (const p of persons) {
    if (mappedIds.has(p.id)) { alreadyMapped++; continue; }

    let bestEmp: { id: number; name: string } | null = null;
    let bestScore = 0;
    for (const emp of localList) {
      const s = nameMatchScore(p.name, emp.name);
      if (s > bestScore) { bestScore = s; bestEmp = emp; }
    }

    if (bestEmp && bestScore >= 0.5) {
      toInsert.push({
        device_id: deviceId,
        employee_id: bestEmp.id,
        control_id_user_id: p.id,
        control_id_user_name: p.name,
        matricula: p.matricula || null,
        ativo: true,
      });
      matched.push({ rhidId: p.id, rhidName: p.name, employeeId: bestEmp.id, employeeName: bestEmp.name, score: Number(bestScore.toFixed(2)) });
    } else {
      unmatched.push({ rhidId: p.id, rhidName: p.name });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from("control_id_users_map").insert(toInsert);
    if (error) throw new Error(`Erro ao salvar mappings: ${error.message}`);

    // Backfill: associa batidas órfãs aos novos mappings
    for (const m of toInsert) {
      await supabaseAdmin.from("control_id_punches")
        .update({ employee_id: m.employee_id })
        .eq("device_id", deviceId)
        .eq("control_id_user_id", m.control_id_user_id)
        .is("employee_id", null);
    }
  }

  return { created: toInsert.length, alreadyMapped, matched, unmatched };
}

// ============================ BATIDA MANUAL (criada pelo nosso sistema) ============================

/**
 * Cria uma batida manualmente no nosso sistema E tenta sincronizar com o RHID.
 * Se o employee não estiver mapeado a nenhum aparelho, salva só local.
 */
export async function createManualPunch(params: {
  employeeId: number;
  punchAt: Date;
  direction?: string;
  source?: string;
  deviceId?: number;
}): Promise<{ punchId: number; rhidSynced: boolean; rhidError?: string }> {
  const { employeeId, punchAt, direction = "unknown", source = "manual" } = params;

  // Acha mapping ativo do employee
  let mapping: any = null;
  if (params.deviceId) {
    const { data } = await supabaseAdmin.from("control_id_users_map")
      .select("*").eq("employee_id", employeeId).eq("device_id", params.deviceId).eq("ativo", true).maybeSingle();
    mapping = data;
  } else {
    const { data } = await supabaseAdmin.from("control_id_users_map")
      .select("*").eq("employee_id", employeeId).eq("ativo", true).limit(1).maybeSingle();
    mapping = data;
  }

  // Tenta enviar pro RHID primeiro
  let rhidSynced = false;
  let rhidError: string | undefined;
  let externalId: string | null = null;
  if (mapping) {
    try {
      const result = await createRhidPunch(Number(mapping.device_id), String(mapping.control_id_user_id), punchAt, 3);
      rhidSynced = true;
      externalId = result?.id ? String(result.id) : null;
    } catch (e: any) {
      rhidError = e.message;
    }
  } else {
    rhidError = "Funcionário não mapeado a nenhum aparelho";
  }

  // Salva local (com referência ao RHID se sincronizou)
  const { data: punch, error } = await supabaseAdmin.from("control_id_punches").insert({
    device_id: mapping?.device_id || null,
    control_id_user_id: mapping?.control_id_user_id || null,
    employee_id: employeeId,
    punch_at: punchAt.toISOString(),
    direction,
    source,
    is_manual: true,
    external_id: externalId,
    rhid_synced_at: rhidSynced ? new Date().toISOString() : null,
    rhid_sync_error: rhidError || null,
    raw_event: { manual: true, createdBy: "system" },
  }).select("id").single();

  if (error) throw new Error(`Erro ao salvar batida local: ${error.message}`);
  return { punchId: punch.id, rhidSynced, rhidError };
}

/**
 * Atualiza batida local + tenta sincronizar com RHID se já estava sincronizada.
 */
export async function updateLocalPunch(punchId: number, fields: { punchAt?: Date; direction?: string }): Promise<{ ok: boolean; rhidSynced: boolean; rhidError?: string }> {
  const { data: punch } = await supabaseAdmin.from("control_id_punches").select("*").eq("id", punchId).maybeSingle();
  if (!punch) throw new Error("Batida não encontrada");

  const upd: any = {};
  if (fields.punchAt) upd.punch_at = fields.punchAt.toISOString();
  if (fields.direction !== undefined) upd.direction = fields.direction;

  // Tenta sincronizar com RHID se tem external_id
  let rhidSynced = false;
  let rhidError: string | undefined;
  if (punch.external_id && punch.device_id) {
    try {
      await updateRhidPunch(Number(punch.device_id), String(punch.external_id), {
        dateTime: fields.punchAt || new Date(punch.punch_at),
      });
      rhidSynced = true;
      upd.rhid_synced_at = new Date().toISOString();
      upd.rhid_sync_error = null;
    } catch (e: any) {
      rhidError = e.message;
      upd.rhid_sync_error = rhidError;
    }
  }

  const { error } = await supabaseAdmin.from("control_id_punches").update(upd).eq("id", punchId);
  if (error) throw new Error(error.message);
  return { ok: true, rhidSynced, rhidError };
}

/**
 * Deleta batida local. Se tem external_id no RHID, NÃO deleta lá (segurança) — apenas marca local.
 */
export async function deleteLocalPunch(punchId: number): Promise<{ ok: boolean }> {
  const { error } = await supabaseAdmin.from("control_id_punches").delete().eq("id", punchId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ============================ WRITE BACK PARA RHID ============================

/**
 * Atualiza um funcionário no RHID Cloud (PATCH em person.svc).
 */
export async function updateRhidPerson(deviceId: number, rhidPersonId: string, fields: Record<string, any>): Promise<any> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Update suportado apenas em RHID Cloud");

  const token = await getOrLoginToken(device as DeviceRow);
  const url = joinUrl(device.base_url, `/customerdb/person.svc/${rhidPersonId}`);
  let r = await tryFetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(fields),
    timeoutMs: 20000,
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device as DeviceRow);
    r = await tryFetch(url, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${newToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(fields),
      timeoutMs: 20000,
    });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`RHID PUT person falhou: HTTP ${r.status} ${txt.slice(0, 200)}`);
  }
  return await r.json().catch(() => ({}));
}

/**
 * Cria uma batida manual no RHID Cloud (POST em afd.svc).
 */
export async function createRhidPunch(deviceId: number, rhidPersonId: string, dateTime: Date, tipo: number = 3): Promise<any> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Create punch suportado apenas em RHID Cloud");

  const token = await getOrLoginToken(device as DeviceRow);
  const url = joinUrl(device.base_url, `/customerdb/afd.svc/`);
  const body = {
    idPerson: Number(rhidPersonId),
    dateTime: `/Date(${dateTime.getTime()}-0300)/`,
    Tipo: tipo,
    approvalStatus: 2,
  };
  let r = await tryFetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 20000,
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device as DeviceRow);
    r = await tryFetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${newToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 20000,
    });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`RHID POST punch falhou: HTTP ${r.status} ${txt.slice(0, 200)}`);
  }
  return await r.json().catch(() => ({}));
}

/**
 * Atualiza uma batida existente no RHID Cloud (PUT em afd.svc).
 */
export async function updateRhidPunch(deviceId: number, rhidPunchId: string, fields: Record<string, any>): Promise<any> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Update punch suportado apenas em RHID Cloud");

  const token = await getOrLoginToken(device as DeviceRow);
  const url = joinUrl(device.base_url, `/customerdb/afd.svc/${rhidPunchId}`);
  const body: any = { ...fields };
  if (fields.dateTime instanceof Date) {
    body.dateTime = `/Date(${fields.dateTime.getTime()}-0300)/`;
  }
  let r = await tryFetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 20000,
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device as DeviceRow);
    r = await tryFetch(url, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${newToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 20000,
    });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`RHID PUT punch falhou: HTTP ${r.status} ${txt.slice(0, 200)}`);
  }
  return await r.json().catch(() => ({}));
}

export async function syncAllDevices(): Promise<{ devices: number; totalSaved: number }> {
  const { data: devices } = await supabaseAdmin.from("control_id_devices").select("id").eq("ativo", true);
  if (!devices || devices.length === 0) return { devices: 0, totalSaved: 0 };
  let totalSaved = 0;
  for (const d of devices) {
    try {
      const r = await syncDevice(Number(d.id));
      totalSaved += r.saved;
    } catch (err: any) {
      console.error(`[ControlID] Sync device #${d.id} falhou:`, err.message);
    }
    await new Promise(res => setTimeout(res, 500));
  }
  return { devices: devices.length, totalSaved };
}

// ============================ FOLHA CONSOLIDADA ============================

/**
 * Gera folha de ponto consolidada (por funcionário, por dia) a partir das batidas.
 * Para cada dia: 1ª batida = entrada, última = saída, intermediárias = almoço.
 */
export async function buildFolhaPonto(employeeId: number, monthYear: string): Promise<any[]> {
  // monthYear = "2026-05"
  const [yyyy, mm] = monthYear.split("-").map(Number);
  const start = new Date(Date.UTC(yyyy, mm - 1, 1));
  const end = new Date(Date.UTC(yyyy, mm, 1));

  const { data: punches } = await supabaseAdmin
    .from("control_id_punches")
    .select("punch_at, direction, source, control_id_user_id")
    .eq("employee_id", employeeId)
    .gte("punch_at", start.toISOString())
    .lt("punch_at", end.toISOString())
    .order("punch_at", { ascending: true });

  if (!punches || punches.length === 0) return [];

  // Agrupa por dia (BRT)
  const dayMap = new Map<string, any[]>();
  for (const p of punches) {
    const dt = new Date(p.punch_at);
    const dayKey = new Date(dt.getTime() - 3 * 3600000).toISOString().slice(0, 10); // BRT
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
    dayMap.get(dayKey)!.push(p);
  }

  const result: any[] = [];
  for (const [day, dayPunches] of Array.from(dayMap.entries())) {
    const sorted = (dayPunches as any[]).sort((a: any, b: any) => new Date(a.punch_at).getTime() - new Date(b.punch_at).getTime());
    const fmt = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    const entry: any = {
      date: day,
      clockIn: sorted[0] ? fmt(sorted[0].punch_at) : null,
      lunchOut: sorted.length >= 4 ? fmt(sorted[1].punch_at) : null,
      lunchIn: sorted.length >= 4 ? fmt(sorted[2].punch_at) : null,
      clockOut: sorted.length >= 2 ? fmt(sorted[sorted.length - 1].punch_at) : null,
      totalPunches: sorted.length,
      sources: Array.from(new Set(sorted.map((p: any) => p.source).filter(Boolean))),
    };
    // calcula horas trabalhadas
    if (entry.clockIn && entry.clockOut) {
      const inMs = new Date(sorted[0].punch_at).getTime();
      const outMs = new Date(sorted[sorted.length - 1].punch_at).getTime();
      let workedMin = (outMs - inMs) / 60000;
      if (entry.lunchOut && entry.lunchIn && sorted.length >= 4) {
        const lunchMin = (new Date(sorted[2].punch_at).getTime() - new Date(sorted[1].punch_at).getTime()) / 60000;
        workedMin -= lunchMin;
      }
      entry.hoursWorked = (workedMin / 60).toFixed(2);
    }
    result.push(entry);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
