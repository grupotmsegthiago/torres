import { supabaseAdmin } from "../supabase";
import nodemailer from "nodemailer";
import { localQuery, localQuerySingle } from "../pg-fallback";

export async function resilientSupabaseSelect(
  table: string,
  buildQuery: (from: ReturnType<typeof supabaseAdmin.from>) => any,
): Promise<any[]> {
  try {
    const { data, error } = await buildQuery(supabaseAdmin.from(table));
    if (error) throw error;
    return data || [];
  } catch (err: any) {
    console.warn(`[resilient-route] ${table} fallback: ${err.message || err}`);
    return localQuery(table);
  }
}

export async function resilientSupabaseSingle(
  table: string,
  column: string,
  value: any,
  buildQuery?: (from: ReturnType<typeof supabaseAdmin.from>) => any,
): Promise<any | null> {
  try {
    const query = buildQuery
      ? buildQuery(supabaseAdmin.from(table))
      : supabaseAdmin.from(table).select("*").eq(column, value).single();
    const { data, error } = await query;
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  } catch (err: any) {
    console.warn(`[resilient-route] ${table}.${column}=${value} fallback: ${err.message || err}`);
    return localQuerySingle(table, column, value);
  }
}

export function nowBRTString(): string {
  return new Date().toISOString();
}

export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export function createSmtpTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });
}

export function getSmtpFrom() {
  return `"Torres Vigilância Patrimonial" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;
}

export const SMTP_BCC_OS = "thiago@grupotmseg.com.br, operacional@grupotmseg.com.br";
export const SMTP_BCC_WELCOME = "thiago@grupotmseg.com.br";

export function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function distPointToSegment(pt: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const px = toRad(pt.lng) * Math.cos(toRad(pt.lat));
  const py = toRad(pt.lat);
  const ax = toRad(a.lng) * Math.cos(toRad(a.lat));
  const ay = toRad(a.lat);
  const bx = toRad(b.lng) * Math.cos(toRad(b.lat));
  const by = toRad(b.lat);
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }
  const cx = ax + t * dx, cy = ay + t * dy;
  const dLat = py - cy, dLng = px - cx;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371000;
}

export function distToPolyline(pt: { lat: number; lng: number }, polyline: { lat: number; lng: number }[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDist(pt.lat, pt.lng, polyline[0].lat, polyline[0].lng);
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distPointToSegment(pt, polyline[i], polyline[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function findClosestIndex(pt: { lat: number; lng: number }, polyline: { lat: number; lng: number }[]): number {
  let minDist = Infinity, idx = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distPointToSegment(pt, polyline[i], polyline[i + 1]);
    if (d < minDist) { minDist = d; idx = i + 1; }
  }
  return idx;
}

export const MISSION_STEPS = [
  "aguardando",
  "checkout_armamento",
  "checkout_viatura",
  "checkout_km_saida",
  "em_transito_origem",
  "checkin_chegada_km",
  "checkin_veiculo_escoltado",
  "checkin_dados_motorista",
  "iniciar_missao",
  "em_transito_destino",
  "chegada_destino",
  "checkout_km_final",
  "checkout_viatura_retorno",
  "finalizada",
  "retorno_base",
  "chegada_base",
  "encerrada",
] as const;

export const STEP_REQUIRED_PHOTOS: Record<string, string[]> = {
  checkout_armamento: ["arma_pistola_1", "arma_pistola_2", "arma_espingarda"],
  checkout_viatura: ["viatura_frente", "viatura_lateral_esq", "viatura_lateral_dir", "viatura_traseira"],
  checkout_km_saida: ["km_saida"],
  checkin_chegada_km: ["km_chegada", "agente_equipado"],
  checkin_veiculo_escoltado: ["escoltado_frente", "escoltado_traseira"],
  chegada_destino: ["foto_local_destino", "km_final"],
  checkout_km_final: ["km_final"],
  checkout_viatura_retorno: ["viatura_retorno_frente", "viatura_retorno_lateral_esq", "viatura_retorno_lateral_dir", "viatura_retorno_traseira"],
  chegada_base: ["base_viatura_frente", "base_viatura_lateral_esq", "base_viatura_lateral_dir", "base_viatura_traseira", "base_hodometro"],
};

export function toSafeUser(user: any) {
  const { password, ...safe } = user;
  return {
    ...safe,
    mustChangePassword: user.mustChangePassword === 1 || user.mustChangePassword === true,
  };
}

export async function logFinancialAudit(targetTable: string, targetId: string, action: string, changes: { field: string; old: any; new_val: any }[], changedBy: string, changedById?: number, reason?: string) {
  try {
    const rows = changes.map(c => ({
      target_table: targetTable,
      target_id: targetId,
      action,
      field_name: c.field,
      old_value: c.old != null ? String(c.old) : null,
      new_value: c.new_val != null ? String(c.new_val) : null,
      changed_by: changedBy,
      changed_by_id: changedById || null,
      reason: reason || null,
    }));
    await supabaseAdmin.from("financial_audit_logs").insert(rows);
  } catch (_e) {}
}

export async function createAutoTransaction(params: {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  due_date: string;
  origin_type: string;
  origin_id: string;
  category_name?: string;
  entity_name?: string;
  created_by?: string;
}) {
  try {
    if (params.origin_type && params.origin_id) {
      const { data: existing } = await supabaseAdmin
        .from("financial_transactions")
        .select("id, conciliado_em")
        .eq("origin_type", params.origin_type)
        .eq("origin_id", params.origin_id)
        .limit(1);
      if (existing && existing.length > 0) {
        // Se já foi conciliada com fatura externa (TicketLog/etc), NÃO altera:
        // qualquer mudança de valor após conciliação pode descasar o batimento manual.
        if (existing[0].conciliado_em) {
          console.log(`[AutoTransaction] Pulando atualização — transação ${existing[0].id} já conciliada em ${existing[0].conciliado_em}`);
          return existing[0];
        }
        const { data: updated, error: upErr } = await supabaseAdmin
          .from("financial_transactions")
          .update({
            description: params.description,
            amount: params.amount,
            type: params.type,
            due_date: params.due_date,
            category_name: params.category_name || null,
            entity_name: params.entity_name || null,
          })
          .eq("id", existing[0].id)
          .select()
          .single();
        if (upErr) console.error("[AutoTransaction] update error:", upErr.message);
        return updated;
      }
    }
    const { data, error } = await supabaseAdmin.from("financial_transactions").insert({
      description: params.description,
      amount: params.amount,
      type: params.type,
      status: "PENDING",
      due_date: params.due_date,
      origin_type: params.origin_type,
      origin_id: params.origin_id,
      category_name: params.category_name || null,
      entity_name: params.entity_name || null,
      created_by: params.created_by || "SISTEMA",
    }).select().single();
    if (error) console.error("[AutoTransaction] create error:", error.message);
    return data;
  } catch (e: any) {
    console.error("[AutoTransaction] create exception:", e.message);
    return null;
  }
}

export async function removeAutoTransaction(origin_type: string, origin_id: string) {
  try {
    const { error } = await supabaseAdmin.from("financial_transactions")
      .delete()
      .eq("origin_type", origin_type)
      .eq("origin_id", origin_id);
    if (error) console.error("[AutoTransaction] remove error:", error.message);
  } catch (e: any) {
    console.error("[AutoTransaction] remove exception:", e.message);
  }
}
