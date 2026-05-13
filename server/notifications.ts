import { supabaseAdmin } from "./supabase";
import { createSmtpTransporter, getSmtpFrom } from "./routes/_helpers";

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
