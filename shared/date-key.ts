/**
 * Helpers para colunas Postgres `date` (YYYY-MM-DD) e datas-calendário BRT.
 * Nunca passar date-only por `new Date("YYYY-MM-DD")` — UTC midnight vira D-1 em BRT.
 */

/** Extrai YYYY-MM-DD sem deslocar o dia calendário. */
export function toDateKey(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  // Prefixo sem hora: já é a data de negócio (DATE / ISO truncado).
  if (!/[T\s]/.test(s.slice(10))) return m[1];
  // Timestamp com hora: dia calendário em BRT.
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const withOffset =
    normalized.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(normalized)
      ? normalized
      : normalized + "Z";
  const d = new Date(withOffset);
  if (isNaN(d.getTime())) return m[1];
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Formata DATE / YYYY-MM-DD como dd/mm/aaaa sem passar por Date/UTC. */
export function formatDateOnlyBR(value: unknown): string {
  const key = toDateKey(value);
  if (!key) return "—";
  const [y, mo, d] = key.split("-");
  return `${d}/${mo}/${y}`;
}
