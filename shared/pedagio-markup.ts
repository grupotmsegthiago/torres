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

/** Base de cobrança da estimativa: ida, ou ida+volta, com markup quando a OS não é DHL. */
export function pedagioCobrancaCliente(valorIda: number, idaVolta: boolean, aplicarMarkup: boolean): number {
  const ida = Number(valorIda) || 0;
  const base = idaVolta ? Math.round(ida * 2 * 100) / 100 : ida;
  return applyPedagioClientMarkup(base, aplicarMarkup);
}
