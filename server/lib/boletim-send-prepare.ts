/**
 * Preparação do envio de boletim comercial (foto única).
 * Alinha pré-checagens da RPC create_boletim_approval_atomic sem recalcular valores.
 */

export function normalizeContractId(value: unknown): string | null {
  const s = String(value ?? "").trim().toLowerCase();
  return s || null;
}

export function contractsMatch(billingContractId: unknown, osContractId: unknown): boolean {
  const a = normalizeContractId(billingContractId);
  const b = normalizeContractId(osContractId);
  if (!a || !b) return false;
  return a === b;
}

export type BoletimSendEligibility = {
  /** Billings aptos ao snapshot comercial (sem recusada/rejeitada). */
  eligible: any[];
  /** Excluídos por OS/billing recusada. */
  refused: any[];
  /** Sem contract_id no billing e sem na OS — bloqueiam o envio. */
  missingContract: any[];
  /** Divergência billing.contract_id × OS.escort_contract_id (curável se billing tem contrato). */
  contractMismatch: Array<{ billing: any; os: any; billingContractId: string | null; osContractId: string | null }>;
};

/**
 * Classifica billings + OS para o envio.
 * Recusada fica de fora (§8.1). Contrato: SSOT da OS deve bater com billing.contract_id.
 */
export function classifyBillingsForBoletimSend(
  billings: any[],
  ordersById: Map<number, any>,
): BoletimSendEligibility {
  const eligible: any[] = [];
  const refused: any[] = [];
  const missingContract: any[] = [];
  const contractMismatch: BoletimSendEligibility["contractMismatch"] = [];

  for (const b of billings || []) {
    const so = ordersById.get(Number(b.service_order_id));
    const soStatus = String(so?.status || "").toLowerCase();
    const billStatus = String(b?.status || "").toUpperCase();

    if (soStatus === "recusada" || billStatus === "REJEITADA" || billStatus === "RECUSADA") {
      refused.push(b);
      continue;
    }

    const billingContractId = normalizeContractId(b.contract_id);
    const osContractId = normalizeContractId(so?.escort_contract_id ?? so?.escortContractId);

    if (!billingContractId && !osContractId) {
      missingContract.push(b);
      continue;
    }

    if (!contractsMatch(billingContractId, osContractId)) {
      contractMismatch.push({ billing: b, os: so, billingContractId, osContractId });
    }

    eligible.push(b);
  }

  return { eligible, refused, missingContract, contractMismatch };
}

/**
 * Heal: aponta OS.escort_contract_id para o contrato congelado no billing
 * (o que efetivamente precificou a OS). Não altera valores financeiros.
 * Retorna IDs de OS que precisam de UPDATE.
 */
export function planContractHeals(
  mismatches: BoletimSendEligibility["contractMismatch"],
): Array<{ serviceOrderId: number; contractId: string; billingId: string; osNumber: string }> {
  const out: Array<{ serviceOrderId: number; contractId: string; billingId: string; osNumber: string }> = [];
  for (const m of mismatches) {
    const soId = Number(m.billing?.service_order_id || m.os?.id || 0);
    // Prefer billing.contract_id cru (formato UUID do banco) — tabela que precificou.
    const rawBilling = String(m.billing?.contract_id ?? "").trim();
    const contractId = rawBilling || m.billingContractId || m.osContractId;
    if (!soId || !contractId) continue;
    if (contractsMatch(contractId, m.osContractId)) continue;
    out.push({
      serviceOrderId: soId,
      contractId,
      billingId: String(m.billing?.id || ""),
      osNumber: String(m.billing?.os_number || m.os?.os_number || m.os?.osNumber || `OS-${soId}`),
    });
  }
  return out;
}
