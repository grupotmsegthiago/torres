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
import { sendText, sendImageWithCaption, isZapiConfigured, getBotLid } from "./zapi";
import { buildReminderMessage, sleep, humanDelayMs, randomTypingSeconds, varyForwardHeader, randInt } from "./whatsapp-humanize";
import { normalizePhone } from "./normalize-contact";
import { buildKmResumoByOsId, getKmFinalPhotoByOsId } from "../cron-whatsapp-forward";

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
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 200,
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
// Cobra SÓ o 1º agente (decisão do dono 17/jun/2026): manda 1 DM ao agente
// primário (assigned_employee_id; se não houver, usa o 2º como único). O 2º só é
// cobrado depois, por escalateToSecondAgent, se o 1º não responder na janela.
async function cobrarAgentes(os: ActiveOs): Promise<number> {
  const primaryId = os.assigned_employee_id ?? os.assigned_employee_2_id;
  if (!primaryId) return 0;
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, phone")
    .eq("id", primaryId)
    .limit(1);
  const emp = (emps || [])[0] as any;
  if (!emp) return 0;
  const intl = toIntlPhone(emp.phone);
  if (!intl) return 0;
  const osLabel = os.os_number || `#${os.id}`;

  let sent = 0;
  try {
    // ANTI-BLOQUEIO: texto variado (IA + fallback) + "digitando...". Nunca template fixo.
    const msg = await buildReminderMessage({ osLabel, trigger: "client" });
    const r = await sendText({
      groupOrPhone: intl,
      message: msg,
      delayTypingSeconds: randomTypingSeconds(),
    });
    if (r.ok) sent++;
  } catch { /* ignora */ }

  if (sent > 0) {
    // Marca no agent_central_reminders (mantido p/ reversibilidade do cron proativo).
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

// ESCALONAMENTO (decisão do dono 17/jun/2026): cobra o 2º agente por DM, e SÓ se
// existirem dois agentes distintos (primário já foi cobrado por cobrarAgentes).
// Usado pelo flush quando o 1º não respondeu na janela. Retorna true se enviou.
async function escalateToSecondAgent(serviceOrderId: number): Promise<boolean> {
  try {
    const { data: osRows } = await supabaseAdmin
      .from("service_orders")
      .select("id, os_number, assigned_employee_id, assigned_employee_2_id")
      .eq("id", serviceOrderId)
      .limit(1);
    const os = (osRows || [])[0] as any;
    if (!os) return false;
    const primaryId = os.assigned_employee_id;
    const secondId = os.assigned_employee_2_id;
    // Só escalona se há um 2º agente DISTINTO do primário cobrado.
    if (!primaryId || !secondId || primaryId === secondId) return false;
    const { data: emps } = await supabaseAdmin
      .from("employees")
      .select("id, name, phone")
      .eq("id", secondId)
      .limit(1);
    const emp = (emps || [])[0] as any;
    if (!emp) return false;
    const intl = toIntlPhone(emp.phone);
    if (!intl) return false;
    const osLabel = os.os_number || `#${os.id}`;
    const msg = await buildReminderMessage({ osLabel, trigger: "client" });
    const r = await sendText({
      groupOrPhone: intl,
      message: msg,
      delayTypingSeconds: randomTypingSeconds(),
    });
    return !!r.ok;
  } catch (e: any) {
    console.warn("[agent-central-mention] escalateToSecondAgent falhou:", e?.message);
    return false;
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
 * Detecta se a mensagem MARCA (@menção) o número da Central (o bot). O dono quer
 * que o agente só responda quando for marcado OU quando o assunto for OS — esta
 * função cobre o "marcar". O número do bot vem do payload da Z-API (`connectedPhone`
 * ou `ni`, a instância conectada). Reconhece tanto a lista `mentioned` (quando a
 * Z-API a envia) quanto o token `@<numero>` embutido no texto/legenda. Compara
 * pelos últimos 8 dígitos (tolera DDI/DDD). Exposto p/ teste.
 */
/**
 * LID da Central (só dígitos), cacheado em memória. Populado por `ensureBotLid()`
 * (chamado no início do fluxo de grupo) a partir do GET /device da Z-API. Desde a
 * migração do WhatsApp pra LIDs, a @menção a um participante embute o LID dele, não
 * o telefone — sem isto a Central não se reconhece quando marcada.
 */
let cachedBotLidDigits: string | null = null;

/** Define o LID do bot manualmente (usado em teste). */
export function setBotLidForTest(lid: string | null): void {
  cachedBotLidDigits = lid ? String(lid).replace(/\D/g, "") || null : null;
}

/** Garante que o LID do bot esteja em cache (fail-open, nunca lança). */
export async function ensureBotLid(): Promise<void> {
  if (cachedBotLidDigits) return;
  try {
    const lid = await getBotLid();
    if (lid) cachedBotLidDigits = lid;
  } catch {
    /* fail-open */
  }
}

export function isBotMentioned(rawBody: any, botLid?: string | null): boolean {
  if (!rawBody || typeof rawBody !== "object") return false;
  const bot = normalizePhone(rawBody.connectedPhone ?? rawBody.ni);
  if (!bot) return false;
  const last8 = bot.slice(-8);
  if (last8.length < 8) return false;

  // LID da Central: NÃO passar por normalizePhone (que trunca pra 11 dígitos);
  // o LID tem ~15 dígitos e precisa casar inteiro.
  const lidDigits = (botLid ?? cachedBotLidDigits)?.replace(/\D/g, "") || "";

  const matchesBot = (raw: unknown): boolean => {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (lidDigits && digits === lidDigits) return true; // menção via LID (match exato)
    // Tokens longos (>13 díg) são LID/identificadores internos — só casam pelo LID
    // exato (acima); NÃO casar por sufixo de 8 (evita falso positivo de um LID de
    // terceiro com os mesmos 8 finais). Telefone vai até 13 díg (DDI+DDD+9 dígitos).
    if (digits.length > 13) return false;
    const d = normalizePhone(raw);
    return !!d && (d === bot || d.slice(-8) === last8);
  };

  // 1. Campo explícito de menção (quando a Z-API envia a lista de marcados).
  for (const list of [rawBody.mentioned, rawBody.text?.mentioned, rawBody.message?.mentioned]) {
    if (Array.isArray(list) && list.some(matchesBot)) return true;
  }

  // 2. Token "@<numero>" dentro do texto/legenda (como o WhatsApp embute a menção).
  //    Pode ser o telefone (casa pelos 8 finais) OU o LID (casa inteiro).
  const txt = String(
    rawBody.text?.message || rawBody.image?.caption || rawBody.video?.caption || rawBody.caption || "",
  );
  for (const tok of txt.match(/@(\d{6,15})/g) || []) {
    const dg = tok.replace(/\D/g, "");
    if (lidDigits && dg === lidDigits) return true; // LID exato
    if (dg.length > 13) continue; // LID-like: só casa exato (acima), nunca por sufixo
    if (dg.slice(-8) === last8) return true; // telefone: casa pelos 8 finais
  }
  return false;
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
    await sendText({ groupOrPhone: parsed.chatId, message: msg, delayTypingSeconds: randomTypingSeconds() });
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

    // Tenta mandar a FOTO do KM final com legenda (texto do resumo). Se houver
    // foto, ela já carrega o resumo na legenda — não duplicamos com sendText.
    // Sem foto, cai no envio só-texto (fail-open).
    let sentWithPhoto = false;
    try {
      const foto = await getKmFinalPhotoByOsId(os.id);
      if (foto?.photoData) {
        const r = await sendImageWithCaption({
          groupOrPhone: parsed.chatId,
          imageBase64OrUrl: foto.photoData,
          caption: msg,
          delayMessageSeconds: randomTypingSeconds(),
        });
        sentWithPhoto = r.ok;
        if (!r.ok) {
          console.warn(`[agent-central-mention] km-foto OS ${os.os_number || os.id} falhou: ${r.error} — fallback texto`);
        }
      } else {
        console.log(`[agent-central-mention] OS ${os.os_number || os.id} sem foto de km_final — enviando só texto`);
      }
    } catch (e: any) {
      console.warn(`[agent-central-mention] km-foto OS ${os.os_number || os.id} erro: ${e?.message} — fallback texto`);
    }

    if (!sentWithPhoto) {
      await sendText({ groupOrPhone: parsed.chatId, message: msg, delayTypingSeconds: randomTypingSeconds() });
    }
    console.log(`[agent-central-mention] km-resumo da OS ${os.os_number || os.id} enviado ao grupo ${parsed.chatId}${sentWithPhoto ? " (com foto)" : " (só texto)"}`);
  } catch (e: any) {
    console.warn("[agent-central-mention] handleFinalKmRequest falhou:", e?.message);
  }
}

// ── Conversa natural (fallback humanizado) ──────────────────────────────────
// Quando a mensagem NÃO cai em nenhum fluxo operacional (resumo, km final,
// pedido de atualização), em vez de ficar calado o robô responde como uma
// pessoa: cordial, breve, variando as palavras. TRAVAS: nunca inventa dado
// operacional e nunca fala de valores/financeiro. Só atua em grupo vinculado a
// um cliente, com throttle pra não virar tempestade nem aumentar risco de ban.
const naturalReplyThrottle = new Map<string, number>();
const NATURAL_REPLY_THROTTLE_MS = 15_000;

// ===========================================================================
// ESCALONAMENTO SILENCIOSO — "cobra o 1º agente; só o 2º se o 1º não responder"
// (decisão do dono 17/jun/2026)
// ---------------------------------------------------------------------------
// Quando um cliente pede atualização no grupo, a Central NÃO fala no grupo. Ela
// cobra o 1º agente por DM na hora e registra o pedido com ack_decide_at = agora
// + ESCALATE_AFTER_MIN. Durante a janela:
//  - se a equipe falar no grupo → resolve 'team_handled' (não escalona);
//  - se a atualização chegar (fulfillGroupRequests marca fulfilled_at) → resolve
//    'fulfilled' (o 1º respondeu, não escalona);
//  - se a janela vencer sem resposta → o flush cobra o 2º agente por DM
//    ('escalated'); sem 2º agente distinto, resolve 'no_second'.
// A atualização REAL só chega ao grupo via fulfillGroupRequests (quando o agente
// reporta) ou via resposta ao vivo se marcarem a Central. Nada de aviso "recebi".
// O flush roda a cada 1min (cron).
// ===========================================================================

export const ESCALATE_AFTER_MIN = 8;

/** Sufixo de 8 dígitos do telefone normalizado (""=inválido). Puro. */
export function phoneSuffix8(phone: string | null): string {
  const d = normalizePhone(phone);
  return d && d.length >= 8 ? d.slice(-8) : "";
}

/** Telefone bate com algum sufixo conhecido da equipe? Puro (testável). */
export function isTeamSuffixMatch(suffixes: Set<string>, phone: string | null): boolean {
  const s = phoneSuffix8(phone);
  return s.length === 8 && suffixes.has(s);
}

/**
 * Decisão PURA do flush de escalonamento: separa o que já foi entregue (1º
 * respondeu, não escalona) do que precisa escalonar (cobra o 2º agente). NÃO
 * deduplica por grupo — pedidos de OSs diferentes no mesmo grupo escalonam cada
 * um pro seu 2º agente. Testável.
 */
export function planEscalations<T extends { fulfilled_at: string | null }>(
  rows: T[],
): { toEscalate: T[]; toSuppressFulfilled: T[] } {
  const toEscalate: T[] = [];
  const toSuppressFulfilled: T[] = [];
  for (const r of rows) {
    if (r.fulfilled_at) { toSuppressFulfilled.push(r); continue; }
    toEscalate.push(r);
  }
  return { toEscalate, toSuppressFulfilled };
}

// Cache em memória dos sufixos de telefone da equipe (employees). Evita uma
// query por mensagem de grupo. TTL curto: novos funcionários entram em até 5min.
let teamPhoneCache: { suffixes: Set<string>; at: number } | null = null;
const TEAM_PHONE_TTL_MS = 5 * 60 * 1000;

async function loadTeamPhoneSuffixes(): Promise<Set<string>> {
  const now = Date.now();
  if (teamPhoneCache && now - teamPhoneCache.at < TEAM_PHONE_TTL_MS) {
    return teamPhoneCache.suffixes;
  }
  const suffixes = new Set<string>();
  try {
    const { data } = await supabaseAdmin
      .from("employees")
      .select("phone")
      .not("phone", "is", null);
    for (const e of (data || []) as any[]) {
      const s = phoneSuffix8(e.phone);
      if (s) suffixes.add(s);
    }
  } catch (e: any) {
    console.warn("[agent-central-mention] loadTeamPhoneSuffixes falhou:", e?.message);
    // Em falha de leitura, devolve o cache antigo (se houver) pra não tratar
    // toda a equipe como cliente; senão, set vazio (fail-open: nada suprimido).
    if (teamPhoneCache) return teamPhoneCache.suffixes;
  }
  teamPhoneCache = { suffixes, at: now };
  return suffixes;
}

/** É um número da equipe (funcionário)? Usa cache de sufixos. */
export async function isTeamMemberPhone(phone: string | null): Promise<boolean> {
  if (!phone) return false;
  const suffixes = await loadTeamPhoneSuffixes();
  return isTeamSuffixMatch(suffixes, phone);
}

/**
 * Suprime (resolve) os acks deferidos pendentes de um grupo — usado quando um
 * membro da equipe fala no grupo (a equipe está atendendo). Retorna quantos
 * pedidos foram suprimidos. Fail-open: nunca lança.
 */
export async function suppressPendingAcksForGroup(
  groupId: string,
  resolution: "team_handled" | "fulfilled",
): Promise<number> {
  try {
    const { data } = await supabaseAdmin
      .from("agent_central_group_requests")
      .update({ ack_resolved_at: new Date().toISOString(), ack_resolution: resolution })
      .eq("group_id", groupId)
      .not("ack_decide_at", "is", null)
      .is("ack_resolved_at", null)
      .select("id");
    return (data || []).length;
  } catch (e: any) {
    console.warn("[agent-central-mention] suppressPendingAcksForGroup falhou:", e?.message);
    return 0;
  }
}

/** Marca um pedido como resolvido com a resolução dada. Fail-open. */
async function resolveAck(
  id: number,
  resolution: "team_handled" | "fulfilled" | "escalated" | "no_second",
): Promise<void> {
  await supabaseAdmin
    .from("agent_central_group_requests")
    .update({ ack_resolved_at: new Date().toISOString(), ack_resolution: resolution })
    .eq("id", id)
    .then(() => {}, (e: any) => console.warn("[agent-central-mention] resolveAck falhou:", e?.message));
}

interface PendingEscalationRow {
  id: number;
  service_order_id: number;
  fulfilled_at: string | null;
}

/**
 * Escalonamento dos pedidos cuja janela do 1º agente venceu. Chamado pelo cron a
 * cada 1min. Decisão do dono (17/jun/2026): a Central NUNCA fala no grupo aqui.
 * Para cada pedido com ack_decide_at vencido e ainda sem resolução:
 *  - já entregue (fulfilled_at) → resolve 'fulfilled' (1º respondeu, nada a fazer);
 *  - senão → cobra o 2º agente por DM ('escalated'); sem 2º distinto, 'no_second'.
 * O grupo só recebe a atualização REAL via fulfillGroupRequests. Fail-open.
 */
export async function flushAgentEscalations(): Promise<{ escalated: number; fulfilled: number; no_second: number }> {
  const res = { escalated: 0, fulfilled: 0, no_second: 0 };
  try {
    if (!isZapiConfigured()) return res;
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabaseAdmin
      .from("agent_central_group_requests")
      .select("id, service_order_id, fulfilled_at")
      .not("ack_decide_at", "is", null)
      .is("ack_resolved_at", null)
      .lte("ack_decide_at", nowIso)
      .order("ack_decide_at", { ascending: true });
    if (error) {
      console.warn("[agent-central-mention] flushAgentEscalations query falhou:", error.message);
      return res;
    }
    const rows = (due || []) as PendingEscalationRow[];
    if (rows.length === 0) return res;

    let firstSend = true;
    for (const r of rows) {
      // 1º agente já respondeu (atualização entregue) → não escalona.
      if (r.fulfilled_at) {
        await resolveAck(r.id, "fulfilled");
        res.fulfilled++;
        continue;
      }
      // CLAIM ATÔMICO: marca resolvido ('escalated') ANTES de cobrar o 2º, e só
      // se a linha AINDA está pendente E não foi entregue. Fecha a corrida com
      // fulfillGroupRequests/suppressPendingAcksForGroup (1º respondeu / equipe
      // assumiu entre o select e agora) — se qualquer um resolveu, o claim devolve
      // 0 linhas e NÃO escalonamos.
      let claimedOk = false;
      try {
        const { data: claimed } = await supabaseAdmin
          .from("agent_central_group_requests")
          .update({ ack_resolved_at: new Date().toISOString(), ack_resolution: "escalated" })
          .eq("id", r.id)
          .is("ack_resolved_at", null)
          .is("fulfilled_at", null)
          .select("id");
        claimedOk = !!claimed && claimed.length > 0;
      } catch (e: any) {
        console.warn("[agent-central-mention] flush claim falhou:", e?.message);
      }
      if (!claimedOk) continue; // resolvido/entregue por evento concorrente.

      if (!firstSend) await sleep(humanDelayMs());
      firstSend = false;
      const ok = await escalateToSecondAgent(r.service_order_id);
      if (ok) {
        res.escalated++;
      } else {
        // Sem 2º agente distinto (ou envio falhou) → ajusta a resolução; não
        // re-tenta (prioridade anti-ban é mandar menos, não insistir).
        res.no_second++;
        await supabaseAdmin
          .from("agent_central_group_requests")
          .update({ ack_resolution: "no_second" })
          .eq("id", r.id)
          .then(() => {}, () => {});
      }
    }
  } catch (e: any) {
    console.warn("[agent-central-mention] flushAgentEscalations falhou:", e?.message);
  }
  return res;
}

// Pós-filtro de segurança: mesmo com a trava no prompt, se a IA escapar e citar
// valor/cobrança/pix/boleto/orçamento, NÃO mandamos pro cliente — trocamos por
// um desvio neutro pro financeiro. (A trava 1 — não inventar dado operacional —
// fica só no prompt: detecção por regex daria muitos falsos positivos, ex.
// "atendemos 24h", "fim de semana".)
const FINANCEIRO_LEAK =
  /(r\$\s*\d|\d+\s*(?:reais|mil\s*reais|contos?)|\bpix\b|\bboletos?\b|\bor[çc]ament\w*|\bfatur\w*|\bcobran\w*|\bpre[çc]o\w*)/i;
const FINANCEIRO_DEFLEXOES = [
  "Sobre valores, peço que aguarde um pouquinho — nosso setor financeiro retorna pra você por outro canal. 🙏",
  "Essa parte de valores quem cuida é o nosso financeiro; eles entram em contato com você por outro canal, tá?",
  "Para questões de valores, o setor financeiro fala diretamente com você por outro canal. Qualquer coisa operacional, estou à disposição!",
];

/** Bloqueia vazamento financeiro na resposta natural. Fail-safe pro desvio. */
export function sanitizeFinanceiro(msg: string): string {
  if (FINANCEIRO_LEAK.test(msg)) {
    return FINANCEIRO_DEFLEXOES[randInt(0, FINANCEIRO_DEFLEXOES.length - 1)];
  }
  return msg;
}

/**
 * Gera uma resposta de conversa natural via IA, com guarda-rails. Retorna null
 * se não houver IA (melhor ficar calado do que mandar template robótico) ou se
 * a IA falhar. Nunca lança.
 */
export async function buildNaturalReply(text: string, senderName: string | null): Promise<string | null> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  const nome = firstName(senderName);
  try {
    const openai = new OpenAI({ apiKey, baseURL, timeout: 6000, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 160,
      messages: [
        {
          role: "system",
          content:
            `Você é a "Central Torres", atendente HUMANA de uma empresa de escolta/segurança patrimonial, ` +
            `conversando num grupo de WhatsApp de um CLIENTE. Responda de forma natural, cordial e BREVE ` +
            `(1 a 2 frases), como uma pessoa de verdade. VARIE SEMPRE as palavras, a saudação e a estrutura — ` +
            `nunca soe como um robô repetindo um template (isso causa bloqueio do WhatsApp). Português brasileiro, ` +
            `no máximo 1 emoji (pode não usar nenhum).\n` +
            `REGRAS INVIOLÁVEIS:\n` +
            `1) NUNCA invente dados operacionais (horários, locais, KMs, placas, status/posição de missão, prazos, ` +
            `previsões). Se a pessoa perguntar algo assim e você não tem o dado, diga com naturalidade que vai verificar ` +
            `e já retorna — sem chutar.\n` +
            `2) NUNCA fale sobre valores, preços, cobranças, faturamento, boletos ou qualquer assunto financeiro. ` +
            `Se perguntarem, diga educadamente que o setor financeiro retorna por outro canal.\n` +
            `3) Não prometa nada específico que dependa de um dado que você não tem.\n` +
            `Se a pessoa só cumprimentou, agradeceu ou fez conversa social, responda no mesmo tom, simpático e curto. ` +
            `Responda SÓ com a mensagem, sem aspas.`,
        },
        {
          role: "user",
          content: `${nome ? `Pessoa que escreveu: ${nome}. ` : ""}Mensagem recebida no grupo: "${text}"`,
        },
      ],
    });
    const out = response.choices?.[0]?.message?.content?.trim();
    return out && out.length > 0 ? out : null;
  } catch (e: any) {
    console.warn("[agent-central-mention] buildNaturalReply falhou:", e?.message);
    return null;
  }
}

/**
 * Responde de forma natural quando a mensagem do grupo não casou com nenhum
 * fluxo operacional. Só atua em grupo vinculado a cliente. Fail-open.
 */
export async function handleNaturalConversation(parsed: ParsedGroupMsg): Promise<void> {
  try {
    if (!parsed.isGroup || parsed.fromMe) return;
    const text = (parsed.text || "").trim();
    if (text.length < 2) return; // mídia pura / vazio → não responde

    // Throttle: não responde em rajada (protege contra storm e contra ban).
    const last = naturalReplyThrottle.get(parsed.chatId) || 0;
    if (Date.now() - last < NATURAL_REPLY_THROTTLE_MS) {
      console.log(`[agent-central-mention] conversa natural no grupo ${parsed.chatId} ignorada (throttle ${NATURAL_REPLY_THROTTLE_MS / 1000}s)`);
      return;
    }
    // Reivindica a janela ANTES de qualquer await — fecha a corrida de webhooks
    // concorrentes do mesmo grupo (dois passariam no check e disparariam juntos).
    naturalReplyThrottle.set(parsed.chatId, Date.now());

    // Só conversa em grupo que está vinculado a um cliente (não tagarela em
    // grupos aleatórios em que o número porventura esteja).
    const { data: cli } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("whatsapp_group_id", parsed.chatId)
      .maybeSingle();
    if (!cli?.id) {
      console.log(`[agent-central-mention] conversa natural no grupo ${parsed.chatId} ignorada (grupo sem cliente vinculado)`);
      return;
    }

    const raw = await buildNaturalReply(text, parsed.senderName);
    if (!raw) return;
    const reply = sanitizeFinanceiro(raw); // trava financeira pós-geração

    // Ritmo humano: não responder instantâneo (resposta imediata cheira a robô)
    // + "digitando..." antes do disparo.
    await sleep(humanDelayMs(2000, 7000));
    await sendText({ groupOrPhone: parsed.chatId, message: reply, delayTypingSeconds: randomTypingSeconds() });
    console.log(`[agent-central-mention] resposta natural enviada ao grupo ${parsed.chatId}`);
  } catch (e: any) {
    console.warn("[agent-central-mention] handleNaturalConversation falhou:", e?.message);
  }
}

/**
 * Ponto de entrada chamado pelo webhook. Fire-and-forget, nunca lança.
 */
export async function handleGroupUpdateRequest(parsed: ParsedGroupMsg, rawBody: any): Promise<void> {
  try {
    if (!parsed.isGroup || parsed.fromMe) return;
    if (!isZapiConfigured()) return;

    // Garante o LID da Central em cache — sem ele, @menção via LID (padrão novo do
    // WhatsApp) não é reconhecida e a Central ignora quem a marca. Fail-open.
    await ensureBotLid();

    // EQUIPE ATENDENDO: se quem falou no grupo é um funcionário (telefone em
    // employees), a Central entende que a equipe já está atendendo e SUPRIME
    // qualquer ack deferido pendente deste grupo — não "entra" por cima da
    // equipe. A cobrança por DM ao agente já foi feita no momento do pedido, e a
    // atualização real ainda volta via fulfillGroupRequests. Não interrompe o
    // resto do fluxo (o membro da equipe pode pedir resumo/km normalmente).
    if (parsed.senderPhone && (await isTeamMemberPhone(parsed.senderPhone))) {
      const n = await suppressPendingAcksForGroup(parsed.chatId, "team_handled");
      if (n > 0) {
        console.log(`[agent-central-mention] equipe (${parsed.senderName || parsed.senderPhone}) falou no grupo ${parsed.chatId} — ${n} ack(s) deferido(s) suprimido(s) (equipe atendendo)`);
      }
    }

    // Marcaram a Central (@menção)? O dono reverteu a "conversa ampla" de jun/2026:
    // fora de assunto de OS, o agente SÓ responde quando for marcado. Sem menção e
    // sem assunto de OS → silêncio.
    const mentioned = isBotMentioned(rawBody);
    const replyNaturalIfMentioned = async () => {
      if (mentioned) {
        await handleNaturalConversation(parsed);
      } else {
        console.log(`[agent-central-mention] grupo ${parsed.chatId}: mensagem sem menção e fora de assunto de OS — ignorando (não responde)`);
      }
    };

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

    // Não cheira a pedido operacional → só responde se MARCARAM a Central; senão silêncio.
    if (!looksLikeUpdateRequest(parsed.text, hasQuoted)) {
      await replyNaturalIfMentioned();
      return;
    }

    const text = (parsed.text || "").trim();
    const extract = await extractIntent(text || quotedText || "");
    // A IA concluiu que não é pedido de atualização → só responde se marcaram.
    if (!extract.isUpdateRequest) {
      await replyNaturalIfMentioned();
      return;
    }

    const { os, via } = await resolveOs({ extract, quotedText, groupId: parsed.chatId });
    if (!os) {
      // A IA confirmou que é pedido sobre OS (isUpdateRequest=true), mas não deu
      // pra identificar QUAL OS. Decisão do dono (17/jun/2026): a Central fica
      // CALADA no grupo nesse caso — só responde se MARCAREM a Central; senão
      // silêncio (anti-barulho/anti-ban). Sem OS resolvida não há o que cobrar.
      console.log(`[agent-central-mention] pedido sobre OS no grupo ${parsed.chatId} mas OS não resolvida (via=${via}) — ${isBotMentioned(rawBody) ? "respondendo (marcaram a Central)" : "silêncio (sem menção)"}`);
      await replyNaturalIfMentioned();
      return;
    }

    console.log(`[agent-central-mention] grupo ${parsed.chatId}: pedido de "${parsed.senderName || "?"}" → OS ${os.os_number || os.id} (via ${via})`);

    // Anti-spam / dedupe: já existe um pedido ABERTO pra esta OS neste grupo
    // criado nos últimos 10min? (cobre cliente repetindo, retry de webhook sem
    // zapiMessageId, etc.). Usado abaixo pra evitar cobrança/ack duplicados.
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
    const hasRecentOpen = !!(recent && recent.length > 0);

    // MARCARAM a Central explicitamente (@menção): é um pedido DIRETO ao bot, então
    // ela responde AGORA — NÃO defere e NÃO cai no silêncio do anti-spam (o dono
    // pediu "ideal era marcar ele" e espera resposta ao marcar). Ainda cobra os
    // agentes por DM, mas só se não houver pedido aberto recente (a cobrança já
    // saiu há pouco → evita tempestade de DM). A resposta natural já tem ritmo
    // humano + throttle + travas (anti-ban / financeiro).
    if (mentioned) {
      // Marcaram a Central → responde AO VIVO (o dono quer resposta ao marcar).
      // Mesmo assim cobra o 1º agente por DM e arma o timer de escalonamento (se
      // não houver pedido aberto recente): se o 1º não reportar dentro da janela,
      // o flush cobra o 2º. A atualização REAL ao grupo segue via
      // fulfillGroupRequests quando o agente mexer no campo da OS.
      if (!hasRecentOpen) {
        await cobrarAgentes(os);
        const escalateAt = new Date(Date.now() + ESCALATE_AFTER_MIN * 60 * 1000).toISOString();
        await supabaseAdmin
          .from("agent_central_group_requests")
          .insert({
            group_id: parsed.chatId,
            service_order_id: os.id,
            requester_name: parsed.senderName || null,
            requester_phone: parsed.senderPhone || null,
            source_message_id: parsed.zapiMessageId || null,
            ack_decide_at: escalateAt,
          })
          .then(() => {}, (e: any) => console.warn("[agent-central-mention] insert request (menção) falhou:", e?.message));
      }
      await handleNaturalConversation(parsed);
      console.log(`[agent-central-mention] grupo ${parsed.chatId}: Central marcada → respondeu na hora (OS ${os.os_number || os.id})`);
      return;
    }

    // (sem menção) pedido operacional comum → escalonamento silencioso.
    if (hasRecentOpen) {
      console.log(`[agent-central-mention] OS ${os.os_number || os.id} já tem pedido aberto recente no grupo — pulando (anti-spam)`);
      return;
    }

    // Cobra SÓ o 1º agente por DM IMEDIATAMENTE. A Central NÃO fala no grupo.
    await cobrarAgentes(os);

    // Arma o timer de escalonamento: registra o pedido com ack_decide_at = agora
    // + ESCALATE_AFTER_MIN. Se o 1º reportar (fulfilled) ou a equipe assumir no
    // grupo dentro da janela, o pedido é resolvido e não escalona. Senão, o flush
    // (cron 1min) cobra o 2º agente por DM quando a janela vencer.
    const ackDecideAt = new Date(Date.now() + ESCALATE_AFTER_MIN * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("agent_central_group_requests")
      .insert({
        group_id: parsed.chatId,
        service_order_id: os.id,
        requester_name: parsed.senderName || null,
        requester_phone: parsed.senderPhone || null,
        source_message_id: parsed.zapiMessageId || null,
        ack_decide_at: ackDecideAt,
      })
      .then(() => {}, (e: any) => console.warn("[agent-central-mention] insert request falhou:", e?.message));

    console.log(`[agent-central-mention] OS ${os.os_number || os.id} no grupo ${parsed.chatId}: 1º agente cobrado por DM; escalonamento p/ 2º armado em ${ESCALATE_AFTER_MIN}min se não houver resposta`);
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
        `*${varyForwardHeader()}*`,
        ``,
        `${saud}segue a atualização da OS ${params.osNumber || `#${params.serviceOrderId}`}:`,
        ``,
        msgBody || "(sem texto)",
        params.employeeName ? `\n_Agente: ${firstName(params.employeeName)}_` : "",
      ].filter((l) => l !== "").join("\n");

      const r = await sendText({ groupOrPhone: groupId, message: out, delayTypingSeconds: randomTypingSeconds() });
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
