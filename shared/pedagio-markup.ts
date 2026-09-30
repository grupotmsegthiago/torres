/** Acréscimo na cobrança de pedágio ao cliente. O custo do comprovante não muda. */
export const PEDAGIO_CLIENT_MARKUP_FACTOR = 1.2;

/**
 * true somente quando a OS foi gravada com operação DHL desmarcada (`false`).
 * `null` = OS anterior à regra: repasse 1:1, sem acréscimo.
 */
export function osCobraMarkupPedagio(
  so: { operacao_dhl?: boolean | null; operacaoDhl?: boolean | null } | null | undefined,
): boolean {
  if (!so) return false;
  const raw = (so as { operacao_dhl?: boolean | null }).operacao_dhl !== undefined
    ? (so as { operacao_dhl?: boolean | null }).operacao_dhl
    : (so as { operacaoDhl?: boolean | null }).operacaoDhl;
  return raw === false;
}

/** Aplica +20% no valor cobrado do cliente. Sem a flag, devolve o custo. */
export function applyPedagioClientMarkup(custo: number, aplicar: boolean): number {
  const n = Number(custo) || 0;
  if (!aplicar || n <= 0) return n;
  return Math.round(n * PEDAGIO_CLIENT_MARKUP_FACTOR * 100) / 100;
}

/** Boletim conferido: o pedágio gravado na OS é a fonte. Não usar o comprovante do vigilante. */
export const PEDAGIO_BILLING_APROVADO = new Set(["APROVADA", "FATURADO", "FATURADA", "PAGO"]);

/**
 * Tira o acréscimo de 20% do valor cobrado, devolvendo o que a empresa pagou.
 * Sem a flag, o valor da OS já é o custo.
 */
export function pedagioCustoEmpresa(cobrado: number, aplicarMarkup: boolean): number {
  const n = Math.round((Number(cobrado) || 0) * 100) / 100;
  if (!(n > 0)) return 0;
  if (!aplicarMarkup) return n;
  return Math.round((n / PEDAGIO_CLIENT_MARKUP_FACTOR) * 100) / 100;
}

/** Linha de pedágio que é projeção da rota, não comprovante pago. */
export function isEstimativaPedagioDescricao(
  description?: string | null,
  employeeId?: number | null,
): boolean {
  const d = String(description || "");
  if (/\[ESTIMATIVA_/i.test(d)) return true;
  if (/estimativa/i.test(d) && (employeeId == null || Number(employeeId) === 0)) return true;
  return false;
}

/**
 * Soma o pedágio que a empresa pagou. Ignora receita pareada, a estimativa da
 * rota e o acréscimo de 20% (esse só existe na cobrança ao cliente).
 */
export function sumPedagioComprovante(rows: Array<{
  amount?: number | null;
  category?: string | null;
  cost_type?: string | null;
  costType?: string | null;
  description?: string | null;
  employee_id?: number | null;
  employeeId?: number | null;
}> | null | undefined): number {
  let total = 0;
  for (const row of rows || []) {
    const type = String(row.cost_type ?? row.costType ?? "expense");
    if (type === "revenue") continue;
    const cat = String(row.category || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (!cat.includes("pedagio")) continue;
    const emp = row.employeeId ?? row.employee_id;
    if (isEstimativaPedagioDescricao(row.description, emp)) continue;
    total += Number(row.amount) || 0;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Custo de pedágio do Balanço: comprovante pago da OS com boletim aprovado.
 * Não usa o valor cobrado do cliente (estimativa + 20%). OS ainda não aprovada = 0.
 */
export function pedagioCustoOsAprovada(input: {
  billStatus?: string | null;
  pedagioPago?: number | null;
}): number {
  const status = String(input.billStatus || "").toUpperCase();
  if (!PEDAGIO_BILLING_APROVADO.has(status)) return 0;
  const n = Number(input.pedagioPago) || 0;
  return n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Lançamento financeiro do comprovante do vigilante (não entra no custo do Balanço). */
export function isLancamentoPedagioVigilante(t: {
  origin_type?: string | null;
  category_name?: string | null;
  description?: string | null;
}): boolean {
  if (String(t.origin_type || "").toLowerCase() !== "mission_cost") return false;
  const blob = `${t.category_name || ""} ${t.description || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return blob.includes("pedag");
}

/** Base de cobrança da estimativa: ida, ou ida+volta, com markup quando a OS não é DHL. */
export function pedagioCobrancaCliente(valorIda: number, idaVolta: boolean, aplicarMarkup: boolean): number {
  const ida = Number(valorIda) || 0;
  const base = idaVolta ? Math.round(ida * 2 * 100) / 100 : ida;
  return applyPedagioClientMarkup(base, aplicarMarkup);
}
