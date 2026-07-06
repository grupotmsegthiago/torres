/**
 * Resumo operacional interno por viatura (VTR) — só para telefones autorizados.
 * Enviado no PV de quem pediu, nunca no grupo.
 */

import { supabaseAdmin } from "../supabase";
import { normalizePhone } from "./normalize-contact";
import { brtDateKey } from "./brt-date";
import { haversineDist } from "../routes/_helpers";
import { extractKmFromText } from "../billing-calc";

/** Únicos celulares que podem receber o resumo de VTR (11 dígitos, com DDD). */
export const RESUMO_AUTHORIZED_PHONES = ["11954563755", "11963696699"] as const;

const FINISHED_MISSION_STATUS = new Set([
  "encerrada", "retorno_base", "chegada_base", "finalizada", "cancelada", "recusada",
]);

function samePhone11(a: string, b: string): boolean {
  return a.slice(-11) === b.slice(-11);
}

/** Telefone autorizado a pedir/receber o resumo de VTR? */
export function isResumoAuthorizedPhone(phone: string | null | undefined): boolean {
  const d = normalizePhone(phone);
  if (!d) return false;
  return RESUMO_AUTHORIZED_PHONES.some((auth) => samePhone11(d, auth));
}

function firstName(full?: string | null): string {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0] || "";
}

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function osDistanciaKm(o: {
  origin?: string | null;
  destination?: string | null;
  route?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  pedagio_ida_volta?: boolean | null;
}): number | null {
  const fromText = extractKmFromText(o.destination) || extractKmFromText(o.route);
  if (fromText) return fromText;
  const oLat = Number(o.origin_lat);
  const oLng = Number(o.origin_lng);
  const dLat = Number(o.destination_lat);
  const dLng = Number(o.destination_lng);
  if (!oLat || !oLng || !dLat || !dLng) return null;
  let km = Math.round(haversineDist(oLat, oLng, dLat, dLng) / 1000 * 1.4);
  if (o.pedagio_ida_volta) km *= 2;
  return km;
}

function vtrStatusLabel(activeOs: any | null): string {
  if (!activeOs) return "DISPONÍVEL";
  const ms = String(activeOs.mission_status || "").toLowerCase();
  if (FINISHED_MISSION_STATUS.has(ms)) return "DISPONÍVEL";
  if (ms === "aguardando" || ms === "agendada") return "AGENDADA";
  return "EM VIAGEM";
}

interface FleetOsRow {
  id: number;
  os_number: string | null;
  vehicle_id: number | null;
  status: string | null;
  mission_status: string | null;
  origin: string | null;
  destination: string | null;
  route: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  pedagio_ida_volta: boolean | null;
  scheduled_date: string | null;
  mission_started_at: string | null;
  completed_date: string | null;
  assigned_employee_id: number | null;
  assigned_employee_2_id: number | null;
}

/**
 * Monta o resumo de todas as viaturas cadastradas (VTR 01..N).
 * Pura leitura do banco — não envia mensagem.
 */
export async function buildFleetVtrSummary(): Promise<string> {
  const today = brtDateKey(new Date().toISOString()) || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const { data: vehicles } = await supabaseAdmin
    .from("vehicles")
    .select("id, plate, frota, status")
    .order("frota", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  const vtrs = (vehicles || []) as Array<{ id: number; plate: string; frota: string | null; status: string | null }>;
  if (vtrs.length === 0) {
    return "Nenhuma viatura cadastrada no sistema.";
  }

  const { data: osRows } = await supabaseAdmin
    .from("service_orders")
    .select(
      "id, os_number, vehicle_id, status, mission_status, origin, destination, route, " +
      "origin_lat, origin_lng, destination_lat, destination_lng, pedagio_ida_volta, " +
      "scheduled_date, mission_started_at, completed_date, assigned_employee_id, assigned_employee_2_id",
    )
    .not("vehicle_id", "is", null);

  const allOs = ((osRows || []) as FleetOsRow[]).filter((o) => o.vehicle_id);

  const osTodayByVehicle = new Map<number, FleetOsRow[]>();
  for (const o of allOs) {
    const vid = o.vehicle_id!;
    const day =
      brtDateKey(o.scheduled_date) ||
      brtDateKey(o.mission_started_at) ||
      brtDateKey(o.completed_date);
    if (day !== today) continue;
    if (!osTodayByVehicle.has(vid)) osTodayByVehicle.set(vid, []);
    osTodayByVehicle.get(vid)!.push(o);
  }

  const osIdsToday = Array.from(osTodayByVehicle.values()).flat().map((o) => o.id);
  const fatByOs = new Map<number, number>();
  if (osIdsToday.length > 0) {
    const { data: billings } = await supabaseAdmin
      .from("escort_billings")
      .select("service_order_id, fat_total")
      .in("service_order_id", osIdsToday);
    for (const b of (billings || []) as Array<{ service_order_id: number; fat_total: number | null }>) {
      fatByOs.set(b.service_order_id, Number(b.fat_total) || 0);
    }
  }

  const empIds = new Set<number>();
  for (const o of allOs) {
    if (o.assigned_employee_id) empIds.add(o.assigned_employee_id);
    if (o.assigned_employee_2_id) empIds.add(o.assigned_employee_2_id);
  }
  const nomePorEmp = new Map<number, string>();
  if (empIds.size > 0) {
    const { data: emps } = await supabaseAdmin
      .from("employees")
      .select("id, name")
      .in("id", Array.from(empIds));
    for (const e of (emps || []) as Array<{ id: number; name: string | null }>) {
      nomePorEmp.set(e.id, firstName(e.name));
    }
  }

  const activeOsByVehicle = new Map<number, FleetOsRow>();
  for (const o of allOs) {
    if (o.status !== "em_andamento") continue;
    if (FINISHED_MISSION_STATUS.has(String(o.mission_status || "").toLowerCase())) continue;
    const vid = o.vehicle_id!;
    if (!activeOsByVehicle.has(vid)) activeOsByVehicle.set(vid, o);
  }

  const lines: string[] = [];
  lines.push(`🛡️ *RESUMO VTR — ${today.split("-").reverse().join("/")}*`);
  lines.push("");

  vtrs.forEach((v, idx) => {
    const n = String(idx + 1).padStart(2, "0");
    const plate = (v.plate || "—").toUpperCase();
    const current = activeOsByVehicle.get(v.id) || null;
    const status = vtrStatusLabel(current);

    lines.push(`VTR ${n} - *${plate}* - *${status}*`);
    lines.push("");

    if (current) {
      lines.push(`Origem: ${current.origin || "—"}`);
      lines.push(`Destino: ${current.destination || "—"}`);
      const dist = osDistanciaKm(current);
      lines.push(`Distancia: ${dist != null ? `${dist} km` : "—"}`);
    } else {
      lines.push("Origem: —");
      lines.push("Destino: —");
      lines.push("Distancia: —");
    }
    lines.push("");

    const todayList = (osTodayByVehicle.get(v.id) || [])
      .slice()
      .sort((a, b) => String(a.scheduled_date || a.mission_started_at || "").localeCompare(String(b.scheduled_date || b.mission_started_at || "")));

    lines.push(`Quantas OS pra ela hoje? ${todayList.length}`);

    const fatTotal = todayList.reduce((sum, o) => sum + (fatByOs.get(o.id) || 0), 0);
    lines.push(`Qual faturamento dela hoje? ${todayList.length > 0 ? fmtBRL(fatTotal) : "—"}`);

    const agentOs = current || todayList[0] || null;
    const agentes = agentOs
      ? [agentOs.assigned_employee_id, agentOs.assigned_employee_2_id]
          .map((id) => (typeof id === "number" ? nomePorEmp.get(id) : "") || "")
          .filter(Boolean)
          .join(" e ")
      : "";
    lines.push(`Nome dos agentes? ${agentes || "—"}`);
    lines.push("");

    const upcoming = todayList.filter((o) => !current || o.id !== current.id);
    if (upcoming.length === 0) {
      lines.push("Tem mais alguma viagem pra ela, após essa? Não");
    } else {
      const lista = upcoming
        .map((o) => o.os_number || `#${o.id}`)
        .join(", ");
      lines.push(`Tem mais alguma viagem pra ela, após essa? Sim — ${lista}`);
    }

    lines.push("");
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
