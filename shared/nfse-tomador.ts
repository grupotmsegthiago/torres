/** Limites do tomador na NFS-e paulistana (Focus / Prefeitura de SP). */

export function sanitizeComplement(complement?: string | null): string | undefined {
  if (complement == null) return undefined;
  const clean = String(complement).trim().replace(/\s+/g, " ");
  if (!clean) return undefined;
  if (clean.length <= 30) return clean;
  const truncated = clean.slice(0, 30);
  const lastSpace = truncated.lastIndexOf(" ");
  const cut = (lastSpace > 15 ? truncated.slice(0, lastSpace) : truncated).trim();
  return cut || undefined;
}

export function isValidCnpj(value: string): boolean {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (base: string, factors: number[]) => {
    const sum = factors.reduce((acc, factor, i) => acc + Number(base[i]) * factor, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(digits[12]) && d2 === Number(digits[13]);
}
