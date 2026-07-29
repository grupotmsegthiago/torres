/** Formatação padrão BR para o ERP Torres: R$ 0,00 e horas HH:MM. */

export function fmtBRL(val: number | null | undefined): string {
  const n = Number(val);
  if (!isFinite(n)) {
    return (0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Converte horas decimais (ex.: 8.5) para HH:MM (ex.: 08:30). */
export function fmtHoras(val: number | string | null | undefined): string {
  if (typeof val === "string" && val.includes(":")) {
    const [h, m] = val.split(":");
    const hh = String(Math.max(0, Math.floor(Number(h) || 0))).padStart(2, "0");
    const mm = String(Math.max(0, Math.min(59, Math.floor(Number(m) || 0)))).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const n = Number(val);
  if (!isFinite(n) || n === 0) return "00:00";
  const totalMin = Math.round(n * 60);
  const sign = totalMin < 0 ? "-" : "";
  const abs = Math.abs(totalMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
