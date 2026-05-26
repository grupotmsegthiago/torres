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
import { supabaseAdmin } from "./supabase";
import { computeWorkedHours, ymdBRT as ymdBRTcanon } from "./lib/hours-calc";
import {
  encryptSecret,
  decryptSecret,
  parseRhidDate,
  parseRhidAfdRecords,
  normalizeEvent,
  normalizeName,
  nameTokens,
  nameMatchScore,
  monthToFechamento,
} from "./lib/control-id-parsers";

export { encryptSecret, decryptSecret, monthToFechamento };

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


/**
 * Busca cadastro de usuários do aparelho — pra ajudar o admin a fazer mapping.
 */
export async function fetchUsers(device: DeviceRow): Promise<Array<{ id: string; name: string; matricula?: string; cpf?: string }>> {
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

async function fetchUsersRhid(device: DeviceRow): Promise<Array<{ id: string; name: string; matricula?: string; cpf?: string }>> {
  const token = await getOrLoginToken(device);

  // Endpoint correto conforme swagger RHID v2: GET /api.svc/person?start=0&length=N
  // Resposta: { records: PersonDTO[], total }
  // ATENÇÃO: a API do RHID rejeita length>200 com HTTP 500. Paginar de 100 em 100.
  const PAGE = 100;
  let curToken = token;
  const persons: any[] = [];
  for (let start = 0, page = 0; page < 200; start += PAGE, page++) {
    const personUrl = joinUrl(device.base_url, `/api.svc/person?start=${start}&length=${PAGE}`);
    let personRes = await tryFetch(personUrl, {
      headers: { "Authorization": `Bearer ${curToken}`, "Accept": "application/json" },
      timeoutMs: 20000,
    });
    if (personRes.status === 401 || personRes.status === 403) {
      curToken = await loginDevice(device);
      personRes = await tryFetch(personUrl, {
        headers: { "Authorization": `Bearer ${curToken}`, "Accept": "application/json" },
        timeoutMs: 20000,
      });
    }
    if (!personRes.ok) throw new Error(`RHID persons falhou: HTTP ${personRes.status}`);
    const personData = await personRes.json();
    const batch = Array.isArray(personData) ? personData : (personData?.records || personData?.data || []);
    if (batch.length === 0) break;
    persons.push(...batch);
    if (batch.length < PAGE) break;
  }

  return persons.map((p: any) => ({
    id: String(p.id || p.Id || p.PersonId || ""),
    name: String(p.name || p.Name || p.PersonName || ""),
    matricula: p.registration || p.Registration || p.pis || p.Pis || undefined,
    cpf: p.cpf != null ? String(p.cpf).replace(/\D/g, "") : undefined,
  }));
}

// ============================ CRIAR PESSOA NO RHID ============================

/**
 * Cria um funcionário no RHID Cloud (POST em person.svc).
 * Retorna o objeto criado contendo o `id` gerado pelo RHID.
 */
export async function createRhidPerson(deviceId: number, fields: Record<string, any>): Promise<any> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Criação de pessoa suportada apenas em RHID Cloud");

  const token = await getOrLoginToken(device as DeviceRow);
  // Endpoint oficial conforme Swagger RHID v2: POST /v2/api.svc/person
  // Body é um ARRAY de PersonDTO. Resposta: { status, success: [PersonDTO...], errors: [...] }
  // IMPORTANTE: a API do RHID exige TODOS os campos numéricos preenchidos (nem null nem undefined).
  // Campos não usados devem ir como 0 (números) ou false (booleanos) ou [] (arrays).
  const url = joinUrl(device.base_url, "/api.svc/person");
  const fullPayload = {
    name: fields.name,
    cpf: fields.cpf,
    pis: fields.pis,                                           // OBRIGATÓRIO e único no RHID
    registration: fields.registration,
    idCompany: fields.idCompany ?? 1,                          // Torres: empresa #1
    idDepartment: fields.idDepartment ?? 5,                    // Torres: depto TORRES ESCOLTA (id=5)
    status: fields.status ?? 1,                                // 1 = ativo
    isAdmin: fields.isAdmin ?? false,
    getTemplates: fields.getTemplates ?? false,
    numberOfTemplates: fields.numberOfTemplates ?? 0,
    code: fields.code ?? 0,
    password: fields.password ?? 0,
    rfid: fields.rfid ?? 0,
    barCode: fields.barCode ?? 0,
    linkedDeviceIds: fields.linkedDeviceIds ?? [],
    templates: fields.templates ?? [],
  };
  const body = JSON.stringify([fullPayload]);
  let curToken = token;
  let r = await tryFetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${curToken}`, "Content-Type": "application/json", "Accept": "application/json" },
    body,
    timeoutMs: 20000,
  });
  if (r.status === 401 || r.status === 403) {
    curToken = await loginDevice(device as DeviceRow);
    r = await tryFetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${curToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body,
      timeoutMs: 20000,
    });
  }
  if (!r.ok) {
    const txt = (await r.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`RHID POST person falhou: HTTP ${r.status} ${txt}`);
  }
  const json = await r.json().catch(() => ({} as any));
  // Formato esperado: { status: "OK", success: [PersonDTO...], errors: [{obj, reason}...] }
  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    const e0 = json.errors[0];
    throw new Error(`RHID rejeitou pessoa: ${e0?.reason || JSON.stringify(e0)}`);
  }
  const created = Array.isArray(json?.success) && json.success.length > 0 ? json.success[0] : null;
  if (created && (created.id ?? created.Id)) {
    console.log(`[RHID] POST person OK id=${created.id ?? created.Id}`);
    return created;
  }
  // Alguns retornos podem vir como objeto direto
  if (json?.id ?? json?.Id) return json;
  console.warn(`[RHID] POST person sem id no retorno: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

/**
 * Atualiza uma pessoa existente no RHID Cloud via PUT /api.svc/person (objeto único, não array).
 * Descobre o formato correto em produção: PUT com objeto único retorna 200; com array retorna 400.
 */
export async function updateRhidPerson(deviceId: number, personId: string | number, fields: Record<string, any>): Promise<void> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  const token = await getOrLoginToken(device as DeviceRow);
  const url = joinUrl(device.base_url, "/api.svc/person");
  // Busca dados atuais para não sobrescrever campos não fornecidos
  const getR = await tryFetch(joinUrl(device.base_url, `/api.svc/person/${personId}`), {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    timeoutMs: 10000,
  });
  const current = getR.ok ? await getR.json().catch(() => ({})) : {};
  const payload = { ...current, ...fields, id: Number(personId) };
  const r = await tryFetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 15000,
  });
  if (!r.ok) {
    const txt = (await r.text().catch(() => "")).slice(0, 200);
    throw new Error(`RHID PUT person falhou: HTTP ${r.status} ${txt}`);
  }
  console.log(`[RHID] PUT person id=${personId} OK`);
}

/**
 * Sincroniza o status ativo/inativo do nosso sistema com o RHID Cloud.
 * Busca o mapping do funcionário e atualiza o campo status (1=ativo, 0=inativo).
 * Silencioso se não houver mapping (funcionário não cadastrado no RHID ainda).
 */
export async function syncEmployeeStatusToRhid(employeeId: number, ourStatus: string): Promise<void> {
  try {
    // Busca mapping ativo para esse funcionário
    const { data: mappings } = await supabaseAdmin
      .from("control_id_users_map")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("ativo", true)
      .order("id", { ascending: false })
      .limit(1);
    if (!mappings || mappings.length === 0) return; // sem mapping, nada a fazer
    const map = mappings[0];
    const rhidStatus = ourStatus === "ativo" ? 1 : 0;
    await updateRhidPerson(Number(map.device_id), map.control_id_user_id, { status: rhidStatus });
    console.log(`[RHID] Funcionário #${employeeId} status sincronizado: ${ourStatus} → rhid status=${rhidStatus}`);
  } catch (e: any) {
    // Nunca bloqueia o fluxo principal — só loga
    console.warn(`[RHID] Falha ao sincronizar status do funcionário #${employeeId}:`, e.message);
  }
}

/**
 * Cadastra um funcionário do nosso sistema no Control iD/RHID:
 *   - Se já tem mapping ativo: retorna o existente (idempotente).
 *   - Se já existe no RHID com mesmo CPF: reaproveita e cria só o mapping.
 *   - Caso contrário: cria a pessoa no RHID (sem foto) e cria o mapping.
 *   - Faz backfill de batidas órfãs com o user_id resultante.
 */
export async function registerEmployeeInRhid(employeeId: number, deviceId?: number): Promise<{
  status: "created" | "linked_existing" | "already_mapped";
  rhidPersonId: string;
  deviceId: number;
  mappingId: number;
  punchesBackfilled: number;
}> {
  const { data: emp } = await supabaseAdmin
    .from("employees").select("id, name, cpf, pis, matricula, status")
    .eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error(`Funcionário #${employeeId} não encontrado`);
  if (!emp.cpf) throw new Error("Funcionário sem CPF cadastrado");
  if (!emp.name) throw new Error("Funcionário sem nome cadastrado");

  const cpfDigits = String(emp.cpf).replace(/\D/g, "");
  if (cpfDigits.length !== 11) throw new Error("CPF inválido");
  const pisDigits = String((emp as any).pis || "").replace(/\D/g, "");
  if (pisDigits.length !== 11) {
    throw new Error("Funcionário sem PIS válido. Cadastre o PIS (11 dígitos) antes de registrar no Control iD.");
  }

  // Acha device alvo (default: primeiro rhid_cloud)
  let device: any = null;
  if (deviceId) {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
    device = data;
  } else {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("tipo", "rhid_cloud").order("id").limit(1).maybeSingle();
    device = data;
  }
  if (!device) throw new Error("Nenhum aparelho Control iD configurado");
  const targetDeviceId = Number(device.id);

  // Já tem mapping ativo nesse device?
  const { data: existingMap } = await supabaseAdmin
    .from("control_id_users_map")
    .select("*")
    .eq("device_id", targetDeviceId)
    .eq("employee_id", employeeId)
    .eq("ativo", true)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingMap) {
    return {
      status: "already_mapped",
      rhidPersonId: String(existingMap.control_id_user_id),
      deviceId: targetDeviceId,
      mappingId: Number(existingMap.id),
      punchesBackfilled: 0,
    };
  }

  // Procura no RHID se já existe pessoa com mesmo CPF
  const persons = await fetchUsers(device as DeviceRow);
  const existingPerson = persons.find(p => p.cpf && p.cpf === cpfDigits);

  let rhidPersonId: string;
  let status: "created" | "linked_existing";

  if (existingPerson) {
    rhidPersonId = String(existingPerson.id);
    status = "linked_existing";
    // Ativa pessoa se estiver inativa (status=0) no RHID
    if ((existingPerson as any).status === 0 || (existingPerson as any).status === false) {
      try {
        await updateRhidPerson(targetDeviceId, rhidPersonId, { status: 1 });
        console.log(`[RHID] Pessoa id=${rhidPersonId} reativada automaticamente`);
      } catch (e) {
        console.warn(`[RHID] Não foi possível reativar pessoa id=${rhidPersonId}:`, e);
      }
    }
  } else {
    const created = await createRhidPerson(targetDeviceId, {
      name: emp.name,
      cpf: Number(cpfDigits),
      pis: Number(pisDigits),
      registration: emp.matricula || String(employeeId),
    });
    const newId = created?.id ?? created?.Id ?? created?.PersonId;
    if (!newId) {
      // Algumas instâncias do RHID não devolvem o id no POST — busca por CPF
      const refetched = await fetchUsers(device as DeviceRow);
      const found = refetched.find(p => p.cpf && p.cpf === cpfDigits);
      if (!found) throw new Error("Pessoa criada no RHID mas id não retornado");
      rhidPersonId = String(found.id);
    } else {
      rhidPersonId = String(newId);
    }
    status = "created";
  }

  // Cria mapping
  const { data: mapping, error: mapErr } = await supabaseAdmin.from("control_id_users_map").insert({
    device_id: targetDeviceId,
    employee_id: employeeId,
    control_id_user_id: rhidPersonId,
    control_id_user_name: emp.name,
    matricula: emp.matricula || null,
    ativo: true,
  }).select().single();
  if (mapErr) throw new Error(`Erro ao salvar mapping: ${mapErr.message}`);

  // Backfill de batidas órfãs
  const { data: backfilled } = await supabaseAdmin.from("control_id_punches")
    .update({ employee_id: employeeId })
    .eq("device_id", targetDeviceId)
    .eq("control_id_user_id", rhidPersonId)
    .is("employee_id", null)
    .select("id");

  return {
    status,
    rhidPersonId,
    deviceId: targetDeviceId,
    mappingId: Number(mapping.id),
    punchesBackfilled: (backfilled || []).length,
  };
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
    // Buffer defensivo de 6h: cobre eventuais batidas com timestamp passado,
    // diferenças de TZ entre RHID/banco e atrasos de gravação. Dedup por
    // external_id (upsert) garante idempotência.
    if (since) since = new Date(since.getTime() - 6 * 60 * 60 * 1000);
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
  const seenInBatch = new Set<string>(); // dedup intra-batch (RHID às vezes devolve repetido)
  for (const ev of events) {
    if (existingSet.has(ev.id)) { skipped++; continue; }
    if (seenInBatch.has(ev.id)) { skipped++; continue; }
    seenInBatch.add(ev.id);
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
    // upsert em lotes de 500 (Supabase limita ~1000 por chamada) com onConflict
    // pra evitar duplicate key violation se algum external_id escapou do dedup.
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("control_id_punches")
        .upsert(chunk, { onConflict: "device_id,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`Erro ao salvar batidas (lote ${i / CHUNK + 1}): ${error.message}`);
    }
  }

  await supabaseAdmin.from("control_id_devices").update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_message: `${saved} nova(s), ${mapped} mapeada(s), ${skipped} duplicada(s)`,
  }).eq("id", deviceId);

  console.log(`[ControlID] Sync device #${deviceId}: ${events.length} eventos, ${saved} novos, ${mapped} mapeados`);
  return { fetched: events.length, saved, mapped, skipped, message: `${saved} batida(s) nova(s)` };
}

// ============================ DIAGNÓSTICO DE SINCRONIZAÇÃO ============================

/**
 * Diagnóstico do pipeline RHID → control_id_punches → painel.
 * Identifica os 2 problemas mais comuns que silenciosamente "somem" com batidas:
 *  1) Funcionário ATIVO sem mapeamento em control_id_users_map (não recebe batida nenhuma).
 *  2) Batidas salvas com employee_id=NULL (RHID userId não está em mapeamento) —
 *     ficam órfãs no banco e não aparecem no painel/folha.
 * Retorna também resumo dos últimos syncs por device.
 */
export async function buildSyncDiagnostic(): Promise<any> {
  // ── 1. Funcionários ativos sem mapping ──
  const { data: emps } = await supabaseAdmin
    .from("employees").select("id, name, role").eq("status", "ativo").order("name");
  const empIds = (emps || []).map((e: any) => e.id);
  const { data: maps } = await supabaseAdmin
    .from("control_id_users_map")
    .select("employee_id, control_id_user_id, device_id, ativo")
    .in("employee_id", empIds);
  const mappedEmpIds = new Set(((maps || []) as any[]).filter(m => m.ativo).map(m => m.employee_id));
  const unmappedEmployees = (emps || []).filter((e: any) => !mappedEmpIds.has(e.id));

  // ── 2. Batidas órfãs (employee_id = null) nos últimos 7 dias ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
  const { data: orphans } = await supabaseAdmin
    .from("control_id_punches")
    .select("control_id_user_id, device_id, punch_at")
    .is("employee_id", null)
    .gte("punch_at", sevenDaysAgo)
    .order("punch_at", { ascending: false });

  const orphanByUser = new Map<string, { controlIdUserId: string; deviceId: number; count: number; lastPunchAt: string }>();
  for (const p of (orphans || []) as any[]) {
    const key = `${p.device_id}::${p.control_id_user_id}`;
    const cur = orphanByUser.get(key);
    if (!cur) {
      orphanByUser.set(key, { controlIdUserId: p.control_id_user_id, deviceId: p.device_id, count: 1, lastPunchAt: p.punch_at });
    } else {
      cur.count++;
      if (p.punch_at > cur.lastPunchAt) cur.lastPunchAt = p.punch_at;
    }
  }

  // Resolve nomes dos userIds órfãos consultando o RHID (cache simples por device)
  const { data: devices } = await supabaseAdmin
    .from("control_id_devices").select("*").eq("ativo", true);
  const personsByDevice = new Map<number, Map<string, string>>();
  for (const dev of (devices || []) as any[]) {
    try {
      const persons = await fetchUsers(dev as DeviceRow);
      const m = new Map<string, string>();
      persons.forEach(p => m.set(String(p.id), p.name));
      personsByDevice.set(dev.id, m);
    } catch {
      personsByDevice.set(dev.id, new Map());
    }
  }

  const orphanList = Array.from(orphanByUser.values()).map(o => ({
    controlIdUserId: o.controlIdUserId,
    deviceId: o.deviceId,
    rhidName: personsByDevice.get(o.deviceId)?.get(o.controlIdUserId) || null,
    punchCount: o.count,
    lastPunchAt: o.lastPunchAt,
  })).sort((a, b) => b.punchCount - a.punchCount);

  // ── 3. Status por device — inclui a batida mais recente do banco para detectar atraso RHID ──
  const deviceStatusPromises = ((devices || []) as any[]).map(async (d) => {
    const { data: lastP } = await supabaseAdmin
      .from("control_id_punches")
      .select("punch_at")
      .eq("device_id", d.id)
      .order("punch_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      id: d.id, nome: d.nome, tipo: d.tipo,
      lastSyncAt: d.last_sync_at, lastSyncStatus: d.last_sync_status, lastSyncMessage: d.last_sync_message,
      lastEventAt: lastP?.punch_at || null,
    };
  });
  const deviceStatus = await Promise.all(deviceStatusPromises);

  return {
    unmappedEmployees: (unmappedEmployees as any[]).map(e => ({ id: e.id, name: e.name, role: e.role })),
    orphanPunches: orphanList,
    orphanTotal: orphanList.reduce((a, b) => a + b.punchCount, 0),
    devices: deviceStatus,
    generatedAt: new Date().toISOString(),
  };
}

// ============================ AUTO-IMPORT PERSONS ↔ EMPLOYEES ============================


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

  // 1) Salva local PRIMEIRO (fonte da verdade do ERP, nunca perde o registro)
  const { data: punch, error } = await supabaseAdmin.from("control_id_punches").insert({
    device_id: mapping?.device_id || null,
    control_id_user_id: mapping?.control_id_user_id || null,
    employee_id: employeeId,
    punch_at: punchAt.toISOString(),
    direction,
    source,
    is_manual: true,
    external_id: null,
    rhid_synced_at: null,
    rhid_sync_error: mapping ? null : "Funcionário não mapeado a nenhum aparelho",
    raw_event: { manual: true, createdBy: "system" },
  }).select("id").single();
  if (error) throw new Error(`Erro ao salvar batida local: ${error.message}`);

  // 2) Enfileira push pro RHID (tenta agora; se falhar, cron retenta com backoff)
  let rhidSynced = false;
  let rhidError: string | undefined;
  if (mapping) {
    const r = await enqueueRhidSync({
      kind: "punch",
      op: "create",
      refId: punch.id,
      employeeId,
      deviceId: Number(mapping.device_id),
      payload: {
        rhidPersonId: String(mapping.control_id_user_id),
        dateTime: punchAt.toISOString(),
        tipo: 3,
      },
    });
    rhidSynced = r.pushedNow;
    rhidError = r.pushError;
  } else {
    rhidError = "Funcionário não mapeado a nenhum aparelho";
  }
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

  const { error } = await supabaseAdmin.from("control_id_punches").update(upd).eq("id", punchId);
  if (error) throw new Error(error.message);

  // Enfileira sync se tem external_id (já está no RHID)
  let rhidSynced = false;
  let rhidError: string | undefined;
  if (punch.external_id && punch.device_id) {
    const r = await enqueueRhidSync({
      kind: "punch",
      op: "update",
      refId: punchId,
      employeeId: punch.employee_id,
      deviceId: Number(punch.device_id),
      payload: {
        externalId: String(punch.external_id),
        dateTime: (fields.punchAt || new Date(punch.punch_at)).toISOString(),
      },
    });
    rhidSynced = r.pushedNow;
    rhidError = r.pushError;
  }
  return { ok: true, rhidSynced, rhidError };
}

/**
 * Deleta batida local. Se tem external_id no RHID, também enfileira o DELETE pro RHID.
 */
export async function deleteLocalPunch(punchId: number): Promise<{ ok: boolean; rhidQueued: boolean }> {
  const { data: punch } = await supabaseAdmin.from("control_id_punches").select("*").eq("id", punchId).maybeSingle();
  let rhidQueued = false;
  // Enfileira PRIMEIRO (com tryNow:false pra não atrasar a resposta).
  // Se o enqueue falhar (Supabase fora), abortamos antes de deletar local —
  // assim não perdemos a referência ao registro do RHID.
  if (punch?.external_id && punch?.device_id) {
    const r = await enqueueRhidSync({
      kind: "punch",
      op: "delete",
      refId: punchId,
      employeeId: punch.employee_id,
      deviceId: Number(punch.device_id),
      payload: { externalId: String(punch.external_id) },
      tryNow: false,
    });
    if (!r.queueId) {
      throw new Error("Não foi possível enfileirar exclusão no RHID — batida local preservada");
    }
    rhidQueued = true;
  }
  const { error } = await supabaseAdmin.from("control_id_punches").delete().eq("id", punchId);
  if (error) throw new Error(error.message);
  return { ok: true, rhidQueued };
}

// ============================ WRITE BACK PARA RHID ============================


/**
 * Cria uma batida manual no RHID Cloud (POST em afd.svc).
 */
export async function createRhidPunch(deviceId: number, rhidPersonId: string, dateTime: Date, tipo: number = 3): Promise<any> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Create punch suportado apenas em RHID Cloud");

  const token = await getOrLoginToken(device as DeviceRow);
  // ATENÇÃO: endpoint correto é `/customerdb/afd.svc/a` (com o `/a` final), confirmado via OPTIONS:
  // Allow: POST, PUT, PATCH, GET. Sem o `/a` retorna HTTP 404 (IIS).
  const url = joinUrl(device.base_url, `/customerdb/afd.svc/a`);
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

/**
 * Calcula progresso de sincronização: compara totais entre RHID e nosso banco.
 */
export async function getDeviceSyncProgress(deviceId: number): Promise<{
  deviceId: number;
  deviceName: string;
  rhidTotal: number;
  localTotal: number;
  missing: number;
  percent: number;
  rhidEmployees: number;
  mappedEmployees: number;
  unmappedEmployees: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  isRunning: boolean;
  rhidLastPunchAt: string | null;
  localLastPunchAt: string | null;
}> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);

  // Total no RHID (busca todos eventos sem date filter)
  let rhidTotal = 0, rhidEmployees = 0;
  let rhidLastPunchAt: string | null = null;
  try {
    const events = await fetchAllEvents(device as DeviceRow);
    rhidTotal = events.length;
    if (events.length > 0) {
      // ev.time já é uma string ISO; comparação lexicográfica funciona para ISO 8601
      rhidLastPunchAt = events.reduce((m, e) => (e.time > m ? e.time : m), events[0].time);
    }
    const persons = await fetchUsers(device as DeviceRow);
    rhidEmployees = persons.length;
  } catch (e: any) {
    console.error(`[ControlID] getDeviceSyncProgress fetch failed:`, e.message);
  }

  // Total local
  const { count: localTotal } = await supabaseAdmin.from("control_id_punches")
    .select("*", { count: "exact", head: true }).eq("device_id", deviceId);

  const { data: lastLocal } = await supabaseAdmin.from("control_id_punches")
    .select("punch_at").eq("device_id", deviceId)
    .order("punch_at", { ascending: false }).limit(1).maybeSingle();

  const { count: mappedEmployees } = await supabaseAdmin.from("control_id_users_map")
    .select("*", { count: "exact", head: true }).eq("device_id", deviceId).eq("ativo", true);

  const total = Number(localTotal || 0);
  const missing = Math.max(0, rhidTotal - total);
  const percent = rhidTotal > 0 ? Math.min(100, Math.round((total / rhidTotal) * 100)) : 100;

  // Considera "rodando" se status pendente/sincronizando OU last_sync_at < 90s atrás (cron ativo)
  const isRunning = device.last_sync_status === "sincronizando";

  return {
    deviceId: device.id,
    deviceName: device.nome,
    rhidTotal,
    localTotal: total,
    missing,
    percent,
    rhidEmployees,
    mappedEmployees: Number(mappedEmployees || 0),
    unmappedEmployees: Math.max(0, rhidEmployees - Number(mappedEmployees || 0)),
    lastSyncAt: device.last_sync_at,
    lastSyncStatus: device.last_sync_status,
    lastSyncMessage: device.last_sync_message,
    isRunning,
    rhidLastPunchAt,
    localLastPunchAt: lastLocal?.punch_at || null,
  };
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
export async function buildFolhaStats(
  employeeId: number,
  monthYear: string,
  opts: { multiplicadorHE?: number } = {},
): Promise<any> {
  const multiplicadorHE = opts.multiplicadorHE ?? 1.5; // CLT padrão 50%; CCT é 1.6 (60%)
  const dias = await buildFolhaPonto(employeeId, monthYear);
  const hoursWorked = dias.reduce((s, d: any) => s + (Number(d.hoursWorked) || 0), 0);
  const daysWorked = dias.filter((d: any) => Number(d.hoursWorked) > 0).length;

  // Pega salário vigente mais recente (cuja effective_date <= último dia do mês)
  const [yyyy, mm] = monthYear.split("-").map(Number);
  const monthEndStr = new Date(Date.UTC(yyyy, mm, 0)).toISOString().slice(0, 10);
  const { data: salaryRows } = await supabaseAdmin
    .from("employee_salaries")
    .select("base_salary, horas_mensais, encargos_pct, periculosidade_pct, vale_refeicao_diario, cesta_basica, effective_date")
    .eq("employee_id", employeeId)
    .lte("effective_date", monthEndStr)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);

  // Carrega cargo do funcionário pra resolver o CCT correto
  // (vigilante→vigilancia, limpeza→siemaco).
  const { data: empRow } = await supabaseAdmin
    .from("employees")
    .select("role")
    .eq("id", employeeId)
    .limit(1);
  const empRole = (empRow && empRow[0] && (empRow[0] as any).role) || "";
  const { getCctConfigByCargo } = await import("./lib/cct-config");
  const CCT = await getCctConfigByCargo(empRole);

  const sal = (salaryRows && salaryRows[0]) as any;
  const baseSalary = sal ? Number(sal.base_salary) || 0 : 0;
  const hoursLimit = sal && sal.horas_mensais ? Number(sal.horas_mensais) : 220;
  const encargosPct = sal && sal.encargos_pct != null ? Number(sal.encargos_pct) : 80;
  const periculosidadePct = sal && sal.periculosidade_pct != null ? Number(sal.periculosidade_pct) : CCT.periculosidadePct;
  const vrDiario = sal && sal.vale_refeicao_diario != null ? Number(sal.vale_refeicao_diario) : CCT.valeRefeicaoDia;
  let cestaBasica = sal && sal.cesta_basica != null ? Number(sal.cesta_basica) : CCT.cestaBasica;

  // ============================================================
  // Cesta Básica II (SIEMACO e similares) — aplicada por assiduidade.
  // Se o CCT do cargo tem `cestaBasicaIIFaixas`, busca atestados/faltas
  // justificadas aprovadas do mês em `employee_absences` e aplica a faixa.
  //   0 atestados  -> semFalta (valor cheio)
  //   1 atestado   -> umAtestado
  //   2 atestados  -> doisAtestados
  //   3+ atestados -> tresOuMaisAtestados (geralmente zero)
  // Sobrescreve `cestaBasica` (e ignora o que estiver em employee_salaries).
  // ============================================================
  let cestaBasicaIIAtestados = 0;
  let cestaBasicaIIFaixa: string | null = null;
  const faixas = (CCT as any).cestaBasicaIIFaixas as
    | { semFalta: number; umAtestado: number; doisAtestados: number; tresOuMaisAtestados: number }
    | undefined;
  if (faixas) {
    try {
      // Janela = competência de RH (ciclo 26 → 25), não mês civil.
      // Ex: monthYear="2026-05" → atestados de 26/abr a 25/mai.
      const { getPayrollPeriod } = await import("@shared/payroll-period");
      const periodAbs = getPayrollPeriod(yyyy, mm);
      const { data: absRows } = await supabaseAdmin
        .from("employee_absences")
        .select("id, type, start_date, end_date, status")
        .eq("employee_id", employeeId)
        .eq("status", "aprovado")
        .gte("start_date", `${periodAbs.startDate}T00:00:00`)
        .lte("start_date", `${periodAbs.endDate}T23:59:59`);
      const qualificados = (absRows || []).filter((a: any) => {
        const t = String(a.type || "").toLowerCase();
        // Conta atestado médico e qualquer falta justificada/afastamento aprovado.
        return t.includes("atestado") || t.includes("afasta") || t.includes("justif");
      });
      cestaBasicaIIAtestados = qualificados.length;
      if (cestaBasicaIIAtestados >= 3) {
        cestaBasica = faixas.tresOuMaisAtestados;
        cestaBasicaIIFaixa = "3+ atestados";
      } else if (cestaBasicaIIAtestados === 2) {
        cestaBasica = faixas.doisAtestados;
        cestaBasicaIIFaixa = "2 atestados";
      } else if (cestaBasicaIIAtestados === 1) {
        cestaBasica = faixas.umAtestado;
        cestaBasicaIIFaixa = "1 atestado";
      } else {
        cestaBasica = faixas.semFalta;
        cestaBasicaIIFaixa = "sem falta";
      }
    } catch (e: any) {
      console.error("[calcularFolha] erro ao calcular Cesta Básica II:", e?.message);
    }
  }

  // Dias úteis reais do mês (descontando feriados) — proporcional ao "decorrido"
  // quando o mês solicitado é o mês corrente em BRT: tudo que é mensal-fixo
  // (salário base, periculosidade, cesta básica, seguro de vida) é ratado por
  // dias corridos decorridos / total dias do mês; VR é por dias úteis efetivamente
  // decorridos. Mês fechado (anterior) usa o mês inteiro normalmente.
  // Dias úteis da competência de RH (26 → 25), não mês civil.
  const { countBusinessDays, loadHolidaySet, payrollPeriodRange } = await import("./routes/holidays");
  const { from, to } = payrollPeriodRange(yyyy, mm); // strings YYYY-MM-DD inclusivas
  const holidaySet = await loadHolidaySet(from, to);

  // "Agora" em BRT — calculado no frame da COMPETÊNCIA (26 → 25), não mês civil.
  // Mês passado     = período inteiro decorrido
  // Mês corrente    = ratea pelos dias decorridos desde o dia 26 do mês anterior
  // Mês futuro      = 0 (sem custo ainda)
  const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const periodStartBrt = new Date(`${from}T00:00:00-03:00`);
  const periodEndBrt = new Date(`${to}T23:59:59-03:00`);
  const isMesFuturo = nowBrt.getTime() < periodStartBrt.getTime();
  const isMesCorrente = !isMesFuturo && nowBrt.getTime() <= periodEndBrt.getTime();
  const msPerDay = 24 * 3600 * 1000;
  const totalDiasMes = Math.round(
    (periodEndBrt.getTime() - periodStartBrt.getTime()) / msPerDay,
  ) + 1; // ~30/31 dias do ciclo

  // cutoffIso = último dia (YYYY-MM-DD) já decorrido dentro da competência.
  let diasCorridosElapsed: number;
  let cutoffIso: string;
  if (isMesFuturo) {
    diasCorridosElapsed = 0;
    cutoffIso = from;
  } else if (isMesCorrente) {
    diasCorridosElapsed = Math.min(
      totalDiasMes,
      Math.floor((nowBrt.getTime() - periodStartBrt.getTime()) / msPerDay) + 1,
    );
    const cutoffDate = new Date(periodStartBrt.getTime() + (diasCorridosElapsed - 1) * msPerDay);
    const cy = cutoffDate.getFullYear();
    const cm = String(cutoffDate.getMonth() + 1).padStart(2, "0");
    const cd = String(cutoffDate.getDate()).padStart(2, "0");
    cutoffIso = `${cy}-${cm}-${cd}`;
  } else {
    diasCorridosElapsed = totalDiasMes;
    cutoffIso = to;
  }

  const diasUteisTotal = countBusinessDays(from, to, holidaySet);
  const diasUteis = isMesCorrente
    ? countBusinessDays(from, cutoffIso, holidaySet)
    : (isMesFuturo ? 0 : diasUteisTotal);
  const fatorRateio = totalDiasMes > 0 ? diasCorridosElapsed / totalDiasMes : 0;

  const horasNormais = Math.min(hoursWorked, hoursLimit);
  const horaExtra = Math.max(0, hoursWorked - hoursLimit);
  const valorHora = hoursLimit > 0 ? baseSalary / hoursLimit : 0;
  const valorHoraExtra = valorHora * multiplicadorHE;

  // Vencimentos (mensal-fixos ratados por dias corridos quando mês corrente)
  const baseSalaryReal = +(baseSalary * fatorRateio).toFixed(2);
  const periculosidade = +(baseSalaryReal * (periculosidadePct / 100)).toFixed(2);
  const custoExtra = +(valorHoraExtra * horaExtra).toFixed(2);
  const valeRefeicao = +(vrDiario * diasUteis).toFixed(2);
  const cestaBasicaReal = +(cestaBasica * fatorRateio).toFixed(2);

  // Diárias de missão (escolta/operacional) — soma de pagamentos lançados na
  // COMPETÊNCIA RH (26 → 25), não no mês civil.
  let diarias = 0;
  try {
    const cutoffStr = isMesCorrente || isMesFuturo ? cutoffIso : to;
    const { data: diariaRows } = await supabaseAdmin
      .from("operational_payments")
      .select("amount")
      .eq("employee_id", employeeId)
      .eq("type", "diaria")
      .gte("payment_date", from)
      .lte("payment_date", cutoffStr);
    if (Array.isArray(diariaRows)) {
      diarias = diariaRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    }
  } catch { /* tabela pode não existir em ambientes antigos */ }
  diarias = +diarias.toFixed(2);

  const vencimentosTotal = +(baseSalaryReal + periculosidade + custoExtra).toFixed(2);
  const beneficiosTotal = +(valeRefeicao + diarias + cestaBasicaReal).toFixed(2);

  // Recolhimentos sobre vencimentos brutos reais (base ratada + periculosidade + HE)
  const baseRecolhimentos = baseSalaryReal + periculosidade + custoExtra;
  const fgtsPct = (CCT as any).fgtsPct ?? 8;
  const inssPatronalPct = (CCT as any).inssPatronalPct ?? 20;
  const seguroVidaMensal = (CCT as any).seguroVidaMensal ?? 0;
  const fgts = +(baseRecolhimentos * (fgtsPct / 100)).toFixed(2);
  const inssPatronal = +(baseRecolhimentos * (inssPatronalPct / 100)).toFixed(2);
  const seguroVida = +(Number(seguroVidaMensal) * fatorRateio).toFixed(2);
  const recolhimentosTotal = +(fgts + inssPatronal + seguroVida).toFixed(2);

  const custoTotalEstimado = +(vencimentosTotal + beneficiosTotal + recolhimentosTotal).toFixed(2);
  const custoBase = baseSalaryReal;
  const custoComEncargos = +((custoBase + periculosidade + custoExtra) * (1 + encargosPct / 100) + beneficiosTotal).toFixed(2);

  // ===== Faturamento das OSs em que o funcionário participou no mês =====
  let faturamentoBruto = 0;
  let faturamentoEmpregado = 0;
  let faturamentoOsCount = 0;
  let faturamentoMargem = 0;
  try {
    const monthStartIso = `${monthYear}-01T00:00:00-03:00`;
    // Cap em "hoje" quando mês corrente, para refletir só o realizado
    const lastDayCap = (isMesCorrente && !isMesFuturo)
      ? String(nowBrt.getDate()).padStart(2, "0")
      : String(new Date(yyyy, mm, 0).getDate()).padStart(2, "0");
    const monthEndIso = `${monthYear}-${lastDayCap}T23:59:59-03:00`;
    const { data: osRows } = await supabaseAdmin
      .from("service_orders")
      .select("id, status, assigned_employee_id, assigned_employee_2_id")
      .or(`assigned_employee_id.eq.${employeeId},assigned_employee_2_id.eq.${employeeId}`)
      .gte("scheduled_date", monthStartIso)
      .lte("scheduled_date", monthEndIso)
      .not("status", "eq", "recusada");

    const osIds = (osRows || []).map((o: any) => o.id);
    if (osIds.length > 0) {
      const { data: billRows } = await supabaseAdmin
        .from("escort_billings")
        .select("service_order_id, fat_total, resultado_liquido")
        .in("service_order_id", osIds);
      for (const b of (billRows || [])) {
        const os = (osRows || []).find((o: any) => o.id === (b as any).service_order_id);
        const hasDoubleAgent = os && os.assigned_employee_id && os.assigned_employee_2_id;
        const share = hasDoubleAgent ? 0.5 : 1.0;
        const total = Number((b as any).fat_total || 0);
        const liquido = Number((b as any).resultado_liquido || 0);
        if (total > 0) {
          faturamentoBruto += total;
          faturamentoEmpregado += total * share;
          faturamentoMargem += liquido * share;
          faturamentoOsCount += 1;
        }
      }
    }
  } catch (err) {
    console.error("[buildFolhaStats] erro ao calcular faturamento:", err);
  }
  faturamentoBruto = +faturamentoBruto.toFixed(2);
  faturamentoEmpregado = +faturamentoEmpregado.toFixed(2);
  faturamentoMargem = +faturamentoMargem.toFixed(2);

  return {
    employeeId,
    monthYear,
    hoursWorked: +hoursWorked.toFixed(2),
    hoursLimit,
    horasNormais: +horasNormais.toFixed(2),
    horaExtra: +horaExtra.toFixed(2),
    horasRestantes: +Math.max(0, hoursLimit - hoursWorked).toFixed(2),
    percentUsed: hoursLimit > 0 ? +((hoursWorked / hoursLimit) * 100).toFixed(1) : 0,
    daysWorked,
    baseSalary: baseSalaryReal,
    baseSalaryMensal: baseSalary,
    valorHora: +valorHora.toFixed(2),
    valorHoraExtra: +valorHoraExtra.toFixed(2),
    custoExtra,
    custoBase: +custoBase.toFixed(2),
    // Novos componentes detalhados (ratados quando mês corrente)
    periculosidade,
    periculosidadePct,
    valeRefeicao,
    vrDiario,
    diasUteis,
    diasUteisTotal,
    diasCorridosElapsed,
    totalDiasMes,
    fatorRateio: +fatorRateio.toFixed(4),
    isMesCorrente,
    diarias,
    cestaBasica: cestaBasicaReal,
    cestaBasicaMensal: cestaBasica,
    cestaBasicaIIAtestados,
    cestaBasicaIIFaixa,
    cestaBasicaIIAplicada: !!faixas,
    vencimentosTotal,
    beneficiosTotal,
    // Recolhimentos detalhados
    fgts,
    fgtsPct,
    inssPatronal,
    inssPatronalPct,
    seguroVida,
    recolhimentosTotal,
    encargosPct,
    custoComEncargos,
    custoTotalEstimado,
    // Faturamento atribuído ao funcionário no mês
    faturamentoBruto,
    faturamentoEmpregado,
    faturamentoMargem,
    faturamentoOsCount,
    hasSalary: !!sal,
  };
}

/**
 * Espelho de Ponto Eletrônico no formato OFICIAL do RHID Cloud (Control iD).
 * Recebe período from/to (YYYY-MM-DD) e retorna estrutura completa por dia,
 * incluindo dias sem batidas, com jornada calculada (até 3 pares) e tratamentos.
 */
export async function buildEspelhoRhid(employeeId: number, fromYmd: string, toYmd: string): Promise<any> {
  const start = new Date(fromYmd + "T00:00:00-03:00");
  const end = new Date(toYmd + "T23:59:59-03:00");

  const { data: empData } = await supabaseAdmin
    .from("employees")
    .select("id, name, matricula, cpf, pis, role, hire_date, address, sindicato, category")
    .eq("id", employeeId)
    .maybeSingle();
  const employee = empData || {};

  const { data: punches } = await supabaseAdmin
    .from("control_id_punches")
    .select("id, punch_at, direction, source, control_id_user_id")
    .eq("employee_id", employeeId)
    .gte("punch_at", start.toISOString())
    .lte("punch_at", end.toISOString())
    .order("punch_at", { ascending: true });

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const ymdBRT = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  };

  const dayMap = new Map<string, any[]>();
  for (const p of (punches || [])) {
    const k = ymdBRT(p.punch_at);
    if (!dayMap.has(k)) dayMap.set(k, []);
    dayMap.get(k)!.push(p);
  }

  const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
  const days: any[] = [];

  // Itera dia a dia no período (inclui sem batida)
  const cur = new Date(fromYmd + "T12:00:00-03:00");
  const last = new Date(toYmd + "T12:00:00-03:00");
  let totalMin = 0;

  while (cur.getTime() <= last.getTime()) {
    const ymd = cur.toISOString().slice(0, 10);
    const wd = WEEKDAYS[cur.getDay()];
    const dayPunches = (dayMap.get(ymd) || []).sort((a: any, b: any) => new Date(a.punch_at).getTime() - new Date(b.punch_at).getTime());

    // Marcações brutas: lista de horários no campo "MARCAÇÕES REGISTRADAS NO PONTO ELETRÔNICO"
    const marcacoes = dayPunches.map((p: any) => fmt(p.punch_at));

    // Deduplica marcações por minuto pra montar jornada limpa
    const seen = new Set<string>();
    const cleanPunches: any[] = [];
    for (const p of dayPunches) {
      const t = fmt(p.punch_at);
      if (seen.has(t)) continue;
      seen.add(t);
      cleanPunches.push({ ...p, time: t });
    }

    // Monta jornada (até 3 pares ent/saí)
    const pairs: { ent: string; sai: string }[] = [];
    for (let i = 0; i + 1 < cleanPunches.length && pairs.length < 3; i += 2) {
      pairs.push({ ent: cleanPunches[i].time, sai: cleanPunches[i + 1].time });
    }
    const jornada = {
      ent1: pairs[0]?.ent || "", sai1: pairs[0]?.sai || "",
      ent2: pairs[1]?.ent || "", sai2: pairs[1]?.sai || "",
      ent3: pairs[2]?.ent || "", sai3: pairs[2]?.sai || "",
    };

    // Duração trabalhada
    let dayMin = 0;
    for (const pr of pairs) {
      const [eh, em] = pr.ent.split(":").map(Number);
      const [sh, sm] = pr.sai.split(":").map(Number);
      const diff = (sh * 60 + sm) - (eh * 60 + em);
      if (diff > 0) dayMin += diff;
    }
    const duracao = dayMin > 0 ? `${String(Math.floor(dayMin / 60)).padStart(2, "0")}:${String(dayMin % 60).padStart(2, "0")}` : "";
    totalMin += dayMin;

    // Tratamentos (ocorrências) sobre os dados originais
    const tratamentos: { horario: string; ocorr: string; motivo: string }[] = [];
    // 1) duplicatas de horário
    const counts = new Map<string, number>();
    for (const p of dayPunches) counts.set(fmt(p.punch_at), (counts.get(fmt(p.punch_at)) || 0) + 1);
    for (const [t, c] of Array.from(counts.entries())) {
      if (c > 1) tratamentos.push({ horario: t, ocorr: "D", motivo: "MARCAÇÃO DUPLICADA" });
    }
    // 2) origem da batida
    for (const p of cleanPunches) {
      const src = (p.source || "").toLowerCase();
      if (src.includes("manual") || src.includes("mobile") || src.includes("web")) {
        tratamentos.push({ horario: p.time, ocorr: "I", motivo: "MARCAÇÃO MOBILE/WEB" });
      } else if (src.includes("rhid") || src.includes("idface") || src.includes("control")) {
        tratamentos.push({ horario: p.time, ocorr: "I", motivo: "MARCAÇÃO IDFACE/IDFLEX" });
      }
    }
    // 3) ímpar (entrada sem saída)
    if (cleanPunches.length % 2 === 1) {
      tratamentos.push({ horario: cleanPunches[cleanPunches.length - 1].time, ocorr: "D", motivo: "ENTRADA SEM SAÍDA" });
    }

    days.push({
      date: ymd,
      label: `${String(cur.getDate()).padStart(2, "0")}/${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getFullYear()).slice(-2)}`,
      weekday: wd,
      marcacoes,
      jornada,
      duracao,
      ch: "00030",
      tratamentos,
    });

    cur.setDate(cur.getDate() + 1);
  }

  const totalHHMM = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

  return {
    company: {
      name: "TORRES VIGILANCIA PATRIMONIAL LTDA",
      cnpj: "36.982.392/0001-89",
      cei: "",
      endereco: "AV RAIMUNDO PEREIRA DE MAGALHÃES, 5720 - PIRITUBA - 02939000 - SÃO PAULO - SP",
    },
    employee: {
      id: employee.id,
      name: (employee.name || "").toUpperCase(),
      matricula: employee.matricula || "",
      cpf: employee.cpf || "",
      pis: employee.pis || employee.cpf || "",
      role: (employee.role || "").toUpperCase(),
      admissao: employee.hire_date ? new Date(employee.hire_date + "T12:00:00").toLocaleDateString("pt-BR") : "",
      centroCusto: (employee.category || "").toUpperCase() || "—",
      departamento: "TORRES",
    },
    periodo: { from: fromYmd, to: toYmd },
    days,
    totalHHMM,
    horariosContratuais: [
      { codigo: "00030", ent1: "04:00", sai1: "23:59", ent2: "", sai2: "" },
    ],
    emitidoEm: new Date().toLocaleString("pt-BR"),
  };
}

export async function buildPainelMes(monthYear: string): Promise<any[]> {
  // ciclo fechamento RHID
  const { start: monthStart, end: monthEnd } = monthToFechamento(monthYear);

  const todayBrt = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const todayMs = Date.now();
  const isCurrentMonth = todayMs >= monthStart.getTime() && todayMs < monthEnd.getTime();

  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, status")
    .ilike("role", "%vigilante%")
    .order("name", { ascending: true });

  if (!emps || emps.length === 0) return [];

  const empIds = emps.map((e: any) => e.id);

  const { data: maps } = await supabaseAdmin
    .from("control_id_users_map")
    .select("employee_id, ativo")
    .in("employee_id", empIds);
  const mappedSet = new Set(((maps || []) as any[]).filter(m => m.ativo).map(m => m.employee_id));

  const { data: punches } = await supabaseAdmin
    .from("control_id_punches")
    .select("employee_id, punch_at, source, device_id")
    .in("employee_id", empIds)
    .gte("punch_at", monthStart.toISOString())
    .lt("punch_at", monthEnd.toISOString())
    .order("punch_at", { ascending: true });

  const byEmp = new Map<number, any[]>();
  for (const p of (punches || []) as any[]) {
    if (!byEmp.has(p.employee_id)) byEmp.set(p.employee_id, []);
    byEmp.get(p.employee_id)!.push(p);
  }

  // ausências do mês
  const { data: absences } = await supabaseAdmin
    .from("employee_absences")
    .select("employee_id, type, start_date, end_date")
    .in("employee_id", empIds)
    .lte("start_date", monthEnd.toISOString().slice(0, 10))
    .gte("end_date", monthStart.toISOString().slice(0, 10));

  const absByEmp = new Map<number, any[]>();
  for (const a of (absences || []) as any[]) {
    if (!absByEmp.has(a.employee_id)) absByEmp.set(a.employee_id, []);
    absByEmp.get(a.employee_id)!.push(a);
  }

  // ── Primeira OS do dia (BRT) por funcionário — fonte para "em serviço" e dupla ──
  // Janela [todayBrt 00:00 BRT, todayBrt 23:59:59 BRT].
  const todayStartIso = `${todayBrt}T00:00:00-03:00`;
  const todayEndIso = `${todayBrt}T23:59:59-03:00`;
  const dutyByEmp = new Map<number, { osNumber: string | null; status: string | null; missionStatus: string | null; scheduledDate: string | null; partnerId: number | null; partnerName: string | null }>();
  if (isCurrentMonth) {
    // Inclui: (a) OS agendadas para hoje + (b) OS ainda em_andamento de qualquer
    // dia (missão aberta = funcionário em serviço, mesmo que tenha começado ontem).
    const [todayRes, openRes] = await Promise.all([
      supabaseAdmin
        .from("service_orders")
        .select("id, os_number, status, mission_status, scheduled_date, assigned_employee_id, assigned_employee_2_id")
        .gte("scheduled_date", todayStartIso)
        .lte("scheduled_date", todayEndIso)
        .order("scheduled_date", { ascending: true }),
      supabaseAdmin
        .from("service_orders")
        .select("id, os_number, status, mission_status, scheduled_date, assigned_employee_id, assigned_employee_2_id")
        .eq("status", "em_andamento")
        .order("scheduled_date", { ascending: true }),
    ]);
    const seenIds = new Set<number>();
    const todaySos: any[] = [];
    for (const so of [...((todayRes.data || []) as any[]), ...((openRes.data || []) as any[])]) {
      if (seenIds.has(so.id)) continue;
      seenIds.add(so.id);
      todaySos.push(so);
    }
    todaySos.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
    {
    const partnerIds = new Set<number>();
    for (const so of (todaySos || []) as any[]) {
      if (so.assigned_employee_id) partnerIds.add(so.assigned_employee_id);
      if (so.assigned_employee_2_id) partnerIds.add(so.assigned_employee_2_id);
    }
    const { data: partnerEmps } = partnerIds.size > 0
      ? await supabaseAdmin.from("employees").select("id, name").in("id", Array.from(partnerIds))
      : { data: [] as any[] };
    const empNameById = new Map<number, string>();
    for (const p of (partnerEmps || []) as any[]) empNameById.set(p.id, p.name);
    for (const so of (todaySos || []) as any[]) {
      const a = so.assigned_employee_id;
      const b = so.assigned_employee_2_id;
      if (a && !dutyByEmp.has(a)) {
        dutyByEmp.set(a, {
          osNumber: so.os_number || null, status: so.status || null,
          missionStatus: so.mission_status || null, scheduledDate: so.scheduled_date || null,
          partnerId: b || null, partnerName: b ? (empNameById.get(b) || null) : null,
        });
      }
      if (b && !dutyByEmp.has(b)) {
        dutyByEmp.set(b, {
          osNumber: so.os_number || null, status: so.status || null,
          missionStatus: so.mission_status || null, scheduledDate: so.scheduled_date || null,
          partnerId: a || null, partnerName: a ? (empNameById.get(a) || null) : null,
        });
      }
    }
    }
  }

  const HOURS_LIMIT = 220;
  const OPEN_PUNCH_MIN_GAP_MIN = 30; // se única batida + > 30min atrás → ponto em aberto

  const result: any[] = [];
  for (const e of emps as any[]) {
    const list = (byEmp.get(e.id) || []).sort((a, b) => new Date(a.punch_at).getTime() - new Date(b.punch_at).getTime());

    // ─── Cálculo CANÔNICO de horas (server/lib/hours-calc.ts) ───
    // Mesma fonte usada por relatorio-horas, fixed-costs e folha.
    const calc = computeWorkedHours(list);
    const totalMin = calc.totalMinutes;
    const daysWorked = calc.daysWorked;

    // dayMap ainda é necessário para o status de hoje (em aberto, completo, etc.)
    const dayMap = new Map<string, any[]>();
    for (const p of list) {
      const dayKey = ymdBRTcanon(p.punch_at);
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey)!.push(p);
    }

    const todayPunches = isCurrentMonth ? (dayMap.get(todayBrt) || []) : [];
    const lastPunch = list.length > 0 ? list[list.length - 1] : null;
    const penultPunch = list.length > 1 ? list[list.length - 2] : null;
    const lastPunchAt = lastPunch?.punch_at || null;
    const penultPunchAt = penultPunch?.punch_at || null;
    // Origem da batida:
    //   source = "manual"           → APP/Manual (criada via sistema)
    //   demais (com device_id)      → CONTROLID (relógio físico, com ou sem source preenchido)
    const punchOrigin = (p: any | null): "CONTROLID" | "APP" | null => {
      if (!p) return null;
      if (p.source === "manual") return "APP";
      if (p.device_id) return "CONTROLID";
      return null;
    };
    const lastPunchOrigin = punchOrigin(lastPunch);
    const lastPunchSource = lastPunch?.source || null;
    const penultPunchOrigin = punchOrigin(penultPunch);
    const penultPunchSource = penultPunch?.source || null;

    // ausência ativa hoje?
    const absToday = isCurrentMonth
      ? (absByEmp.get(e.id) || []).find(a => a.start_date <= todayBrt && a.end_date >= todayBrt)
      : null;

    // Turnos que cruzam a meia-noite (vigilância 12x36, 24h, etc.):
    // se a última batida do dia anterior ficou em número ímpar (entrada sem saída)
    // e ainda não houve batida hoje, o ponto continua "EM ABERTO" carregado de ontem.
    const yesterdayBrt = new Date(Date.now() - 3 * 3600000 - 24 * 3600000).toISOString().slice(0, 10);
    const yesterdayPunches = isCurrentMonth ? (dayMap.get(yesterdayBrt) || []) : [];
    // Cruzamento de meia-noite só vale se a última batida de ontem e a primeira de hoje
    // estiverem dentro de uma janela razoável de turno (≤5h). Caso contrário, são
    // turnos separados: a batida de ontem foi saída solta, e a de hoje é entrada nova.
    const SHIFT_CROSS_MAX_GAP_MIN = 5 * 60;
    let yesterdayOpen = yesterdayPunches.length > 0 && yesterdayPunches.length % 2 === 1;
    if (yesterdayOpen && todayPunches.length > 0) {
      const lastYestMs = new Date(yesterdayPunches[yesterdayPunches.length - 1].punch_at).getTime();
      const firstTodayMs = new Date(todayPunches[0].punch_at).getTime();
      const gapMin = (firstTodayMs - lastYestMs) / 60000;
      if (gapMin > SHIFT_CROSS_MAX_GAP_MIN) yesterdayOpen = false;
    }

    let todayStatus: string;
    let openSinceMinutes: number | null = null;
    if (!isCurrentMonth) {
      todayStatus = "MES_PASSADO";
    } else if (!mappedSet.has(e.id)) {
      todayStatus = "NAO_MAPEADO";
    } else if (absToday) {
      todayStatus = "AUSENCIA";
    } else if (todayPunches.length === 0 && yesterdayOpen) {
      todayStatus = "EM_ABERTO";
      const lastMs = new Date(yesterdayPunches[yesterdayPunches.length - 1].punch_at).getTime();
      openSinceMinutes = Math.round((Date.now() - lastMs) / 60000);
    } else if (todayPunches.length === 0) {
      todayStatus = "NAO_BATEU";
    } else if (todayPunches.length === 1) {
      const lastMs = new Date(todayPunches[0].punch_at).getTime();
      const gap = (Date.now() - lastMs) / 60000;
      // Se ontem ficou em aberto e a única batida de hoje é a saída,
      // o turno foi fechado — não é "em aberto".
      if (yesterdayOpen) {
        todayStatus = "COMPLETO";
      } else if (gap > OPEN_PUNCH_MIN_GAP_MIN) {
        todayStatus = "EM_ABERTO";
        openSinceMinutes = Math.round(gap);
      } else {
        todayStatus = "EM_ANDAMENTO";
      }
    } else if (todayPunches.length % 2 === 1) {
      // Se ontem ficou em aberto, a paridade efetiva inverte: ímpar de hoje = completo.
      if (yesterdayOpen) {
        todayStatus = "COMPLETO";
      } else {
        todayStatus = "EM_ABERTO";
        const lastMs = new Date(todayPunches[todayPunches.length - 1].punch_at).getTime();
        openSinceMinutes = Math.round((Date.now() - lastMs) / 60000);
      }
    } else {
      // Par hoje + ontem em aberto = ainda há um turno aberto que cruzou.
      if (yesterdayOpen) {
        todayStatus = "EM_ABERTO";
        const lastMs = new Date(todayPunches[todayPunches.length - 1].punch_at).getTime();
        openSinceMinutes = Math.round((Date.now() - lastMs) / 60000);
      } else {
        todayStatus = "COMPLETO";
      }
    }

    const hoursWorked = +(totalMin / 60).toFixed(2);
    const duty = dutyByEmp.get(e.id) || null;

    // Status unificado (regra Thiago): a OS é a fonte da verdade operacional.
    // Se o agente tem OS ativa escalada hoje, ele ESTÁ TRABALHANDO,
    // independente do que o relógio diz (ponto pode ter sido fechado cedo,
    // não batido, ou ele pode ter esquecido de bater entrada do novo turno).
    // O status do ponto vira informação secundária (pontoConflict) — exibido
    // como aviso ⚠️ no badge quando não bate com a realidade da OS.
    let unifiedStatus: string = todayStatus;
    let pontoConflict: "PONTO_FECHADO" | "SEM_BATIDA" | null = null;
    const dutyIsActive = !!duty && duty.status !== "concluida" && duty.status !== "cancelada" && duty.status !== "recusada";
    if (dutyIsActive && todayStatus !== "AUSENCIA") {
      unifiedStatus = "TRABALHANDO";
      if (todayStatus === "COMPLETO") pontoConflict = "PONTO_FECHADO";
      else if (todayStatus === "NAO_BATEU") pontoConflict = "SEM_BATIDA";
    }

    result.push({
      employeeId: e.id,
      name: e.name,
      role: e.role,
      status: e.status,
      mapped: mappedSet.has(e.id),
      hoursWorked,
      hoursLimit: HOURS_LIMIT,
      hoursRemaining: +(HOURS_LIMIT - hoursWorked).toFixed(2),
      percentUsed: +((hoursWorked / HOURS_LIMIT) * 100).toFixed(1),
      daysWorked,
      todayStatus,
      unifiedStatus,
      pontoConflict,
      todayPunchCount: todayPunches.length,
      openSinceMinutes,
      lastPunchAt,
      lastPunchSource,
      lastPunchOrigin,
      penultPunchAt,
      penultPunchSource,
      penultPunchOrigin,
      absenceType: absToday ? absToday.type : null,
      onDutyToday: !!duty,
      dutyOsNumber: duty?.osNumber || null,
      dutyStatus: duty?.status || null,
      dutyMissionStatus: duty?.missionStatus || null,
      dutyScheduledAt: duty?.scheduledDate || null,
      partnerId: duty?.partnerId || null,
      partnerName: duty?.partnerName || null,
    });
  }
  return result;
}

export async function buildFolhaPonto(employeeId: number, monthYear: string): Promise<any[]> {
  // ciclo fechamento: dia 26 do mês anterior até dia 25 do mês informado
  const { start, end } = monthToFechamento(monthYear);

  const { data: punches } = await supabaseAdmin
    .from("control_id_punches")
    .select("id, punch_at, direction, source, control_id_user_id")
    .eq("employee_id", employeeId)
    .gte("punch_at", start.toISOString())
    .lt("punch_at", end.toISOString())
    .order("punch_at", { ascending: true });

  if (!punches || punches.length === 0) return [];

  // Jornada diária base p/ cálculo de HE por dia: horas_mensais ÷ 25 dias úteis.
  // Fallback: 220h / 25 = 8h48min (528 min).
  const [yyyyJ, mmJ] = monthYear.split("-").map(Number);
  const monthEndStrJ = new Date(Date.UTC(yyyyJ, mmJ, 0)).toISOString().slice(0, 10);
  const { data: salRows } = await supabaseAdmin
    .from("employee_salaries")
    .select("horas_mensais, effective_date")
    .eq("employee_id", employeeId)
    .lte("effective_date", monthEndStrJ)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  const horasMensais = salRows && salRows[0] && salRows[0].horas_mensais ? Number(salRows[0].horas_mensais) : 220;
  const jornadaDiariaMin = (horasMensais * 60) / 25;

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
      punches: sorted.map((p: any) => ({
        id: p.id,
        punchAt: p.punch_at,
        time: fmt(p.punch_at),
        direction: p.direction,
        source: p.source,
      })),
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
      const extraMin = Math.max(0, workedMin - jornadaDiariaMin);
      entry.extraMin = Math.round(extraMin);
      entry.jornadaDiariaMin = Math.round(jornadaDiariaMin);
    } else {
      entry.extraMin = 0;
      entry.jornadaDiariaMin = Math.round(jornadaDiariaMin);
    }
    result.push(entry);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
//                      FILA DE SINCRONIZAÇÃO RHID (push)
// ============================================================================
//
// Toda escrita do ERP que precise repercutir no RHID Cloud deve passar por
// `enqueueRhidSync`. A função tenta o push imediato; se falhar (rede caiu,
// 5xx, timeout, etc.), o item fica em `rhid_sync_queue` com status='pending'
// e é reprocessado pelo cron a cada 5min com backoff exponencial.
//
// Tipos suportados HOJE:
//   - kind='punch'   op=create|update|delete  → endpoints afd.svc do RHID
//   - kind='employee' op=create|update         → endpoint person do RHID
//
// Tipo NÃO suportado ainda (fica como 'unsupported' até descobrir endpoint):
//   - kind='absence' (folgas/faltas/atestados) → RHID Cloud não expõe
//     endpoint REST público de "tratamentos"; precisa swagger fechado da
//     ControlId pra implementar. Itens ficam enfileirados com payload
//     completo, prontos pra reenviar quando o endpoint for cabeado.

const MAX_RHID_ATTEMPTS = 8;
// backoff em minutos por tentativa: 1, 5, 15, 60, 240, 720, 720, 720
function backoffMinutes(attempt: number): number {
  const steps = [1, 5, 15, 60, 240, 720, 720, 720];
  return steps[Math.min(attempt, steps.length - 1)];
}

export async function enqueueRhidSync(params: {
  kind: "punch" | "absence" | "employee";
  op: "create" | "update" | "delete";
  refId?: number | string | null;
  employeeId?: number | null;
  deviceId?: number | null;
  payload?: Record<string, any>;
  initialStatus?: "pending" | "unsupported";
  tryNow?: boolean;
}): Promise<{ queueId: number; pushedNow: boolean; pushError?: string }> {
  // Absence é sempre unsupported até endpoint RHID ser habilitado — força,
  // mesmo que o caller peça 'pending', pra evitar loop infinito de retries.
  const initialStatus = params.kind === "absence"
    ? "unsupported"
    : (params.initialStatus ?? "pending");
  const { data: row, error } = await supabaseAdmin.from("rhid_sync_queue").insert({
    kind: params.kind,
    op: params.op,
    ref_id: params.refId != null ? Number(params.refId) : null,
    employee_id: params.employeeId ?? null,
    device_id: params.deviceId ?? null,
    payload: params.payload ?? {},
    status: initialStatus,
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
  }).select("id").single();
  if (error) {
    console.error("[RHID-Q] Falha ao enfileirar:", error.message);
    return { queueId: 0, pushedNow: false, pushError: error.message };
  }
  const queueId = Number(row.id);

  if (initialStatus === "pending" && params.tryNow !== false) {
    try {
      await processRhidQueueItem(queueId);
      return { queueId, pushedNow: true };
    } catch (e: any) {
      return { queueId, pushedNow: false, pushError: e?.message };
    }
  }
  return { queueId, pushedNow: false };
}

async function processRhidQueueItem(queueId: number): Promise<void> {
  // Claim atômico: UPDATE WHERE status='pending' — se 0 linhas voltam,
  // outro worker (cron ou push imediato) já está processando esse item.
  const { data: claimed } = await supabaseAdmin.from("rhid_sync_queue")
    .update({ status: "processing" })
    .eq("id", queueId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!claimed) return; // já claimado por outro worker, ou item não existe / status ≠ pending

  try {
    const response = await executeRhidPush(claimed);
    await supabaseAdmin.from("rhid_sync_queue").update({
      status: "done",
      processed_at: new Date().toISOString(),
      rhid_response: response ?? null,
      last_error: null,
      attempts: (claimed.attempts || 0) + 1,
    }).eq("id", queueId);
  } catch (e: any) {
    const attempts = (claimed.attempts || 0) + 1;
    const giveUp = attempts >= MAX_RHID_ATTEMPTS;
    const nextAttemptAt = giveUp ? null : new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();
    await supabaseAdmin.from("rhid_sync_queue").update({
      status: giveUp ? "error" : "pending",
      attempts,
      last_error: String(e?.message || e).slice(0, 1000),
      next_attempt_at: nextAttemptAt,
      processed_at: giveUp ? new Date().toISOString() : null,
    }).eq("id", queueId);
    if (!giveUp) throw e;
  }
}

/**
 * Executa o push de um item da fila no RHID Cloud.
 * Retorna a resposta da API pra logar.
 */
async function executeRhidPush(item: any): Promise<any> {
  const kind = item.kind as string;
  const op = item.op as string;
  const payload = (item.payload || {}) as Record<string, any>;

  if (kind === "punch") {
    if (op === "create") {
      if (!item.device_id) throw new Error("device_id ausente na fila");
      if (!payload.rhidPersonId) throw new Error("rhidPersonId ausente no payload");
      if (!payload.dateTime) throw new Error("dateTime ausente no payload");
      const result = await createRhidPunch(
        Number(item.device_id),
        String(payload.rhidPersonId),
        new Date(payload.dateTime),
        Number(payload.tipo ?? 3),
      );
      // RHID pode retornar o ID em chaves diferentes — confirmado: POST /afd.svc/a devolve `newID`.
      // Mantém fallback pras outras grafias caso a API mude.
      const extractedId = result?.newID ?? result?.NewID ?? result?.newId ?? result?.NewId
        ?? result?.id ?? result?.Id ?? result?.ID ?? result?.idAfd
        ?? result?.IdAfd ?? result?.id_afd ?? result?.Punch?.id ?? result?.punch?.id;
      if (item.ref_id) {
        if (extractedId == null) {
          throw new Error(`RHID criou batida mas não retornou ID reconhecível. Resposta: ${JSON.stringify(result).slice(0, 300)}`);
        }
        await supabaseAdmin.from("control_id_punches").update({
          external_id: String(extractedId),
          rhid_synced_at: new Date().toISOString(),
          rhid_sync_error: null,
        }).eq("id", Number(item.ref_id));
      }
      return result;
    }
    if (op === "update") {
      if (!item.device_id) throw new Error("device_id ausente");
      if (!payload.externalId) throw new Error("externalId ausente");
      const result = await updateRhidPunch(Number(item.device_id), String(payload.externalId), {
        dateTime: new Date(payload.dateTime),
      });
      if (item.ref_id) {
        await supabaseAdmin.from("control_id_punches").update({
          rhid_synced_at: new Date().toISOString(),
          rhid_sync_error: null,
        }).eq("id", Number(item.ref_id));
      }
      return result;
    }
    if (op === "delete") {
      if (!item.device_id) throw new Error("device_id ausente");
      if (!payload.externalId) throw new Error("externalId ausente");
      return await deleteRhidPunch(Number(item.device_id), String(payload.externalId));
    }
  }

  if (kind === "employee") {
    if (!item.employee_id) throw new Error("employee_id ausente");
    if (op === "create" || op === "update") {
      // Resolve/cria mapping (registerEmployeeInRhid é idempotente)
      const reg = await registerEmployeeInRhid(Number(item.employee_id), item.device_id ?? undefined);
      // Empurra os campos atualizados (nome, status, matrícula, depto…) no RHID
      const { data: emp } = await supabaseAdmin.from("employees")
        .select("id, name, cpf, pis, matricula, status").eq("id", item.employee_id).maybeSingle();
      if (emp) {
        const fields: Record<string, any> = {
          name: emp.name,
          registration: emp.matricula || String(emp.id),
          status: emp.status === "ativo" ? 1 : 0,
        };
        await updateRhidPerson(reg.deviceId, reg.rhidPersonId, fields);
      }
      return { mappingId: reg.mappingId, rhidPersonId: reg.rhidPersonId, status: reg.status };
    }
    if (op === "delete") {
      // "Delete" no RHID = inativar (status=0). Não removemos a pessoa, só desligamos.
      const { data: maps } = await supabaseAdmin.from("control_id_users_map")
        .select("*").eq("employee_id", item.employee_id).eq("ativo", true);
      for (const m of (maps || [])) {
        try {
          await updateRhidPerson(Number(m.device_id), String(m.control_id_user_id), { status: 0 });
        } catch (e: any) {
          console.warn(`[RHID-Q] Falha ao inativar pessoa #${m.control_id_user_id}:`, e.message);
        }
      }
      return { inativated: (maps || []).length };
    }
  }

  if (kind === "absence") {
    // ENDPOINT AINDA NÃO IMPLEMENTADO no RHID Cloud público.
    // Itens ficam com status='unsupported' até descobrirmos a URL correta.
    throw new Error("Endpoint RHID para tratamentos (folgas/faltas) ainda não habilitado");
  }

  throw new Error(`kind/op não suportado: ${kind}/${op}`);
}

/**
 * Drena a fila: processa todos os itens 'pending' cujo next_attempt_at já passou.
 * Chamado pelo cron a cada 5min.
 */
export async function processRhidSyncQueue(maxItems: number = 50): Promise<{
  processed: number;
  done: number;
  failed: number;
}> {
  const nowIso = new Date().toISOString();
  const { data: items } = await supabaseAdmin.from("rhid_sync_queue")
    .select("id")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("id", { ascending: true })
    .limit(maxItems);

  let done = 0, failed = 0;
  for (const it of (items || [])) {
    try {
      await processRhidQueueItem(Number(it.id));
      done++;
    } catch {
      failed++;
    }
  }
  return { processed: (items || []).length, done, failed };
}

/**
 * Deleta uma batida no RHID Cloud (DELETE em afd.svc/{id}).
 */
export async function deleteRhidPunch(deviceId: number, rhidPunchId: string): Promise<any> {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} não encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Delete punch suportado apenas em RHID Cloud");
  const token = await getOrLoginToken(device as DeviceRow);
  const url = joinUrl(device.base_url, `/customerdb/afd.svc/${encodeURIComponent(rhidPunchId)}`);
  let r = await tryFetch(url, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    timeoutMs: 20000,
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device as DeviceRow);
    r = await tryFetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${newToken}`, "Accept": "application/json" },
      timeoutMs: 20000,
    });
  }
  if (!r.ok) throw new Error(`RHID DELETE punch falhou: ${r.status} ${await r.text().catch(() => "")}`);
  return { ok: true };
}
