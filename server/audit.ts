import { supabaseAdmin } from "./supabase";

export async function logSystemAudit(params: {
  userId?: number; userName?: string; userRole?: string;
  action: string; targetId?: string; targetType?: string;
  details?: string; ipAddress?: string;
}) {
  try {
    await supabaseAdmin.from("system_audit_logs").insert({
      user_id: params.userId ?? null,
      user_name: params.userName ?? null,
      user_role: params.userRole ?? null,
      action: params.action,
      target_id: params.targetId ?? null,
      target_type: params.targetType ?? null,
      details: params.details ?? null,
      ip_address: params.ipAddress ?? null,
    });
  } catch (_e) {}
}
