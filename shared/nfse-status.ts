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
