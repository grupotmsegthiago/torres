/**
 * Agente Central — atendimento a pedidos de atualização feitos DENTRO de um
 * grupo WhatsApp (ex: "OP. TMSEG X TORRES (EASP)").
 *
 * Fluxo (combinado com o dono em 29/05/2026):
 * 1. Chega mensagem de grupo (não nossa) no webhook.
 * 2. Filtro barato (keywords / nº de OS / citação) evita chamar IA à toa.
 * 3. IA classifica a intenção e extrai nº de OS + nomes de agentes.
 * 4. Resolve a OS: nº de OS no texto → mensagem citada → nome do agente entre
 *    OSs ativas → (fallback) grupo mapeado a cliente com 1 OS ativa.
 * 5. Cobra os agentes da OS por DM (mesmo padrão do cron-agent-central) e
 *    grava agent_central_reminders pra não duplicar com o cron.
 * 6. Responde NO GRUPO com um texto curto variado por IA, endereçado a quem
 *    pediu (1º nome). Fail-open pra uma frase padrão.
 * 7. Registra o pedido em agent_central_group_requests pra que a PRÓXIMA
 *    mission_update da OS seja encaminhada de volta ao grupo (vide mission.ts).
 *
 * Tudo aqui é fail-open: nunca lança pro webhook — no pior caso, não faz nada.
 */

import OpenAI from "openai";
import { supabaseAdmin } from "../supabase";
import { sendText, isZapiConfigured } from "./zapi";
import { normalizePhone } from "./normalize-contact";
import { buildKmResumoByOsId } from "../cron-whatsapp-forward";

const FINISHED_MISSION_STATUS = new Set([
  "encerrada", "retorno_base", "chegada_base", "finalizada", "cancelada", "recusada",
]);

// Filtro barato: só vale a pena chamar IA se a mensagem CHEIRA a pedido de
// atualização. Cobre nº de OS, menção a posição/situação e cobranças comuns.
const RE_OS = /\b(?:tor[-\s]?)?\d{3,5}\b/i;
const RE_KEYWORDS = /(atualiza|atualizar|atualização|posi[cç][aã]o|situa[cç][aã]o|status|nov[ai]dade|retorno|cad[eê]|onde\s+est|qap|previs[aã]o|chegou|chegando|j[aá]\s+chegou|alguma\s+not[ií]cia|alguma\s+previs)/i;

/** Pré-filtro barato: decide se vale chamar a IA. */
export function looksLikeUpdateRequest(text: string | null, hasQuoted: boolean): boolean {
  if (hasQuoted) return true; // citar uma atualização já é sinal forte (mesmo sem texto)
  const t = (text || "").trim();
  if (t.length < 3) return false;
  return RE_OS.test(t) || RE_KEYWORDS.test(t);
}

// Pedido de RESUMO geral do grupo: panorama das OS do cliente (ativas + finalizadas hoje).
const RE_RESUMO = /\b(resumo|resum[aã]o|panorama|relat[oó]rio\s+do\s+dia|como\s+est[aã]o\s+as\s+viagens|status\s+geral)\b/i;

/** Detecta se a mensagem é um pedido de resumo geral (não de uma OS específica). */
export function looksLikeSummaryRequest(text: string | null): boolean {
  const t = (text || "").trim();
  if (t.length < 4) return false;
  return RE_RESUMO.test(t);
}

// Pedido de "km final": alguém marca/responde a conversa de uma OS e escreve
// "km final" (ou "foto do km final"). O agente traz só os horários + KMs daquela OS.
const RE_KM_FINAL = /\bkm\s*final\b/i;
// Negações: "sem km final ainda", "ainda não veio o km final" — NÃO devem disparar.
const RE_KM_FINAL_NEG = /\b(sem|ainda|n[aã]o)\b/i;

/** Detecta se a mensagem pede o "km final" de uma OS (ignora negações). */
export function looksLikeFinalKm(text: string | null): boolean {
  const t = (text || "").trim();
  if (!RE_KM_FINAL.test(t)) return false;
  if (RE_KM_FINAL_NEG.test(t)) return false;
  return true;
}

const MISSION_STATUS_LABEL_PT: Record<string, string> = {
  aguardando: "Aguardando", agendada: "Agendada", aceita: "Aceita",
  deslocamento_inicio: "Deslocamento ao Início", no_local_origem: "No Local de Origem",
  em_transito: "Em Trânsito", em_transito_destino: "Em Trânsito ao Destino",
  no_local_destino: "No Local de Destino", em_apoio: "Em Apoio", pernoite: "Pernoite",
  encerrada: "Encerrada", finalizada: "Finalizada", cancelada: "Cancelada", recusada: "Recusada",
};
function fmtStatusPt(s?: string | null): string {
  const key = String(s || "").toLowerCase().trim();
  if (MISSION_STATUS_LABEL_PT[key]) return MISSION_STATUS_LABEL_PT[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
}

/** Encurta um endereço longo para "Cidade/UF" (best-effort). */
export function shortLocal(s?: string | null): string {
  if (!s) return "";
  const t = String(s).replace(/,?\s*Brasil\s*$/i, "").trim();
  const m = t.match(/([A-Za-zÀ-ÿ'.\s]+?)\s*[-,]\s*([A-Z]{2})\s*$/);
  if (m) return `${m[1].trim()}/${m[2]}`;
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || t;
}

/** Início do dia de hoje em BRT (UTC-3), como ISO com offset. */
function startOfTodayBrtIso(): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return `${today}T00:00:00-03:00`;
}
function fmtBrtNow(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
}

/** Adiciona "55" no início do número se ainda não tem código de país. */
function toIntlPhone(rawPhone: string | null): string | null {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return null;
}

/** Primeiro nome (pra endereçar a resposta sem expor nome completo). */
function firstName(full?: string | null): string {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0] || "";
}

interface ExtractResult {
  isUpdateRequest: boolean;
  osNumbers: string[];
  agentNames: string[];
}

/** Extração via IA: intenção + nº de OS + nomes de agentes citados. */
async function extractIntent(text: string): Promise<ExtractResult> {
  const fallback: ExtractResult = { isUpdateRequest: false, osNumbers: [], agentNames: [] };
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) {
    console.warn("[agent-central-mention] AI_INTEGRATIONS_OPENAI_API_KEY ausente — extractIntent desativado");
    return fallback;
  }
  try {
    const openai = new OpenAI({ apiKey, baseURL });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você analisa mensagens de um grupo de WhatsApp de uma empresa de escolta/segurança. O cliente usa o grupo para pedir atualização de status de uma missão (OS) em andamento.

Responda SOMENTE um JSON com este formato exato:
{"is_update_request": boolean, "os_numbers": string[], "agent_names": string[]}

- is_update_request: true se a mensagem pede/cobra uma atualização, posição, situação, previsão de chegada ou status de uma missão/agente. false se for conversa fiada, agradecimento, ou outra coisa.
- os_numbers: números de OS citados (ex: "TOR-0123", "0123", "123"). Vazio se nenhum.
- agent_names: primeiros nomes de pessoas/agentes citados de quem se cobra atualização. Vazio se nenhum.
NÃO invente. Só extraia o que está no texto.`,
        },
        { role: "user", content: text.slice(0, 800) },
      ],
    });
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      isUpdateRequest: parsed.is_update_request === true,
      osNumbers: Array.isArray(parsed.os_numbers) ? parsed.os_numbers.map((s: any) => String(s)) : [],
      agentNames: Array.isArray(parsed.agent_names) ? parsed.agent_names.map((s: any) => String(s)) : [],
    };
  } catch (e: any) {
    console.warn("[agent-central-mention] extractIntent falhou:", e?.message);
    return fallback;
  }
}

/** Normaliza "TOR-0123", "tor 123", "0123", "123" → dígitos sem zeros à esquerda. */
function osDigits(s: string): string {
  const m = String(s || "").match(/\d{1,6}/);
  if (!m) return "";
  return String(parseInt(m[0], 10));
}

interface ActiveOs {
  id: number;
  os_number: string | null;
  mission_status: string | null;
  mission_started_at: string | null;
  assigned_employee_id: number | null;
  assigned_employee_2_id: number | null;
}

/** Carrega todas as OSs ativas (em_andamento e não finalizadas). */
async function loadActiveOs(): Promise<ActiveOs[]> {
  const { data } = await supabaseAdmin
    .from("service_orders")
    .select("id, os_number, mission_status, mission_started_at, assigned_employee_id, assigned_employee_2_id, status")
    .eq("status", "em_andamento");
  return ((data || []) as any[]).filter(
    (o) => !FINISHED_MISSION_STATUS.has(String(o.mission_status || "").toLowerCase()),
  ) as ActiveOs[];
}

/** Extrai um nº de OS (TOR-0123) de um texto livre — usado em citações. */
function osNumberFromText(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/tor[-\s]?0*\d{2,5}/i);
  return m ? m[0] : null;
}

interface ResolveResult {
  os: ActiveOs | null;
  via: string;
}

/**
 * Resolve qual OS o pedido se refere, na ordem de confiança:
 * 1. nº de OS no texto, 2. nº de OS na mensagem citada,
 * 3. nome do agente entre OSs ativas, 4. grupo→cliente com 1 OS ativa.
 */
async function resolveOs(params: {
  extract: ExtractResult;
  quotedText: string | null;
  groupId: string;
}): Promise<ResolveResult> {
  const active = await loadActiveOs();
  if (active.length === 0) return { os: null, via: "sem OS ativa" };

  const byDigits = new Map<string, ActiveOs>();
  for (const o of active) {
    const d = osDigits(o.os_number || "");
    if (d) byDigits.set(d, o);
  }

  // 1. nº de OS explícito no texto
  for (const raw of params.extract.osNumbers) {
    const d = osDigits(raw);
    if (d && byDigits.has(d)) return { os: byDigits.get(d)!, via: `nº OS ${raw}` };
  }

  // 2. nº de OS na mensagem citada
  const quotedOs = osNumberFromText(params.quotedText);
  if (quotedOs) {
    const d = osDigits(quotedOs);
    if (d && byDigits.has(d)) return { os: byDigits.get(d)!, via: `OS citada ${quotedOs}` };
  }

  // 3. nome do agente entre OSs ativas
  if (params.extract.agentNames.length > 0) {
    const empIds = new Set<number>();
    for (const o of active) {
      if (o.assigned_employee_id) empIds.add(o.assigned_employee_id);
      if (o.assigned_employee_2_id) empIds.add(o.assigned_employee_2_id);
    }
    if (empIds.size > 0) {
      const { data: emps } = await supabaseAdmin
        .from("employees")
        .select("id, name")
        .in("id", Array.from(empIds));
      const empById = new Map<number, string>();
      for (const e of (emps || []) as any[]) empById.set(e.id, String(e.name || ""));
      for (const nameRaw of params.extract.agentNames) {
        const needle = firstName(nameRaw).toLowerCase();
        if (!needle || needle.length < 3) continue;
        for (const o of active) {
          const n1 = empById.get(o.assigned_employee_id || -1) || "";
          const n2 = empById.get(o.assigned_employee_2_id || -1) || "";
          if (n1.toLowerCase().includes(needle) || n2.toLowerCase().includes(needle)) {
            return { os: o, via: `agente "${nameRaw}"` };
          }
        }
      }
    }
  }

  // 4. grupo mapeado a um cliente com exatamente 1 OS ativa
  try {
    const { data: cli } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("whatsapp_group_id", params.groupId)
      .maybeSingle();
    if (cli?.id) {
      // recarrega client_id das ativas (não veio no select inicial)
      const { data: withClient } = await supabaseAdmin
        .from("service_orders")
        .select("id, client_id")
        .in("id", active.map((o) => o.id));
      const clientByOs = new Map<number, number>();
      for (const r of (withClient || []) as any[]) clientByOs.set(r.id, r.client_id);
      const matches = active.filter((o) => clientByOs.get(o.id) === cli.id);
      if (matches.length === 1) return { os: matches[0], via: "única OS ativa do grupo" };
    }
  } catch { /* fail-open */ }

  return { os: null, via: "não resolvida" };
}

/** Cobra os agentes da OS por DM. Retorna nº de agentes notificados. */
async function cobrarAgentes(os: ActiveOs): Promise<number> {
  const empIds = [os.assigned_employee_id, os.assigned_employee_2_id].filter(Boolean) as number[];
  if (empIds.length === 0) return 0;
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, phone")
    .in("id", empIds);
  const msg = [
    `*Central Torres*`,
    ``,
    `Solicitação de atualização recebida pelo cliente.`,
    `Por gentileza, informe a atualização da missão via sistema agora.`,
    ``,
    `OS: ${os.os_number || `#${os.id}`}`,
  ].join("\n");

  let sent = 0;
  for (const e of (emps || []) as any[]) {
    const intl = toIntlPhone(e.phone);
    if (!intl) continue;
    try {
      const r = await sendText({ groupOrPhone: intl, message: msg });
      if (r.ok) sent++;
    } catch { /* ignora individual */ }
  }

  if (sent > 0) {
    // Marca no agent_central_reminders pra o cron não cobrar de novo já já.
    await supabaseAdmin
      .from("agent_central_reminders")
      .upsert(
        { service_order_id: os.id, last_reminded_at: new Date().toISOString(), reminder_count: 1 },
        { onConflict: "service_order_id" },
      )
      .then(() => {}, () => {});
  }
  return sent;
}

/** Gera a confirmação variada pro grupo. Fail-open pra frase padrão. */
async function buildAck(requesterName: string, osNumber: string | null): Promise<string> {
  const nome = firstName(requesterName);
  const saud = nome ? `${nome}, ` : "";
  const fallback = `${saud ? saud.charAt(0).toUpperCase() + saud.slice(1) : ""}entendido! Já estou solicitando a atualização aos agentes. Assim que eles reportarem, retorno aqui.`;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return fallback;
  try {
    const openai = new OpenAI({ apiKey, baseURL });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: `Você é a "Central Torres", atendente de uma empresa de escolta/segurança, respondendo num grupo de WhatsApp do cliente. Gere UMA resposta curta (1 a 2 frases), cordial e profissional, confirmando que recebeu o pedido e que VAI solicitar a atualização aos agentes agora, e que retorna assim que tiver. Varie SEMPRE o jeito de falar pra não soar robótico. Português brasileiro. Não use emojis em excesso (no máximo 1). Não invente horários nem dados. Se houver nome da pessoa, cumprimente pelo nome. Responda só com a mensagem, sem aspas.`,
        },
        {
          role: "user",
          content: `Nome de quem pediu: ${nome || "(desconhecido)"}. ${osNumber ? `OS: ${osNumber}.` : ""}`,
        },
      ],
    });
    const out = response.choices?.[0]?.message?.content?.trim();
    return out || fallback;
  } catch (e: any) {
    console.warn("[agent-central-mention] buildAck falhou:", e?.message);
    return fallback;
  }
}

/** Extrai texto da mensagem citada do payload cru da Z-API (best-effort). */
function extractQuotedText(rawBody: any): string | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const candidates = [
    rawBody.referencedMessage,
    rawBody.quotedMsg,
    rawBody.quotedMessage,
    rawBody.message?.quotedMsg,
    rawBody.text?.referencedMessage,
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    const t = c.text?.message || c.message || c.text || c.body || c.caption || c.conversation;
    if (t && typeof t === "string") return t;
  }
  return null;
}

/** Pega o ID da mensagem citada (resposta) do payload cru da Z-API. */
function extractQuotedId(rawBody: any): string | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  return (
    rawBody.referenceMessageId ||
    rawBody.referencedMessageId ||
    rawBody.text?.referenceMessageId ||
    rawBody.image?.referenceMessageId ||
    rawBody.referencedMessage?.messageId ||
    rawBody.quotedMsgId ||
    null
  );
}

/**
 * Busca o corpo de uma mensagem citada no nosso histórico (whatsapp_messages).
 * A citada costuma ser o nosso próprio card de atualização, que contém "OS TOR-XXXX".
 */
async function lookupQuotedBody(messageId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("body")
      .eq("zapi_message_id", messageId)
      .limit(1)
      .maybeSingle();
    const b = (data as any)?.body;
    return typeof b === "string" && b.trim() ? b : null;
  } catch {
    return null;
  }
}

export interface ParsedGroupMsg {
  chatId: string;
  isGroup: boolean;
  fromMe: boolean;
  senderName: string | null;
  senderPhone: string | null;
  text: string | null;
  zapiMessageId: string | null;
}

interface SummaryOs {
  id: number;
  os_number: string | null;
  mission_status: string | null;
  status: string | null;
  origin: string | null;
  destination: string | null;
  escorted_vehicle_plate: string | null;
  completed_date: string | null;
  mission_started_at: string | null;
}

/**
 * Monta o texto do resumo das OS de um cliente (ativas + finalizadas hoje).
 * Pura: só lê do banco e devolve a string — não envia nada. Retorna null se
 * o grupo não está vinculado a nenhum cliente. Testável isoladamente.
 */
export async function buildClientSummaryByGroup(groupId: string): Promise<string | null> {
  const { data: cli } = await supabaseAdmin
    .from("clients")
    .select("id, name")
    .eq("whatsapp_group_id", groupId)
    .maybeSingle();
  if (!cli?.id) return null;

  const clienteNome = String((cli as any).name || "").toUpperCase();
  const startIso = startOfTodayBrtIso();
  const sel = "id, os_number, mission_status, status, origin, destination, escorted_vehicle_plate, completed_date, mission_started_at";

  // Ativas (em andamento, não finalizadas).
  const { data: activeRows } = await supabaseAdmin
    .from("service_orders")
    .select(sel)
    .eq("client_id", cli.id)
    .eq("status", "em_andamento");
  const active = ((activeRows || []) as SummaryOs[])
    .filter((o) => !FINISHED_MISSION_STATUS.has(String(o.mission_status || "").toLowerCase()))
    .sort((a, b) => String(a.mission_started_at || "").localeCompare(String(b.mission_started_at || "")));

  // Finalizadas hoje: intervalo fechado-aberto BRT [início de hoje, início de
  // amanhã); exclui canceladas/recusadas. O limite superior evita que registros
  // com completed_date futuro (erro de dados) entrem na contagem.
  const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data: doneRows } = await supabaseAdmin
    .from("service_orders")
    .select(sel)
    .eq("client_id", cli.id)
    .gte("completed_date", startIso)
    .lt("completed_date", endIso)
    .not("status", "in", "(cancelada,recusada)");
  const activeIds = new Set(active.map((o) => o.id));
  const doneToday = ((doneRows || []) as SummaryOs[])
    .filter((o) => !activeIds.has(o.id))
    .sort((a, b) => String(b.completed_date || "").localeCompare(String(a.completed_date || "")));

  const L: string[] = [];
  L.push(`🛡️ *TORRES VIGILÂNCIA PATRIMONIAL*`);
  L.push(`📋 *RESUMO DO DIA*${clienteNome ? ` — ${clienteNome}` : ""}`);
  L.push(`🗓️ ${fmtBrtNow()}`);
  L.push("");
  L.push(`🚦 *EM ANDAMENTO:* ${active.length}   |   ✅ *FINALIZADAS HOJE:* ${doneToday.length}`);

  if (active.length === 0 && doneToday.length === 0) {
    L.push("");
    L.push(`No momento não há viagens em andamento nem finalizadas hoje.`);
  }

  if (active.length > 0) {
    L.push("");
    L.push(`▶️ *EM ANDAMENTO*`);
    for (const o of active) {
      const placa = o.escorted_vehicle_plate || "—";
      L.push(`• *OS ${o.os_number || `#${o.id}`}* | 🚛 ${placa} | _${fmtStatusPt(o.mission_status)}_`);
      const rota = [shortLocal(o.origin), shortLocal(o.destination)].filter(Boolean).join(" → ");
      if (rota) L.push(`   ${rota}`);
    }
  }

  if (doneToday.length > 0) {
    L.push("");
    L.push(`✅ *FINALIZADAS HOJE*`);
    for (const o of doneToday) {
      const placa = o.escorted_vehicle_plate || "—";
      L.push(`• *OS ${o.os_number || `#${o.id}`}* | 🚛 ${placa}`);
      const rota = [shortLocal(o.origin), shortLocal(o.destination)].filter(Boolean).join(" → ");
      if (rota) L.push(`   ${rota}`);
    }
  }

  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Throttle em memória: evita reenviar resumo ao mesmo grupo em rajada (replay
// de webhook ou cliente mandando "resumo" várias vezes seguidas). O módulo é
// cacheado pelo ESM, então o Map persiste entre chamadas do webhook.
const summaryThrottle = new Map<string, number>();
const SUMMARY_THROTTLE_MS = 60_000;

/**
 * Responde NO GRUPO com um panorama das OS do cliente vinculado àquele grupo:
 * OS ativas (em andamento) + OS finalizadas hoje (BRT). Fail-open.
 */
export async function handleGroupSummaryRequest(parsed: ParsedGroupMsg): Promise<void> {
  try {
    const last = summaryThrottle.get(parsed.chatId) || 0;
    if (Date.now() - last < SUMMARY_THROTTLE_MS) {
      console.log(`[agent-central-mention] resumo do grupo ${parsed.chatId} ignorado (throttle ${SUMMARY_THROTTLE_MS / 1000}s)`);
      return;
    }
    const msg = await buildClientSummaryByGroup(parsed.chatId);
    if (!msg) {
      console.log(`[agent-central-mention] resumo pedido no grupo ${parsed.chatId} mas grupo não está vinculado a nenhum cliente — ignorando`);
      return;
    }
    summaryThrottle.set(parsed.chatId, Date.now());
    await sendText({ groupOrPhone: parsed.chatId, message: msg });
    console.log(`[agent-central-mention] resumo enviado ao grupo ${parsed.chatId}`);
  } catch (e: any) {
    console.warn("[agent-central-mention] handleGroupSummaryRequest falhou:", e?.message);
  }
}

// Throttle em memória pra não reenviar o resumo de KM da mesma OS em rajada
// (replay de webhook ou várias menções seguidas no grupo).
const kmFinalThrottle = new Map<string, number>();
const KM_FINAL_THROTTLE_MS = 60_000;

/**
 * Resolve a OS de um pedido de "km final": nº de OS no texto/citação (qualquer
 * status), ou (fallback) a OS mais recente do cliente vinculado ao grupo.
 */
async function resolveOsForKmFinal(
  parsed: ParsedGroupMsg,
  quotedText: string | null,
): Promise<{ id: number; os_number: string | null } | null> {
  const osNum = osNumberFromText(parsed.text) || osNumberFromText(quotedText);
  if (osNum) {
    const d = osDigits(osNum);
    if (d) {
      const { data: cands } = await supabaseAdmin
        .from("service_orders")
        .select("id, os_number, scheduled_date")
        .ilike("os_number", `%${d}%`)
        .order("scheduled_date", { ascending: false })
        .limit(20);
      const match = ((cands || []) as any[]).find((o) => osDigits(o.os_number || "") === d);
      if (match) return { id: match.id, os_number: match.os_number };
    }
  }

  // Fallback CONSERVADOR: grupo → cliente com EXATAMENTE 1 OS ativa. Nunca
  // chuta a "mais recente" (mandaria resumo da OS errada em grupo movimentado).
  try {
    const { data: cli } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("whatsapp_group_id", parsed.chatId)
      .maybeSingle();
    if (cli?.id) {
      const active = await loadActiveOs();
      if (active.length > 0) {
        const { data: withClient } = await supabaseAdmin
          .from("service_orders")
          .select("id, client_id")
          .in("id", active.map((o) => o.id));
        const clientByOs = new Map<number, number>();
        for (const r of (withClient || []) as any[]) clientByOs.set(r.id, r.client_id);
        const matches = active.filter((o) => clientByOs.get(o.id) === cli.id);
        if (matches.length === 1) return { id: matches[0].id, os_number: matches[0].os_number };
      }
    }
  } catch { /* fail-open */ }

  return null;
}

/**
 * Responde NO GRUPO com o resumo enxuto (horários + KMs) da OS quando alguém
 * marca/responde a conversa daquela OS pedindo "km final". Fail-open.
 */
export async function handleFinalKmRequest(parsed: ParsedGroupMsg, quotedText: string | null): Promise<void> {
  try {
    const os = await resolveOsForKmFinal(parsed, quotedText);
    if (!os) {
      console.log(`[agent-central-mention] "km final" no grupo ${parsed.chatId} mas OS não identificada — ignorando`);
      return;
    }
    const key = `${parsed.chatId}:${os.id}`;
    const last = kmFinalThrottle.get(key) || 0;
    if (Date.now() - last < KM_FINAL_THROTTLE_MS) {
      console.log(`[agent-central-mention] km-resumo OS ${os.os_number || os.id} ignorado (throttle ${KM_FINAL_THROTTLE_MS / 1000}s)`);
      return;
    }
    const msg = await buildKmResumoByOsId(os.id);
    if (!msg) {
      console.log(`[agent-central-mention] km-resumo OS ${os.os_number || os.id} sem dados — ignorando`);
      return;
    }
    kmFinalThrottle.set(key, Date.now());
    await sendText({ groupOrPhone: parsed.chatId, message: msg });
    console.log(`[agent-central-mention] km-resumo da OS ${os.os_number || os.id} enviado ao grupo ${parsed.chatId}`);
  } catch (e: any) {
    console.warn("[agent-central-mention] handleFinalKmRequest falhou:", e?.message);
  }
}

/**
 * Ponto de entrada chamado pelo webhook. Fire-and-forget, nunca lança.
 */
export async function handleGroupUpdateRequest(parsed: ParsedGroupMsg, rawBody: any): Promise<void> {
  try {
    if (!parsed.isGroup || parsed.fromMe) return;
    if (!isZapiConfigured()) return;

    // Pedido de RESUMO geral tem fluxo próprio (panorama do cliente). Só
    // intercepta se NÃO houver um nº de OS no texto — assim "resumo da 236"
    // cai no fluxo de atualização daquela OS, não no panorama geral.
    if (looksLikeSummaryRequest(parsed.text) && !RE_OS.test(parsed.text || "")) {
      await handleGroupSummaryRequest(parsed);
      return;
    }

    // Texto da mensagem citada (resposta). Primeiro tenta o conteúdo inline do
    // payload; se não vier, usa o ID da citação pra buscar o corpo no nosso
    // histórico (normalmente é o nosso card de atualização com "OS TOR-XXXX").
    const quotedId = extractQuotedId(rawBody);
    let quotedText = extractQuotedText(rawBody);
    if (!quotedText && quotedId) quotedText = await lookupQuotedBody(quotedId);
    const hasQuoted = !!quotedText || !!quotedId;

    // Pedido de "km final": alguém marca/responde a conversa de uma OS e escreve
    // "km final". Responde com o resumo enxuto (horários + KMs) daquela OS.
    // Vem ANTES do gate de update-request porque "km final" sozinho não cheira
    // a pedido de atualização (sem nº de OS nem keyword).
    if (looksLikeFinalKm(parsed.text)) {
      await handleFinalKmRequest(parsed, quotedText);
      return;
    }

    if (!looksLikeUpdateRequest(parsed.text, hasQuoted)) return;

    const text = (parsed.text || "").trim();
    const extract = await extractIntent(text || quotedText || "");
    if (!extract.isUpdateRequest) return;

    const { os, via } = await resolveOs({ extract, quotedText, groupId: parsed.chatId });
    if (!os) {
      console.log(`[agent-central-mention] pedido no grupo ${parsed.chatId} mas OS não resolvida (via=${via})`);
      return;
    }

    console.log(`[agent-central-mention] grupo ${parsed.chatId}: pedido de "${parsed.senderName || "?"}" → OS ${os.os_number || os.id} (via ${via})`);

    // Anti-spam / dedupe: se já há um pedido ABERTO pra esta OS neste grupo
    // criado nos últimos 10min, não cobra de novo (cobrança repetida geraria
    // tempestade de DM se o cliente mandar várias mensagens seguidas, ou se o
    // webhook reprocessar). Também cobre retries de webhook sem zapiMessageId.
    const DEDUPE_MIN = 10;
    const sinceIso = new Date(Date.now() - DEDUPE_MIN * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("agent_central_group_requests")
      .select("id")
      .eq("group_id", parsed.chatId)
      .eq("service_order_id", os.id)
      .is("fulfilled_at", null)
      .gte("requested_at", sinceIso)
      .limit(1);
    if (recent && recent.length > 0) {
      console.log(`[agent-central-mention] OS ${os.os_number || os.id} já tem pedido aberto recente no grupo — pulando (anti-spam)`);
      return;
    }

    // Cobra os agentes por DM.
    const notified = await cobrarAgentes(os);

    // Registra o pedido aberto pra encaminhar a próxima atualização de volta.
    await supabaseAdmin
      .from("agent_central_group_requests")
      .insert({
        group_id: parsed.chatId,
        service_order_id: os.id,
        requester_name: parsed.senderName || null,
        requester_phone: parsed.senderPhone || null,
        source_message_id: parsed.zapiMessageId || null,
      })
      .then(() => {}, (e: any) => console.warn("[agent-central-mention] insert request falhou:", e?.message));

    // Responde no grupo (cordial, variado).
    const ack = await buildAck(parsed.senderName || "", os.os_number || null);
    const finalMsg = notified > 0
      ? ack
      : `${ack}\n\n_(Obs.: não há contato de WhatsApp cadastrado para os agentes desta OS — acionando por outros meios.)_`;
    await sendText({ groupOrPhone: parsed.chatId, message: finalMsg });
  } catch (e: any) {
    console.warn("[agent-central-mention] handler falhou:", e?.message);
  }
}

/**
 * Encaminha uma mission_update recém-criada de volta ao(s) grupo(s) que pediram
 * atualização dessa OS, mencionando quem pediu. Marca os pedidos como fulfilled.
 * Chamado por server/routes/mission.ts após salvar a update. Fail-open.
 */
export async function fulfillGroupRequests(params: {
  serviceOrderId: number;
  osNumber: string | null;
  employeeName: string | null;
  message: string | null;
}): Promise<void> {
  try {
    if (!isZapiConfigured()) return;

    // Claim atômico: marca como fulfilled E retorna SÓ as linhas que esta
    // chamada conseguiu reivindicar. Isso evita que duas mission_updates
    // concorrentes da mesma OS enviem a resposta duplicada ao grupo. Se o
    // envio falhar depois, des-reivindica (volta fulfilled_at pra null).
    const claimedAt = new Date().toISOString();
    const { data: open, error: claimErr } = await supabaseAdmin
      .from("agent_central_group_requests")
      .update({ fulfilled_at: claimedAt })
      .eq("service_order_id", params.serviceOrderId)
      .is("fulfilled_at", null)
      .select("id, group_id, requester_name");
    if (claimErr) {
      console.warn("[agent-central-mention] claim fulfill falhou:", claimErr.message);
      return;
    }
    if (!open || open.length === 0) return;

    // Agrupa por group_id (pode haver vários pedidos no mesmo grupo).
    const byGroup = new Map<string, { ids: number[]; names: Set<string> }>();
    for (const r of open as any[]) {
      const g = String(r.group_id);
      if (!byGroup.has(g)) byGroup.set(g, { ids: [], names: new Set() });
      const e = byGroup.get(g)!;
      e.ids.push(r.id);
      const fn = firstName(r.requester_name);
      if (fn) e.names.add(fn);
    }

    const msgBody = (params.message || "").trim();
    for (const [groupId, info] of Array.from(byGroup.entries())) {
      const nomes = Array.from(info.names);
      const saud = nomes.length > 0 ? `${nomes.join(", ")}, ` : "";
      const out = [
        `*Central Torres* — atualização solicitada`,
        ``,
        `${saud}segue a atualização da OS ${params.osNumber || `#${params.serviceOrderId}`}:`,
        ``,
        msgBody || "(sem texto)",
        params.employeeName ? `\n_Agente: ${firstName(params.employeeName)}_` : "",
      ].filter((l) => l !== "").join("\n");

      const r = await sendText({ groupOrPhone: groupId, message: out });
      if (r.ok) {
        // Já reivindicado (fulfilled_at setado no claim atômico) — só loga.
        console.log(`[agent-central-mention] update da OS ${params.osNumber || params.serviceOrderId} encaminhada ao grupo ${groupId} (pediram: ${nomes.join(", ") || "?"})`);
      } else {
        // Envio falhou → des-reivindica pra retentar na próxima mission_update.
        const { error: unErr } = await supabaseAdmin
          .from("agent_central_group_requests")
          .update({ fulfilled_at: null })
          .in("id", info.ids);
        console.warn(`[agent-central-mention] envio ao grupo ${groupId} falhou (${r.error}); pedido des-reivindicado${unErr ? ` (erro unclaim: ${unErr.message})` : ""}`);
      }
    }
  } catch (e: any) {
    console.warn("[agent-central-mention] fulfillGroupRequests falhou:", e?.message);
  }
}
