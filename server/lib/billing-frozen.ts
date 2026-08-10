export const COMMERCIAL_FROZEN_BILLING_STATUSES = new Set([
  "APROVADA",
  "FATURADO",
  "FATURADA",
  "PAGO",
]);

export const CANCELLED_PROTECTED_BILLING_STATUSES = new Set([
  "CANCELADO",
  "CANCELADA",
]);

export const GENERIC_RECALC_PROTECTED_STATUSES = new Set([
  "APROVADA",
  "FATURADO",
  "FATURADA",
  "PAGO",
  "CANCELADO",
  "CANCELADA",
]);

export function normalizeBillingStatus(status: unknown): string {
  return String(status || "").trim().toUpperCase();
}

export function isBillingStatusProtected(status: unknown): boolean {
  return GENERIC_RECALC_PROTECTED_STATUSES.has(normalizeBillingStatus(status));
}

export async function billingHasCommercialSnapshot(
  sb: any,
  billingId: string | number | null | undefined,
  lockVersion: number = 0,
): Promise<boolean> {
  if (billingId == null || billingId === "") {
    throw new Error("ID do billing é obrigatório para verificar snapshot comercial");
  }

  const { data, error } = await sb.rpc("is_escort_billing_snapshotted", {
    p_billing_id: String(billingId),
    p_lock_version: Number(lockVersion) || 0,
  });

  if (error) {
    throw new Error(`Falha ao verificar snapshot comercial: ${error.message}`);
  }
  return data === true;
}

export async function isBillingProtected(
  sb: any,
  billing: {
    id?: string | number | null;
    status?: unknown;
    lock_version?: number | null;
  } | null | undefined,
): Promise<boolean> {
  if (!billing) return false;
  if (isBillingStatusProtected(billing.status)) return true;
  return billingHasCommercialSnapshot(
    sb,
    billing.id,
    Number(billing.lock_version) || 0,
  );
}
