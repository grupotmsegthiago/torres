/**
 * Feature flags da folha Control iD.
 *
 * Deploy controlado: manter CONTROL_ID_CANONICAL_PAIRING=false até homologação
 * em produção; first_last permanece só como referência histórica de cálculo
 * (não deve alimentar pagamento após ativar a flag).
 */

function envTruthy(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Motor canônico (pares + cluster + cap). Default: desligado. */
export function isCanonicalPairingEnabled(): boolean {
  return envTruthy("CONTROL_ID_CANONICAL_PAIRING");
}

/**
 * Exige tabela control_id_punch_audit em mutações.
 * Default: ligado só quando o pairing canônico está ligado.
 * Override: CONTROL_ID_PUNCH_AUDIT_ENFORCE=true|false
 */
export function isPunchAuditEnforced(): boolean {
  const raw = process.env.CONTROL_ID_PUNCH_AUDIT_ENFORCE;
  if (raw != null && String(raw).trim() !== "") {
    return envTruthy("CONTROL_ID_PUNCH_AUDIT_ENFORCE");
  }
  return isCanonicalPairingEnabled();
}
