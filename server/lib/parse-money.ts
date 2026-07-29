/**
 * Normaliza valores monetários vindos do frontend (pt-BR ou en-US) para número.
 * Aceita: "4.000,00" · "4000,00" · "4,000.00" · 4000 · "R$ 4.000,00"
 */
export function parseMoney(value: unknown): number {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const s = String(value).replace(/[R$\s]/g, "").trim();
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      return parseFloat(s.replace(/\./g, "").replace(",", "."));
    }
    return parseFloat(s.replace(/,/g, ""));
  }
  if (s.includes(",")) {
    return parseFloat(s.replace(",", "."));
  }
  return parseFloat(s);
}

/** Converte para string decimal com 2 casas (Postgres numeric). Null se inválido/≤0 quando requirePositive. */
export function toDecimalString(value: unknown, opts?: { allowZero?: boolean }): string | null {
  const n = parseMoney(value);
  if (!Number.isFinite(n)) return null;
  if (!opts?.allowZero && n <= 0) return null;
  if (opts?.allowZero && n < 0) return null;
  return n.toFixed(2);
}
