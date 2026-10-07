/**
 * Tabela de cancelamento: contrato ativo do cliente com franquia 100 km e 3 h.
 * Se houver mais de uma, prefere o nome que diz "100 km" e, entre elas, o menor acionamento.
 */

export type CanceladaPriceTable = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  franquia_km?: number | string | null;
  franquia_minima_km?: number | string | null;
  franquia_horas?: number | string | null;
  valor_acionamento?: number | string | null;
};

export function canceladaTableNameSays100km(name: string | null | undefined): boolean {
  return /100\s*km/i.test(String(name || ""));
}

export function isCanceladaPriceTable100km3(contrato: CanceladaPriceTable | null | undefined): boolean {
  const km = Number(contrato?.franquia_km || 0) || Number(contrato?.franquia_minima_km || 0) || 0;
  const horas = Number(contrato?.franquia_horas || 0);
  const status = contrato?.status;
  return km === 100 && horas === 3 && (status == null || status === "Ativo");
}

export function pickCanceladaPriceTable<T extends CanceladaPriceTable>(contracts: T[]): T | null {
  const active = (contracts || []).filter((c) => !c.status || c.status === "Ativo");
  const exact = active.filter((c) => isCanceladaPriceTable100km3(c));
  const named = exact.filter((c) => canceladaTableNameSays100km(c.name));
  const candidates = named.length > 0 ? named : exact;
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => {
    const delta = (Number(a.valor_acionamento) || 0) - (Number(b.valor_acionamento) || 0);
    if (delta !== 0) return delta;
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  })[0];
}
