/** Mesma frase na tela e na API. A NF não sai sem OS em escort_billings. */
export const NF_SEM_OS_MSG =
  "É obrigatório vincular pelo menos 1 Ordem de Serviço (OS) a esta fatura antes de emitir a Nota Fiscal.";

export const NF_CANCELADA_SEM_VINCULO_MSG =
  "Esta fatura está cancelada. Uma nota cancelada não recebe ordem de serviço. Emita uma fatura nova para vincular a OS.";

export function bloqueioNfSemOs(osVinculadas: number): string | null {
  if (!Number.isFinite(osVinculadas) || osVinculadas < 1) return NF_SEM_OS_MSG;
  return null;
}

const BILLING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O id da fatura é numérico. O id do faturamento da OS é UUID. Number(uuid) vira NaN e a API recusava o vínculo. */
export function parseLinkOsPayload(body: unknown): { invoiceId: number; billingIds: string[] } | null {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const invoiceId = Number(raw.invoiceId);
  const source = Array.isArray(raw.billingIds) ? raw.billingIds : [];
  const billingIds = [...new Set(
    source.map((id) => String(id || "").trim()).filter((id) => BILLING_UUID.test(id)),
  )];
  if (!Number.isInteger(invoiceId) || invoiceId <= 0 || billingIds.length === 0) return null;
  return { invoiceId, billingIds };
}

export function faturaCanceladaNaoRecebeOs(invoice: { status?: string | null; nfse_status?: string | null; nfse_cancel_reason?: string | null } | null | undefined): boolean {
  const status = String(invoice?.status || "").trim().toUpperCase();
  const nfse = String(invoice?.nfse_status || "").trim().toUpperCase();
  const reason = String(invoice?.nfse_cancel_reason || "").trim();
  return status === "CANCELED" || status === "CANCELLED" || nfse.includes("CANCEL") || reason.length > 0;
}
