/** Status NFS-e Asaas que, com número municipal, significam nota emitida. */
const NF_OK_STATUSES = ["AUTHORIZED", "SYNCHRONIZED", "ISSUED"];

export function isNfOkStatus(status: string | null | undefined): boolean {
  return NF_OK_STATUSES.includes(String(status || "").toUpperCase());
}

/** Número municipal real — ignora o id interno do Asaas (`inv_...`). */
export function isFinalNfNumber(nfseNumber: unknown): boolean {
  const n = String(nfseNumber || "").trim();
  return n.length > 0 && !/^inv_/i.test(n);
}

export function isAsaasInvoiceId(nfseNumber: unknown): boolean {
  return /^inv_/i.test(String(nfseNumber || "").trim());
}

/**
 * PROCESSING/PENDING local sem `inv_*`: o Torres ainda não criou a NFS-e no Asaas.
 * Não é fila da prefeitura — esconder o botão Emitir aqui trava a fatura para sempre.
 */
export function isLocalNfProcessingPlaceholder(
  nfseStatus: unknown,
  nfseNumber: unknown,
): boolean {
  if (isAsaasInvoiceId(nfseNumber) || isFinalNfNumber(nfseNumber)) return false;
  const st = String(nfseStatus || "").toUpperCase();
  return st === "" || ["PROCESSING", "PENDING", "SCHEDULED"].includes(st);
}

/** Já existe documento no Asaas (inv_* ou status de fila) — só consultar, não POST. */
export function isQueuedAtPrefecture(nfseStatus: unknown, nfseNumber: unknown): boolean {
  return classifyIssuedOrProcessing(nfseStatus, nfseNumber) === "NF_PROCESSANDO"
    && !isLocalNfProcessingPlaceholder(nfseStatus, nfseNumber);
}

/** NF de fato emitida na prefeitura: status ok + número municipal (não só o id Asaas). */
export function isNfFullyIssued(nfseStatus: unknown, nfseNumber: unknown): boolean {
  return isNfOkStatus(nfseStatus) && isFinalNfNumber(nfseNumber);
}

/**
 * Relatório / UI: AUTHORIZED/SYNCHRONIZED/ISSUED sem número municipal = ainda processando.
 * A nota só existe quando a prefeitura devolve o nº.
 */
export function classifyIssuedOrProcessing(
  nfseStatus: unknown,
  nfseNumber: unknown,
): "NF_EMITIDA" | "NF_PROCESSANDO" | null {
  const st = String(nfseStatus || "").toUpperCase();
  if (["AUTHORIZED", "SYNCHRONIZED", "ISSUED"].includes(st)) {
    return isFinalNfNumber(nfseNumber) ? "NF_EMITIDA" : "NF_PROCESSANDO";
  }
  if (["PROCESSING", "WAITING_MUNICIPAL_PROCESSING", "SCHEDULED", "PENDING"].includes(st)) {
    return "NF_PROCESSANDO";
  }
  return null;
}
