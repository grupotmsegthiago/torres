/** Referências de viagem da MULTILOG. Não alteram valor. */

export function isMultilogClient(name: string | null | undefined): boolean {
  return String(name || "").toUpperCase().includes("MULTILOG");
}

function cleanRef(raw: string | null | undefined, prefix: "OS" | "SM"): string {
  return String(raw || "").trim().replace(new RegExp(`^${prefix}\\.?\\s*`, "i"), "");
}

export type MultilogRefs = { os: string; sm: string };

/** Normaliza a única fonte operacional das referências: service_orders. */
export function multilogRefsForOrder(order: {
  id?: number | string | null;
  multilog_os?: string | null;
  multilog_sm?: string | null;
  multilogOs?: string | null;
  multilogSm?: string | null;
}): MultilogRefs {
  return {
    os: cleanRef(order.multilog_os ?? order.multilogOs ?? "", "OS"),
    sm: cleanRef(order.multilog_sm ?? order.multilogSm ?? "", "SM"),
  };
}

export function missingMultilogRefs(order: Parameters<typeof multilogRefsForOrder>[0]): Array<"OS" | "SM"> {
  const refs = multilogRefsForOrder(order);
  return [
    ...(!refs.os ? ["OS" as const] : []),
    ...(!refs.sm ? ["SM" as const] : []),
  ];
}

export function multilogDiscriminacaoLines(
  items: Array<{ os?: string | null; sm?: string | null }>,
): string[] {
  const lines: string[] = [];
  for (const it of items) {
    const os = cleanRef(it.os, "OS");
    const sm = cleanRef(it.sm, "SM");
    if (os) lines.push(`OS. ${os}`);
    if (sm) lines.push(`SM. ${sm}`);
  }
  return lines;
}

export function appendMultilogToDescription(description: string, lines: string[]): string {
  if (!lines.length) return description;
  return `${description}\n${lines.join("\n")}`;
}

export function multilogLinesFromDescription(description?: string | null): string[] {
  return String(description || "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) => /^(OS|SM)\.\s+\S/.test(s));
}
