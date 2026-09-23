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

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Valida dia/mês/ano de calendário (sem Date/UTC). */
export function isValidCalendarYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}

/** YYYY-MM-DD → Date local (meio-dia local evita edge de DST). */
export function ymdToLocalDate(ymd: string): Date | null {
  const m = YMD_RE.exec(String(ymd || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!isValidCalendarYmd(y, mo, d)) return null;
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

/** Date local → YYYY-MM-DD (calendário local, sem UTC). */
export function localDateToYmd(date: Date): string | null {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Converte digitação BR (dd/mm/aaaa, com ou sem zeros) → YYYY-MM-DD.
 * Retorna null se incompleto/inválido. Nunca interpreta como MM/DD.
 */
export function parseBrDateToYmd(display: string): string | null {
  const raw = String(display || "").trim();
  if (!raw) return null;
  const asKey = toDateKey(raw);
  if (asKey && YMD_RE.test(asKey) && raw.includes("-")) return asKey;
  const m = BR_RE.exec(raw);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!isValidCalendarYmd(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Máscara de digitação: só dígitos → dd/mm/aaaa (até 8 dígitos). */
export function maskBrDateInput(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** YYYY-MM-DD (ou vazio) → texto dd/mm/aaaa para o input. */
export function ymdToBrDisplay(ymd: string | null | undefined): string {
  const key = toDateKey(ymd ?? "");
  if (!key) return "";
  const [y, mo, d] = key.split("-");
  return `${d}/${mo}/${y}`;
}
