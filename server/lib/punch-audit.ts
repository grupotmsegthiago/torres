/**
 * Auditoria de autoria de batidas Control iD.
 * Separada de rhid_sync_queue (integração ≠ autoria).
 */
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../supabase";
import { getLockedPeriods, isDateLocked } from "./locked-periods";

export type PunchAuditAction = "create" | "update" | "delete" | "repair";

export interface PunchAuditActor {
  userId?: number | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface PunchAuditInput {
  punchId: number | null;
  employeeId: number | null;
  action: PunchAuditAction;
  beforeRow: unknown;
  afterRow: unknown;
  reason: string;
  actor: PunchAuditActor;
  documentRef?: string | null;
  meta?: Record<string, unknown> | null;
  /** Permite alteração em período fechado (fluxo excepcional). */
  forceLockedOverride?: boolean;
}

function brtNowLabel(d = new Date()): string {
  return d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00";
}

export function assertReason(reason: unknown): string {
  const r = String(reason || "").trim();
  if (r.length < 5) {
    throw new Error("Motivo obrigatório (mín. 5 caracteres) — a alteração impacta folha/pagamento");
  }
  return r;
}

/** Bloqueia mutação em período fechado, salvo override excepcional auditado. */
export async function assertPunchMutable(
  punchAt: unknown,
  opts: { forceLockedOverride?: boolean; role?: string | null; reason?: string } = {},
): Promise<void> {
  const periods = await getLockedPeriods(null);
  if (!isDateLocked(punchAt, periods)) return;
  if (opts.forceLockedOverride) {
    const role = String(opts.role || "").toLowerCase();
    if (role !== "diretoria" && role !== "admin") {
      throw new Error("Período fechado: override exige role diretoria/admin");
    }
    assertReason(opts.reason);
    return;
  }
  throw new Error(
    "Período fechado por folha — alteração comum bloqueada. Use fluxo excepcional (forceLockedOverride + motivo) com autorização.",
  );
}

export async function writePunchAudit(input: PunchAuditInput): Promise<{ id: number | null; requestId: string }> {
  const reason = assertReason(input.reason);
  const requestId = input.actor.requestId || randomUUID();
  const now = new Date();
  const row = {
    punch_id: input.punchId,
    employee_id: input.employeeId,
    action: input.action,
    before_row: input.beforeRow ?? null,
    after_row: input.afterRow ?? null,
    user_id: input.actor.userId ?? null,
    user_name: input.actor.name ?? null,
    user_email: input.actor.email ?? null,
    user_role: input.actor.role ?? null,
    ip_address: input.actor.ip ?? null,
    user_agent: input.actor.userAgent ?? null,
    request_id: requestId,
    reason,
    created_at_utc: now.toISOString(),
    created_at_brt: brtNowLabel(now),
    document_ref: input.documentRef ?? null,
    meta: input.meta ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("control_id_punch_audit")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    // Fail-closed: sem auditoria não muta. Chamador deve tratar.
    throw new Error(`Falha ao gravar auditoria de batida: ${error.message}`);
  }
  return { id: data?.id != null ? Number(data.id) : null, requestId };
}

export function actorFromRequest(req: any): PunchAuditActor {
  const u = req?.user || {};
  return {
    userId: u.id != null ? Number(u.id) : null,
    name: u.name || u.fullName || null,
    email: u.email || null,
    role: u.role || null,
    ip: String(req?.headers?.["x-forwarded-for"] || req?.ip || "").split(",")[0].trim() || null,
    userAgent: req?.headers?.["user-agent"] || null,
    requestId: req?.headers?.["x-request-id"] || null,
  };
}
