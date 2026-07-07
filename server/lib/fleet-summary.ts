/**
 * Resumo operacional da FROTA para o PV (DM) do bot WhatsApp.
 *
 * Quando um número AUTORIZADO manda "resumo" no privado da Central, o bot
 * responde com um panorama de TODOS os veículos cadastrados: quais estão
 * disponíveis, quais estão em viagem (rota, km, agentes) e um bloco de totais.
 *
 * DIFERENÇA vs. o "resumo" dos grupos de cliente (agent-central-mention):
 * aqui é o DONO no privado, então o FATURAMENTO (Fat.) PODE aparecer. No grupo
 * do cliente ele nunca aparece. Por isso a restrição a 3 números autorizados.
 *
 * SÓ EXIBIÇÃO: não escreve billing nem toca em nenhuma regra de faturamento —
 * lê os mesmos dados do Grid Operacional e formata como texto.
 */

import { storage } from "../storage";
import { supabaseAdmin } from "../supabase";
import { sendText, isZapiConfigured } from "./zapi";
import { shortLocal } from "./agent-central-mention";
import {
  calcularFaturamentoLive,
  calcHorasElapsedLocal,
  extractKmFromText,
  haversineDistanceKm,
  splitMissionCostsForBilling,
} from "../billing-calc";

// ── Autorização (só o dono/gestão no PV) ────────────────────────────────────
// Ordem do dono: só estes números veem o resumo com faturamento. Qualquer outro
// número no PV é IGNORADO em silêncio (anti-ban: bot não responde a estranhos).
const DEFAULT_ALLOWED_PHONES = ["11963696699", "11954563755", "11972368645"];

/**
 * Lista autorizada (últimos 11 dígitos = DDD + número), com override por env.
 * Casa pelos 11 finais pra tolerar o DDI 55 que a Z-API embute no senderPhone,
 * sem afrouxar a checagem (suffix curto poderia liberar número de outro DDD).
 */
function allowedSuffixes(): string[] {
  const env = process.env.WHATSAPP_RESUMO_ALLOWED_PHONES;
  const raw = env ? env.split(",") : DEFAULT_ALLOWED_PHONES;
  return raw
    .map((s) => String(s).replace(/\D/g, ""))
    .filter((d) => d.length >= 11)
    .map((d) => d.slice(-11));
}

/** `true` se o telefone (qualquer formato) está na allowlist do resumo. */
export function isAuthorizedResumoPhone(phone: string | null | undefined): boolean {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 11) return false;
  return allowedSuffixes().includes(d.slice(-11));
}

/** `true` se o texto do PV é um pedido de resumo da operação. */
export function isResumoIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(resumo|frota)\b/i.test(text.trim());
}

// ── Helpers de formatação ───────────────────────────────────────────────────
const SEP = "━".repeat(20);

function brtToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function brtDateLabel(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function osDateKey(o: any): string | null {
  const src = o.scheduledDate || o.missionStartedAt || o.completedDate || o.createdAt;
  if (!src) return null;
  try {
    return new Date(parseBRT(src)).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  } catch {
    return null;
  }
}

function parseBRT(v: any): Date {
  const s = String(v);
  return new Date(s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
}

function money(v: number): string {
  return "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function kmLabel(v: number): string {
  return Math.round(Number(v) || 0).toLocaleString("pt-BR") + " km";
}

function firstName(name: string | null | undefined): string {
  const t = String(name || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0].toUpperCase();
}

/** Nomes (2 primeiros) dos agentes de um conjunto de OSs, sem repetir. */
function agentsOf(orders: any[], empMap: Map<number, any>): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const o of orders) {
    for (const id of [o.assignedEmployeeId, o.assignedEmployee2Id]) {
      if (!id) continue;
      const fn = firstName(empMap.get(id)?.name);
      if (fn && !seen.has(fn)) {
        seen.add(fn);
        names.push(fn);
      }
    }
  }
  return names.slice(0, 2).join(" / ");
}

// ── Faturamento por OS (espelha o Grid Operacional, SÓ leitura) ─────────────
const FINISHED_MISSION = new Set([
  "encerrada",
  "finalizada",
  "retorno_base",
  "chegada_base",
  "cancelada",
  "recusada",
]);

const EXCLUDED_OS_STATUS = new Set(["recusada", "cancelada"]);

function isActiveMission(o: any): boolean {
  if (o.status !== "em_andamento") return false;
  // missionStatus vazio/null em OS "em_andamento" é estado transitório — conta
  // como EM VIAGEM. Só exclui quando o missionStatus é explicitamente finalizado.
  const ms = String(o.missionStatus || "").toLowerCase();
  return !FINISHED_MISSION.has(ms);
}

function isFutureScheduled(o: any): boolean {
  if (o.status !== "agendada" || !o.scheduledDate) return false;
  return parseBRT(o.scheduledDate).getTime() > Date.now();
}

function computeKmRota(o: any): number {
  const kmTexto = extractKmFromText(o.destination) || extractKmFromText(o.route);
  if (kmTexto) return kmTexto;
  if (o.originLat && o.originLng && o.destinationLat && o.destinationLng) {
    let km = haversineDistanceKm(
      Number(o.originLat),
      Number(o.originLng),
      Number(o.destinationLat),
      Number(o.destinationLng),
    ) * 1.4;
    if (o.pedagioIdaVolta) km *= 2;
    return Math.round(km);
  }
  return 0;
}

interface BillingCtx {
  photosByOS: Map<number, any[]>;
  costsByOS: Map<number, any[]>;
  contractById: Map<number, any>;
  activeContractByClient: Map<number, any>;
}

const DEFAULT_CONTRATO: any = {
  valor_km_carregado: 2.8,
  valor_km_vazio: 1.4,
  franquia_minima_km: 50,
  valor_hora_estadia: 50,
  valor_diaria: 200,
  vrp_base: 150,
};

function latestPhotoByStep(photos: any[], step: string): any | undefined {
  let best: any | undefined;
  for (const p of photos) {
    if (p.step !== step) continue;
    if (!best || new Date(p.createdAt || 0).getTime() >= new Date(best.createdAt || 0).getTime()) best = p;
  }
  return best;
}

/** Faturamento ao vivo de uma OS, igual ao card do Grid Operacional. */
function osFaturamento(o: any, ctx: BillingCtx): number {
  // Congelado (missão concluída) → usa o valor imutável.
  if (o.custosCongeladosEm && o.fatCalculado != null) {
    return Number(o.fatCalculado) || 0;
  }

  const contrato = o.escortContractId
    ? ctx.contractById.get(o.escortContractId) || DEFAULT_CONTRATO
    : o.clientId
      ? ctx.activeContractByClient.get(o.clientId) || DEFAULT_CONTRATO
      : DEFAULT_CONTRATO;

  const photos = ctx.photosByOS.get(o.id) || [];
  const kmSaida = photos.find((p) => p.step === "km_saida");
  const kmChegada = photos.find((p) => p.step === "km_chegada");
  const kmFinal = latestPhotoByStep(photos, "km_final");
  const kmInicial = Number(kmChegada?.kmValue) || Number(kmSaida?.kmValue) || 0;
  const kmAtual = Number(kmFinal?.kmValue) || kmInicial;
  const kmFinalNorm = kmAtual > kmInicial ? kmAtual : kmInicial;

  const missionNotStartedYet = !o.missionStatus || o.missionStatus === "aguardando";
  const skipHours = missionNotStartedYet || (o.status === "agendada" && isFutureScheduled(o));
  const horasMissao = skipHours ? 0 : calcHorasElapsedLocal(o.missionStartedAt, o.completedDate, o.scheduledDate);

  const kmRota = computeKmRota(o) || undefined;

  const billing = calcularFaturamentoLive({ horasMissao, kmInicial, kmFinal: kmFinalNorm, contrato, kmRota });
  let fatBase = billing.fat_total;
  if (fatBase === 0 && o.status === "agendada" && o.valorEstimado) {
    fatBase = Number(o.valorEstimado) || 0;
  }

  const { despesas_pedagio, receitas_os } = splitMissionCostsForBilling(ctx.costsByOS.get(o.id) || []);
  return Math.round((fatBase + despesas_pedagio + receitas_os) * 100) / 100;
}

async function fetchByOsIdsChunked(table: string, ids: number[], columns: string): Promise<any[]> {
  const out: any[] = [];
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin.from(table).select(columns).in("service_order_id", slice);
    if (data) out.push(...data);
  }
  return out;
}

// ── Builder principal ───────────────────────────────────────────────────────
export async function buildFleetOperationalSummary(): Promise<string> {
  const [vehicles, orders, employees] = await Promise.all([
    storage.getVehicles(),
    storage.getServiceOrders(),
    storage.getEmployees(),
  ]);

  const empMap = new Map<number, any>(employees.map((e: any) => [e.id, e]));
  const today = brtToday();

  // OSs relevantes p/ faturamento: em viagem + as do dia (exclui recusada/cancelada).
  const relevant = orders.filter(
    (o: any) => !EXCLUDED_OS_STATUS.has(String(o.status)) && (isActiveMission(o) || osDateKey(o) === today),
  );
  const relevantIds = relevant.map((o: any) => o.id);

  // Contexto de billing (fotos, custos, contratos) — batch.
  const ctx: BillingCtx = {
    photosByOS: new Map(),
    costsByOS: new Map(),
    contractById: new Map(),
    activeContractByClient: new Map(),
  };
  if (relevantIds.length > 0) {
    const [photos, costs, contractsRes] = await Promise.all([
      fetchByOsIdsChunked("mission_photos", relevantIds, "service_order_id, step, km_value, created_at"),
      fetchByOsIdsChunked("mission_costs", relevantIds, "service_order_id, amount, category, cost_type"),
      supabaseAdmin.from("escort_contracts").select("*"),
    ]);
    for (const p of photos) {
      const arr = ctx.photosByOS.get(p.service_order_id) || [];
      arr.push({ step: p.step, kmValue: p.km_value, createdAt: p.created_at });
      ctx.photosByOS.set(p.service_order_id, arr);
    }
    for (const c of costs) {
      const arr = ctx.costsByOS.get(c.service_order_id) || [];
      arr.push(c);
      ctx.costsByOS.set(c.service_order_id, arr);
    }
    for (const c of contractsRes.data || []) {
      if (c.id) ctx.contractById.set(c.id, c);
      if (c.status === "Ativo" && c.client_id && !ctx.activeContractByClient.has(c.client_id)) {
        ctx.activeContractByClient.set(c.client_id, c);
      }
    }
  }

  // Índice de OSs por veículo.
  const ordersByVehicle = new Map<number, any[]>();
  for (const o of orders) {
    if (!o.vehicleId) continue;
    const arr = ordersByVehicle.get(o.vehicleId) || [];
    arr.push(o);
    ordersByVehicle.set(o.vehicleId, arr);
  }

  const disponiveis: string[] = [];
  const emViagem: string[] = [];
  let proximaViagemPendentes = 0;

  const sortedVehicles = [...vehicles].sort((a: any, b: any) =>
    String(a.plate || "").localeCompare(String(b.plate || ""), "pt-BR"),
  );

  for (const v of sortedVehicles) {
    const plate = String(v.plate || "—").toUpperCase();
    const vOrders = ordersByVehicle.get(v.id) || [];
    const activeOrders = vOrders.filter(isActiveMission);
    const todayOrders = vOrders.filter(
      (o: any) => osDateKey(o) === today && !EXCLUDED_OS_STATUS.has(String(o.status)),
    );

    const todayCount = todayOrders.length;
    const todayFat = todayOrders.reduce((s: number, o: any) => s + osFaturamento(o, ctx), 0);
    const osLine = todayCount > 0 ? `OS: ${todayCount} | Fat.: ${money(todayFat)}` : "OS: 0";

    if (activeOrders.length > 0) {
      // EM VIAGEM: usa a missão ativa mais recente como principal.
      const primary = [...activeOrders].sort(
        (a, b) => parseBRT(b.missionStartedAt || b.scheduledDate || 0).getTime() - parseBRT(a.missionStartedAt || a.scheduledDate || 0).getTime(),
      )[0];
      const origem = shortLocal(primary.origin) || "—";
      const destino = shortLocal(primary.destination) || "—";
      const km = computeKmRota(primary);
      const agentes = agentsOf([primary], empMap) || "—";
      emViagem.push(
        [
          `🚚 ${plate}`,
          `📍 ${origem} ➜ ${destino}`,
          `📏 ${kmLabel(km)}`,
          `👥 ${agentes}`,
          `📦 ${osLine}`,
        ].join("\n"),
      );
    } else {
      // DISPONÍVEL: OS do dia + próxima viagem agendada.
      const agentes = agentsOf(todayOrders, empMap) || "—";
      const proxima = vOrders
        .filter(isFutureScheduled)
        .sort((a, b) => parseBRT(a.scheduledDate).getTime() - parseBRT(b.scheduledDate).getTime())[0];
      const proximaLabel = proxima?.osNumber || "Não";
      if (proxima) proximaViagemPendentes++;
      disponiveis.push(
        [
          `🚚 ${plate}`,
          `• ${osLine}`,
          `• Agentes: ${agentes}`,
          `• Próxima viagem: ${proximaLabel}`,
        ].join("\n"),
      );
    }
  }

  const parts: string[] = [];
  parts.push(`🛡️ RESUMO OPERACIONAL — ${brtDateLabel()}`);
  parts.push("");
  parts.push(`🟢 DISPONÍVEIS (${disponiveis.length})`);
  parts.push("");
  parts.push(disponiveis.length ? disponiveis.join("\n\n") : "—");
  parts.push("");
  parts.push(SEP);
  parts.push("");
  parts.push(`🟡 EM VIAGEM (${emViagem.length})`);
  parts.push("");
  parts.push(emViagem.length ? emViagem.join("\n\n") : "—");
  parts.push("");
  parts.push(SEP);
  parts.push("");
  parts.push("📊 RESUMO");
  parts.push(`• Total de VTR: ${vehicles.length}`);
  parts.push(`• 🟢 Disponíveis: ${disponiveis.length}`);
  parts.push(`• 🟡 Em viagem: ${emViagem.length}`);
  parts.push(`• Próxima viagem pendente: ${proximaViagemPendentes}`);

  return parts.join("\n");
}

/**
 * Trata um pedido de resumo vindo do PV. Silencioso quando não é o caso
 * (não-resumo, número não autorizado, Z-API off) — anti-ban.
 */
export async function handlePvResumoRequest(msg: {
  chatId: string;
  senderPhone: string | null;
  text: string | null;
}): Promise<void> {
  try {
    if (!isResumoIntent(msg.text)) return;
    if (!isAuthorizedResumoPhone(msg.senderPhone || msg.chatId)) return;
    if (!isZapiConfigured()) return;
    const text = await buildFleetOperationalSummary();
    await sendText({ groupOrPhone: msg.chatId, message: text, senderName: "Central Torres" });
  } catch (e: any) {
    console.warn("[fleet-summary] handlePvResumoRequest:", e?.message);
  }
}
