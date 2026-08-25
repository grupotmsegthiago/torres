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

/**
 * Status que bloqueiam create_boletim_approval_atomic (PR5B1_TX_SNAPSHOT_FROZEN_BILLING).
 * APROVADA = aprovação interna e pode entrar no snapshot sem reabrir.
 * Só faturada/paga bloqueia o envio.
 */
export function isSnapshotFrozenBillingStatus(status: unknown): boolean {
  return isInvoicedBillingStatus(status);
}

/** Envio de boletim nunca reabre APROVADA (aprovação interna ≠ aprovação do cliente). */
export function isReopenableForBoletimResend(_status: unknown): boolean {
  return false;
}

export function isInvoicedBillingStatus(status: unknown): boolean {
  const st = normalizeBillingStatus(status);
  return st === "FATURADO" || st === "FATURADA" || st === "PAGO";
}

export type BoletimSendPartition = {
  sendable: any[];
  /** Informativo: OS com APROVADA (interna) — entram no envio sem reabrir. */
  aprovadas: any[];
  faturadas: any[];
};

/** Parte billings para o fluxo enviar/reenviar medição ao cliente. */
export function partitionBillingsForBoletimSend(billings: any[]): BoletimSendPartition {
  const sendable: any[] = [];
  const aprovadas: any[] = [];
  const faturadas: any[] = [];
  for (const b of billings || []) {
    const st = normalizeBillingStatus(b?.status);
    if (st === "FATURADO" || st === "FATURADA" || st === "PAGO") {
      faturadas.push(b);
    } else {
      if (st === "APROVADA") aprovadas.push(b);
      sendable.push(b);
    }
  }
  return { sendable, aprovadas, faturadas };
}

export function billingOsLabel(b: any): string {
  return String(b?.os_number || (b?.service_order_id != null ? `OS-${b.service_order_id}` : b?.id || "?"));
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
