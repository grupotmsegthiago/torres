import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseBRL(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const s = value.replace(/[R$\s]/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    } else {
      return parseFloat(s.replace(/,/g, "")) || 0;
    }
  }
  if (s.includes(",")) {
    return parseFloat(s.replace(",", ".")) || 0;
  }
  return parseFloat(s) || 0;
}

export function formatBRLInput(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") return value.toFixed(2).replace(".", ",");
  return value.toString();
}

export function handleMoneyInput(
  value: string,
  setter: (val: string) => void
) {
  const sanitized = value.replace(/[^0-9,.\-]/g, "");
  setter(sanitized);
}

export function maskBRL(raw: string, decimals: number = 2): string {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "0," + "0".repeat(decimals);
  const padded = digits.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, "") || "0";
  const decPart = padded.slice(padded.length - decimals);
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return intFormatted + "," + decPart;
}

export function unmaskBRL(masked: string): string {
  const clean = masked.replace(/[R$\s]/g, "").trim();
  if (!clean) return "0";
  const val = parseBRL(clean);
  return String(val);
}

export function ensureUTC(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const s = String(ts);
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  return s + "Z";
}

export function parseUTCDate(ts: string | Date | null | undefined): Date {
  if (!ts) return new Date(NaN);
  if (ts instanceof Date) return ts;
  const normalized = ts.includes("T") ? ts : ts.replace(" ", "T");
  const withZ = normalized.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + "Z";
  return new Date(withZ);
}

export function formatTimeBRT(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return parseUTCDate(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });
}

export function formatBRT(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return parseUTCDate(date).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDateBRT(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return parseUTCDate(date).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });
}

const LOWERCASE_WORDS = new Set(["de", "do", "da", "dos", "das", "e"]);

export function titleCase(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && LOWERCASE_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
