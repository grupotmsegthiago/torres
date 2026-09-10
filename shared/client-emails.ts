/** Categorias de e-mail do cadastro do cliente (`clients`). */
export type ClientEmailCategory = "operacional" | "financeiro" | "contratual" | "medicao";

/** Cópia interna obrigatória em todo e-mail enviado ao cliente. */
export const TORRES_ALWAYS_CC = [
  "diretoria@torresseguranca.com.br",
  "mickael@torresseguranca.com.br",
  "financeiro@torresseguranca.com.br",
  "adm@torresseguranca.com.br",
] as const;

export const CLIENT_EMAIL_COLUMNS =
  "email, email_financeiro, email_contratual, email_operacional, email_medicao";

export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw).split(/[\n,;]+/)) {
    const e = part.trim().toLowerCase();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

function uniqueEmails(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const e = String(raw || "").trim().toLowerCase();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

function fieldRaw(client: any, snake: string, camel: string): string {
  if (!client) return "";
  return String(client[snake] ?? client[camel] ?? "");
}

function categoryRaw(client: any, category: ClientEmailCategory): string {
  switch (category) {
    case "operacional":
      return fieldRaw(client, "email_operacional", "emailOperacional");
    case "financeiro":
      return fieldRaw(client, "email_financeiro", "emailFinanceiro");
    case "contratual":
      return fieldRaw(client, "email_contratual", "emailContratual");
    case "medicao":
      return fieldRaw(client, "email_medicao", "emailMedicao");
  }
}

/**
 * Destinatários da categoria. Não mistura outra categoria.
 * Se a categoria estiver vazia, usa só o e-mail genérico (`clients.email`).
 */
export function pickClientEmails(client: any, category: ClientEmailCategory): string[] {
  const specific = parseEmailList(categoryRaw(client, category));
  if (specific.length > 0) return specific;
  return parseEmailList(fieldRaw(client, "email", "email"));
}

export function clientEmailsJoined(client: any, category: ClientEmailCategory): string {
  return pickClientEmails(client, category).join(", ");
}

export function withTorresAlwaysCc(to: string[], extraCc: string[] = []): { to: string[]; cc: string[] } {
  const toList = uniqueEmails(to);
  const toSet = new Set(toList);
  const cc = uniqueEmails([...TORRES_ALWAYS_CC, ...extraCc]).filter((e) => !toSet.has(e));
  return { to: toList, cc };
}

/** To = categoria (+ extras) e CC fixo da Torres. Null se não houver destinatário do cliente. */
export function clientOutboundMail(
  client: any,
  category: ClientEmailCategory,
  extraTo?: string | string[] | null,
): { to: string[]; cc: string[] } | null {
  const extra = Array.isArray(extraTo) ? extraTo.join(",") : extraTo;
  const to = uniqueEmails([...pickClientEmails(client, category), ...parseEmailList(extra)]);
  if (to.length === 0) return null;
  return withTorresAlwaysCc(to);
}

/** E-mail do tomador no Asaas: só financeiro (não mistura operacional/contratual). */
export function asaasTomadorEmail(client: any): string | undefined {
  const list = pickClientEmails(client, "financeiro");
  return list.length ? list.join(", ") : undefined;
}
