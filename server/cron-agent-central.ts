/**
 * Agente Central — cobrança automática de updates dos vigilantes.
 *
 * Lógica (definida com o dono em 28/05/2026):
 * - OS ativa = status="em_andamento" E missionStatus NÃO em
 *   ["encerrada","retorno_base","chegada_base","finalizada","cancelada","recusada"]
 * - Estado do veículo:
 *    * PERNOITE: a última mission_update tem palavra-chave de pernoite
 *      ("pernoite", "início de pernoite", "começo de pernoite", "iniciando
 *      pernoite", "parado pernoite") E NÃO tem palavra-chave de reinício
 *      ("reinício", "reinicio", "reiniciar", "reiniciamos", "saí do pernoite").
 *    * RODANDO: qualquer outro caso (sem update, ou último update sem
 *      keyword de pernoite, OU já apareceu "reinício" depois do pernoite).
 * - Gap máximo sem update antes de cobrar:
 *    * RODANDO  → 1h20min (80 min)
 *    * PERNOITE → 2h10min (130 min)
 * - Re-cobrança: intervalo com BACKOFF + jitter via reminderIntervalMinutes()
 *   (cresce conforme o agente ignora; nunca < 30 min) — anti-bloqueio. Antes era
 *   30 min cravado, o que parecia robô pro WhatsApp.
 * - Destinatários: assignedEmployee + assignedEmployee2 (WhatsApp direto,
 *   NÃO no grupo do cliente). Usa employees.phone normalizado e prefixa "55".
 * - Reset: quando agente posta nova mission_update, a linha em
 *   agent_central_reminders da OS é deletada (vide server/routes/mission.ts).
 */

import { supabaseAdmin } from "./supabase";
import { sendText, isZapiConfigured } from "./lib/zapi";
import { normalizePhone } from "./lib/normalize-contact";
import { log } from "./lib/logger";
import { buildReminderMessage, sleep, humanDelayMs, typingSecondsForMessage, shuffle, reminderIntervalMinutes } from "./lib/whatsapp-humanize";

const FINISHED_MISSION_STATUS = new Set([
  "encerrada", "retorno_base", "chegada_base", "finalizada", "cancelada", "recusada",
]);

const GAP_MINUTES_RODANDO = 80;   // 1h20
const GAP_MINUTES_PERNOITE = 130; // 2h10
// Re-cobrança da MESMA OS: intervalo com backoff + jitter via
// reminderIntervalMinutes(reminder_count) (anti-bloqueio). Antes era 30min cravado.

// Palavras-chave (case-insensitive). Match "pernoite" em qualquer posição.
// "Saí do pernoite" / "Reinício" / "Reiniciar" cancela o estado pernoite.
const RE_PERNOITE = /pernoite/i;
// Reinício cobre variações comuns que o vigilante digita pra indicar que
// saiu do pernoite e voltou a rodar: "reinício", "reiniciar", "saí/saindo do
// pernoite", "voltei a rodar", "em movimento", "rodando novamente", etc.
const RE_REINICIO = /\b(rein[ií]cio|reiniciar|reiniciamos|reiniciei|sa[ií]\s*(do)?\s*pernoite|saindo\s*(do)?\s*pernoite|voltei\s+a\s+rodar|em\s+movimento|rodando\s+novamente|retomando\s+viagem)\b/i;

interface ReminderRow {
  service_order_id: number;
  last_reminded_at: string;
  reminder_count: number;
}

interface MissionUpdateRow {
  id: number;
  service_order_id: number;
  message: string | null;
  created_at: string;
}

interface ActiveOsRow {
  id: number;
  os_number: string | null;
  mission_status: string | null;
  mission_started_at: string | null;
  assigned_employee_id: number | null;
  assigned_employee_2_id: number | null;
}

interface EmployeeRow {
  id: number;
  name: string;
  phone: string | null;
}

/** Minutos entre dois timestamps (positivo = a depois de b). */
function minutesBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 60000);
}

/** Formata "Xh Ymin" a partir de minutos. */
function fmtElapsed(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** Formata HH:MM em BRT. */
function fmtTimeBRT(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Decide se a última mensagem indica PERNOITE. */
function isPernoiteMessage(msg: string | null): boolean {
  if (!msg) return false;
  if (RE_REINICIO.test(msg)) return false; // reinício cancela pernoite
  return RE_PERNOITE.test(msg);
}

/** Adiciona "55" no início do número se ainda não tem código de país. */
function toIntlPhone(rawPhone: string | null): string | null {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;
  // BR: 10 ou 11 dígitos. Sempre prefixar 55.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Já está com código de país (>= 12) — assume que tá ok
  if (digits.length >= 12) return digits;
  return null;
}

/** Roda 1 ciclo de verificação. Chamado pelo cron a cada 5min. */
export async function runAgentCentralCheck(): Promise<{
  scanned: number;
  reminded: number;
  skipped_nophone: number;
  skipped_zapi_off: number;
}> {
  const result = { scanned: 0, reminded: 0, skipped_nophone: 0, skipped_zapi_off: 0 };

  if (!isZapiConfigured()) {
    return { ...result, skipped_zapi_off: 1 };
  }

  // 1. Pega todas OSs ativas
  const { data: osRows, error: osErr } = await supabaseAdmin
    .from("service_orders")
    .select("id, os_number, mission_status, mission_started_at, assigned_employee_id, assigned_employee_2_id, status")
    .eq("status", "em_andamento");

  if (osErr) {
    log(`[agent-central] erro buscando OSs: ${osErr.message}`, "cron");
    return result;
  }

  const activeOs = (osRows || []).filter((o: any) =>
    !FINISHED_MISSION_STATUS.has(String(o.mission_status || "").toLowerCase())
  ) as ActiveOsRow[];
  result.scanned = activeOs.length;
  if (activeOs.length === 0) return result;

  const osIds = activeOs.map((o) => o.id);

  // 2. Pega última mission_update de cada OS (uma query, ordenada)
  const { data: updates } = await supabaseAdmin
    .from("mission_updates")
    .select("id, service_order_id, message, created_at")
    .in("service_order_id", osIds)
    .order("created_at", { ascending: false });

  const lastUpdateByOs = new Map<number, MissionUpdateRow>();
  for (const u of (updates || []) as MissionUpdateRow[]) {
    if (!lastUpdateByOs.has(u.service_order_id)) {
      lastUpdateByOs.set(u.service_order_id, u);
    }
  }

  // 3. Pega reminders existentes
  const { data: reminders } = await supabaseAdmin
    .from("agent_central_reminders")
    .select("service_order_id, last_reminded_at, reminder_count")
    .in("service_order_id", osIds);

  const reminderByOs = new Map<number, ReminderRow>();
  for (const r of (reminders || []) as ReminderRow[]) {
    reminderByOs.set(r.service_order_id, r);
  }

  // 4. Pega employees envolvidos (uma query)
  const empIdsSet = new Set<number>();
  for (const o of activeOs) {
    if (o.assigned_employee_id) empIdsSet.add(o.assigned_employee_id);
    if (o.assigned_employee_2_id) empIdsSet.add(o.assigned_employee_2_id);
  }
  const empIds = Array.from(empIdsSet);
  const empById = new Map<number, EmployeeRow>();
  if (empIds.length > 0) {
    const { data: emps } = await supabaseAdmin
      .from("employees")
      .select("id, name, phone")
      .in("id", empIds);
    for (const e of (emps || []) as EmployeeRow[]) empById.set(e.id, e);
  }

  const now = new Date();

  // Pacing GLOBAL do ciclo (não por OS): garante pausa humana entre QUALQUER par
  // de envios, inclusive entre OSs diferentes. Sem isso, o mesmo agente em duas
  // OSs receberia mensagens quase coladas — o padrão de spam que causou bloqueio.
  let firstSendGlobal = true;

  // 5. Pra cada OS, decide se precisa cobrar.
  // ANTI-BLOQUEIO: ordem ALEATÓRIA das OSs a cada ciclo — robô percorre sempre na
  // mesma sequência; humano não tem ordem fixa.
  for (const os of shuffle(activeOs)) {
    const lastUpd = lastUpdateByOs.get(os.id);
    const baseTimestampStr = lastUpd?.created_at || os.mission_started_at;
    if (!baseTimestampStr) continue; // sem referência temporal, pula

    const baseTime = new Date(baseTimestampStr);
    const minutesSinceUpdate = minutesBetween(now, baseTime);

    const pernoite = isPernoiteMessage(lastUpd?.message || null);
    const threshold = pernoite ? GAP_MINUTES_PERNOITE : GAP_MINUTES_RODANDO;

    if (minutesSinceUpdate < threshold) continue; // ainda dentro da janela

    // Já estourou. Verifica se já cobramos recentemente (< 30min).
    const existing = reminderByOs.get(os.id);
    if (existing) {
      const lastRem = new Date(existing.last_reminded_at);
      const minutesSinceReminder = minutesBetween(now, lastRem);
      // ANTI-BLOQUEIO: intervalo com BACKOFF + jitter (não mais 30min cravado).
      // Quanto mais o agente ignora, mais espaçada fica a re-cobrança — menos
      // mensagens repetidas no mesmo número = menos cara de robô.
      if (minutesSinceReminder < reminderIntervalMinutes(existing.reminder_count)) continue;
    }

    // Coletar destinatários
    const phones: { name: string; phone: string }[] = [];
    for (const eid of [os.assigned_employee_id, os.assigned_employee_2_id]) {
      if (!eid) continue;
      const emp = empById.get(eid);
      if (!emp) continue;
      const intl = toIntlPhone(emp.phone);
      if (intl) phones.push({ name: emp.name, phone: intl });
    }

    if (phones.length === 0) {
      result.skipped_nophone++;
      log(`[agent-central] OS ${os.os_number || os.id}: sem telefone vinculado, pulando`, "cron");
      continue;
    }

    const lastTime = fmtTimeBRT(baseTimestampStr);
    const elapsed = fmtElapsed(minutesSinceUpdate);
    const estado = pernoite ? "PERNOITE" : "RODANDO";
    const osLabel = os.os_number || `#${os.id}`;

    let sentAny = false;
    // ANTI-BLOQUEIO: ordem aleatória dos destinatários (não sempre o titular 1º).
    for (const p of shuffle(phones)) {
      try {
        // ANTI-BLOQUEIO: cada agente recebe um texto DIFERENTE (IA + fallback),
        // nunca o mesmo template — mensagens idênticas em rajada disparam ban.
        const msg = await buildReminderMessage({
          osLabel,
          trigger: "cron",
          estado,
          lastTime,
          elapsed,
        });
        // RITMO HUMANO: pausa aleatória mais larga entre QUALQUER par de envios do
        // ciclo (inclusive entre OSs) + "digitando..." PROPORCIONAL ao tamanho da
        // mensagem (humano leva mais tempo pra escrever texto maior).
        if (!firstSendGlobal) await sleep(humanDelayMs(6000, 26000));
        firstSendGlobal = false;
        const r = await sendText({
          groupOrPhone: p.phone,
          message: msg,
          delayTypingSeconds: typingSecondsForMessage(msg),
        });
        if (r.ok) {
          sentAny = true;
          log(`[agent-central] OS ${os.os_number || os.id} → ${p.name} (${p.phone}) OK`, "cron");
        } else {
          log(`[agent-central] OS ${os.os_number || os.id} → ${p.name} FALHOU: ${r.error}`, "cron");
        }
      } catch (e: any) {
        log(`[agent-central] OS ${os.os_number || os.id} → ${p.name} ERRO: ${e.message}`, "cron");
      }
    }

    if (sentAny) {
      result.reminded++;
      // Upsert no agent_central_reminders
      const newCount = (existing?.reminder_count || 0) + 1;
      await supabaseAdmin
        .from("agent_central_reminders")
        .upsert({
          service_order_id: os.id,
          last_reminded_at: now.toISOString(),
          reminder_count: newCount,
        }, { onConflict: "service_order_id" });
    }
  }

  return result;
}
