import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseBRL(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
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
