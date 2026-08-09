import { supabaseAdmin } from "../supabase";

export type AtomicBillingAction =
  | "WRITE_OFFICIAL"
  | "UPDATE_OPEN"
  | "WRITE_CANCELLED"
  | "WRITE_REFUSED"
  | "DELETE_OPEN"
  | "FREEZE_COMMERCIAL"
  | "REOPEN_APPROVED"
  | "REOPEN_CANCELLED"
  | "RELEASE_REBILL"
  | "METADATA_OPEN";

export interface AtomicBillingActor {
  userId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
}

export interface AtomicBillingWrite {
  action: AtomicBillingAction;
  payload?: Record<string, unknown>;
  billingId?: string | null;
  serviceOrderId?: number | null;
  expectedVersion?: number | null;
  actor?: AtomicBillingActor;
}

export class AtomicBillingError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "AtomicBillingError";
  }
}

function actorPayload(actor?: AtomicBillingActor) {
  return {
    user_id: actor?.userId ?? null,
    user_name: actor?.userName ?? null,
    user_role: actor?.userRole ?? null,
    reason: actor?.reason ?? null,
    ip_address: actor?.ipAddress ?? null,
  };
}

function throwRpcError(error: any): never {
  throw new AtomicBillingError(
    error?.message || "Falha na operação atômica de billing",
    error?.code,
    error?.details,
  );
}

export async function writeEscortBillingAtomic(
  input: AtomicBillingWrite,
  sb: any = supabaseAdmin,
): Promise<any> {
  const { data, error } = await sb.rpc("write_escort_billing_atomic", {
    p_action: input.action,
    p_payload: input.payload ?? {},
    p_billing_id: input.billingId ?? null,
    p_service_order_id: input.serviceOrderId ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_actor: actorPayload(input.actor),
  });
  if (error) throwRpcError(error);
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function getAtomicBillingRefById(
  billingId: string,
  sb: any = supabaseAdmin,
): Promise<{ id: string; service_order_id: number | null; status: string | null; lock_version: number }> {
  const { data, error } = await sb
    .from("escort_billings")
    .select("id, service_order_id, status, lock_version")
    .eq("id", billingId)
    .single();
  if (error || !data) throwRpcError(error || { message: "Billing não encontrado", code: "P0002" });
  return {
    id: String(data.id),
    service_order_id: data.service_order_id == null ? null : Number(data.service_order_id),
    status: data.status == null ? null : String(data.status),
    lock_version: Number(data.lock_version) || 0,
  };
}

export async function getAtomicBillingRefByServiceOrder(
  serviceOrderId: number,
  sb: any = supabaseAdmin,
): Promise<{ id: string; service_order_id: number; status: string | null; lock_version: number } | null> {
  const { data, error } = await sb
    .from("escort_billings")
    .select("id, service_order_id, status, lock_version")
    .eq("service_order_id", serviceOrderId)
    .maybeSingle();
  if (error) throwRpcError(error);
  if (!data) return null;
  return {
    id: String(data.id),
    service_order_id: Number(data.service_order_id),
    status: data.status == null ? null : String(data.status),
    lock_version: Number(data.lock_version) || 0,
  };
}

export async function updateBillingLifecycleAtomic(
  billingId: string,
  action: Exclude<AtomicBillingAction, "WRITE_OFFICIAL" | "WRITE_CANCELLED" | "WRITE_REFUSED" | "DELETE_OPEN">,
  payload: Record<string, unknown>,
  actor?: AtomicBillingActor,
  sb: any = supabaseAdmin,
) {
  const ref = await getAtomicBillingRefById(billingId, sb);
  const cancelled = ["CANCELADO", "CANCELADA"].includes(
    String(ref.status || "").toUpperCase(),
  );
  const effectivePayload = (
    action === "FREEZE_COMMERCIAL" || action === "RELEASE_REBILL"
  ) && cancelled
    ? { ...payload, status: "CANCELADO" }
    : payload;
  return writeEscortBillingAtomic({
    action,
    billingId,
    serviceOrderId: ref.service_order_id,
    expectedVersion: ref.lock_version,
    payload: effectivePayload,
    actor,
  }, sb);
}

export async function updateBillingLifecycleBatchAtomic(
  billingIds: string[],
  action: Exclude<AtomicBillingAction, "WRITE_OFFICIAL" | "WRITE_CANCELLED" | "WRITE_REFUSED" | "DELETE_OPEN">,
  payload: Record<string, unknown>,
  actor?: AtomicBillingActor,
  sb: any = supabaseAdmin,
) {
  const results: any[] = [];
  for (const billingId of billingIds) {
    // Deliberadamente sequencial: sem retry cego e com erro identificável por ID.
    results.push(await updateBillingLifecycleAtomic(
      billingId,
      action,
      payload,
      actor,
      sb,
    ));
  }
  return results;
}

export interface AtomicApprovalInput {
  token: string;
  clientId: number;
  clientName?: string | null;
  clientEmail?: string | null;
  periodStart: string;
  periodEnd: string;
  billingIds: string[];
  totalValue: number;
  osCount: number;
  sentBy?: string | null;
  sentByUserId?: number | null;
  billingSnapshot: Array<Record<string, unknown> & {
    billing_id: string;
    billing_version: number;
  }>;
}

export async function createBoletimApprovalAtomic(
  input: AtomicApprovalInput,
  sb: any = supabaseAdmin,
) {
  const { data, error } = await sb.rpc("create_boletim_approval_atomic", {
    p_token: input.token,
    p_client_id: input.clientId,
    p_client_name: input.clientName ?? null,
    p_client_email: input.clientEmail ?? null,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_billing_ids: input.billingIds,
    p_total_value: input.totalValue,
    p_os_count: input.osCount,
    p_sent_by: input.sentBy ?? null,
    p_sent_by_user_id: input.sentByUserId ?? null,
    p_billing_snapshot: input.billingSnapshot,
  });
  if (error) throwRpcError(error);
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function freezeBoletimBillingsAtomic(
  approvalId: number,
  approvedByName: string,
  approvedByIp: string,
  approvedAt: string,
  sb: any = supabaseAdmin,
) {
  const { data, error } = await sb.rpc("freeze_boletim_billings_atomic", {
    p_approval_id: approvalId,
    p_approved_by_name: approvedByName,
    p_approved_by_ip: approvedByIp,
    p_approved_at: approvedAt,
  });
  if (error) throwRpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function markBillingsInvoicedAtomic(
  billingIds: string[],
  invoiceId: number,
  faturadoEm: string,
  faturadoPor: string,
  sb: any = supabaseAdmin,
) {
  const { data, error } = await sb.rpc("mark_escort_billings_invoiced_atomic", {
    p_billing_ids: billingIds,
    p_invoice_id: invoiceId,
    p_faturado_em: faturadoEm,
    p_faturado_por: faturadoPor,
  });
  if (error) throwRpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function transitionInvoiceBillingsAtomic(
  invoiceId: number,
  action: "MARK_PAID" | "RELEASE_REBILL",
  transitionedAt: string,
  actor: string,
  sb: any = supabaseAdmin,
) {
  const { data, error } = await sb.rpc("transition_invoice_billings_atomic", {
    p_invoice_id: invoiceId,
    p_action: action,
    p_transitioned_at: transitionedAt,
    p_actor: actor,
  });
  if (error) throwRpcError(error);
  return Array.isArray(data) ? data : [];
}
