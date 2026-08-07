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
): Promise<boolean> {
  if (billingId == null || billingId === "") {
    throw new Error("ID do billing é obrigatório para verificar snapshot comercial");
  }

  const { data, error } = await sb
    .from("boletim_approvals")
    .select("id")
    .contains("billing_snapshot", [{ billing_id: String(billingId) }])
    .limit(1);

  if (error) {
    throw new Error(`Falha ao verificar snapshot comercial: ${error.message}`);
  }
  return Array.isArray(data) && data.length > 0;
}

export async function isBillingProtected(
  sb: any,
  billing: { id?: string | number | null; status?: unknown } | null | undefined,
): Promise<boolean> {
  if (!billing) return false;
  if (isBillingStatusProtected(billing.status)) return true;
  return billingHasCommercialSnapshot(sb, billing.id);
}
