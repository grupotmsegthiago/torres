import { supabaseAdmin } from "./supabase";
import { createSmtpTransporter, getSmtpFrom } from "./routes/_helpers";
import { appendCiencia, manutencaoAberta } from "./lib/manutencao-ciencia";
import {
  CRITICAL_ALERT_CHANNEL,
  formatBrl,
  formatLiters,
  fuelingLimitReason,
  type FuelingLimitViolation,
} from "@shared/fueling-limits";

const ESCOLTA_EMAIL = "escolta@torresseguranca.com.br";
const ADM_EMAIL = "adm@torresseguranca.com.br";

export async function createSystemNotification(input: {
  type: string;
  severity?: "info" | "warning" | "critical";
  title: string;
  message: string;
  targetRole?: "all" | "funcionario" | "admin";
  requireAck?: boolean;
  relatedType?: string | null;
  relatedId?: number | null;
  expiresAt?: Date | null;
}) {
  const row = {
    type: input.type,
    severity: input.severity || "critical",
    title: input.title,
    message: input.message,
    target_role: input.targetRole || "all",
    require_ack: input.requireAck !== false,
    related_type: input.relatedType ?? null,
    related_id: input.relatedId ?? null,
    expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
  };
  const { data, error } = await supabaseAdmin.from("system_notifications").insert(row).select().single();
  if (error) {
    console.error("[system-notification] insert error:", error.message);
    return null;
  }
  return data;
}

/** Avisa na hora quem está logado. O texto fica na notificação; o broadcast só pede o refetch. */
function broadcastCriticalPing() {
  const channel = supabaseAdmin.channel(CRITICAL_ALERT_CHANNEL);
  const subscribed = new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 2000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  void subscribed
    .then(() => channel.send({ type: "broadcast", event: "critical", payload: { t: Date.now() } }))
    .catch((err: any) => console.warn("[critical-broadcast]", err?.message || err))
    .finally(() => {
      supabaseAdmin.removeChannel(channel);
    });
}

/** Recusa de abastecimento acima do teto. Não grava o lançamento; avisa todo mundo logado. */
export async function alertFuelingLimitRejected(input: {
  who: string;
  plate?: string | null;
  vehicleId?: number | null;
  violation: FuelingLimitViolation;
}) {
  const vehicleId = input.vehicleId ?? null;
  if (vehicleId) {
    const since = new Date(Date.now() - 20_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("system_notifications")
      .select("id")
      .eq("type", "fueling_limit")
      .eq("related_id", vehicleId)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      broadcastCriticalPing();
      return;
    }
  }

  const plate = (input.plate || "").trim() || "sem placa";
  const reason = fuelingLimitReason(input.violation);
  await createSystemNotification({
    type: "fueling_limit",
    severity: "critical",
    title: "Abastecimento acima do limite",
    message: `${input.who} tentou lançar abastecimento da viatura ${plate}: R$ ${formatBrl(input.violation.total)} e ${formatLiters(input.violation.liters)} litros. ${reason}. Nada foi gravado no sistema. Corrija o lançamento agora.`,
    targetRole: "all",
    requireAck: true,
    relatedType: vehicleId ? "vehicle" : null,
    relatedId: vehicleId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  broadcastCriticalPing();
}

/** Encerra o aviso na tela. A lista de quem clicou em ciente fica na manutenção. */
export async function encerrarAvisosManutencao(vehicleId: number) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("system_notifications")
    .update({ expires_at: now, require_ack: false })
    .eq("type", "vehicle_maintenance")
    .eq("related_type", "vehicle")
    .eq("related_id", vehicleId)
    .eq("require_ack", true);
  if (error) console.error("[system-notification] encerrar aviso:", error.message);
}

export async function registrarCienciaManutencao(input: {
  vehicleId: number;
  userId: number;
  name: string;
  title?: string | null;
  message?: string | null;
}) {
  const { data: rows, error } = await supabaseAdmin
    .from("vehicle_maintenance")
    .select("id, status, ciencia")
    .eq("vehicle_id", input.vehicleId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    console.error("[manutencao-ciencia] list:", error.message);
    return;
  }
  const aberta = (rows || []).find((row) => manutencaoAberta(row.status));
  const at = new Date().toISOString();
  if (aberta) {
    const ciencia = appendCiencia(aberta.ciencia, { userId: input.userId, name: input.name, at });
    const { error: updErr } = await supabaseAdmin.from("vehicle_maintenance").update({ ciencia }).eq("id", aberta.id);
    if (updErr) console.error("[manutencao-ciencia] update:", updErr.message);
    return;
  }

  const { data: vehicle } = await supabaseAdmin.from("vehicles").select("km").eq("id", input.vehicleId).maybeSingle();
  const texto = `${input.title || ""} ${input.message || ""}`.toLowerCase();
  const type = texto.includes("óleo") || texto.includes("oleo") ? "troca_oleo" : "preventiva";
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { error: insErr } = await supabaseAdmin.from("vehicle_maintenance").insert({
    vehicle_id: input.vehicleId,
    type,
    description: input.title || "Aviso de manutenção",
    date: hoje,
    km: vehicle?.km ?? null,
    status: "em_andamento",
    ciencia: appendCiencia([], { userId: input.userId, name: input.name, at }),
  });
  if (insErr) console.error("[manutencao-ciencia] insert:", insErr.message);
}

export async function notifyVehicleMaintenance(vehicle: {
  id: number;
  plate?: string | null;
  model?: string | null;
  km?: number | null;
}, reason: string) {
  const plate = vehicle.plate || `#${vehicle.id}`;
  const model = vehicle.model || "";
  const kmStr = vehicle.km ? ` (${Number(vehicle.km).toLocaleString("pt-BR")} km)` : "";
  const dataBR = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSystemNotification({
    type: "vehicle_maintenance",
    severity: "critical",
    title: `Veículo ${plate} em manutenção`,
    message: `O veículo ${plate} ${model}${kmStr} entrou em MANUTENÇÃO. Motivo: ${reason}. Não utilizar até liberação.`,
    targetRole: "all",
    requireAck: true,
    relatedType: "vehicle",
    relatedId: vehicle.id,
    expiresAt: expires,
  });

  try {
    const transporter = createSmtpTransporter();
    if (!transporter) {
      console.log("[notify-maint] SMTP not configured, skipping email");
      return;
    }
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#c0392b;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:18px">🔧 Veículo em Manutenção: ${plate}</h2>
        </div>
        <div style="background:#fff;border:1px solid #e0e0e0;padding:24px;border-radius:0 0 8px 8px">
          <p style="margin:0 0 16px;color:#333">O veículo abaixo foi marcado como <strong>EM MANUTENÇÃO</strong> no sistema:</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
            <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold;width:35%">Placa</td><td style="padding:6px 12px">${plate}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Veículo</td><td style="padding:6px 12px">${model || "—"}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">KM Atual</td><td style="padding:6px 12px">${vehicle.km ? Number(vehicle.km).toLocaleString("pt-BR") : "—"}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Motivo</td><td style="padding:6px 12px">${reason}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Marcado em</td><td style="padding:6px 12px">${dataBR}</td></tr>
          </table>
          <div style="background:#fff3cd;border:1px solid #ffeaa7;border-radius:6px;padding:12px;margin-bottom:16px">
            <p style="margin:0;color:#856404;font-size:13px">
              ⚠️ Os funcionários receberão um alerta forçado no aplicativo solicitando ciência sobre a indisponibilidade desta viatura.
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#999">Alerta automático — Torres Vigilância Patrimonial.</p>
        </div>
      </div>`;
    await transporter.sendMail({
      from: getSmtpFrom(),
      to: ESCOLTA_EMAIL,
      cc: ADM_EMAIL,
      subject: `🔧 Manutenção: viatura ${plate} indisponível`,
      html,
    });
    console.log(`[notify-maint] Email sent for vehicle ${plate} (${reason})`);
  } catch (err: any) {
    console.error(`[notify-maint] Email failed for vehicle ${plate}:`, err.message);
  }
}
