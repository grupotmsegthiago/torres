/** Leitura de atualização de missão é um fato único: quem trata, trata para todos. */

export const MISSION_LIDAS_TOPIC = "mission-updates-lidas";
export const MISSION_LIDAS_EVENT = "lidas";

/** A coluna do mapa não pode esperar o ciclo longo. O aviso em tempo real é o caminho rápido. */
export const UNREAD_POLL_MS = 5_000;

export type CorteLeitura = { ids: number[] } | { todas: true };

export function idsReaisDeLeitura(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const vistos = new Set<number>();
  const reais: number[] = [];
  for (const id of ids) {
    const n = typeof id === "number" ? id : Number(id);
    if (!Number.isInteger(n) || n <= 0 || vistos.has(n)) continue;
    vistos.add(n);
    reais.push(n);
  }
  return reais;
}

export function corteDeLeitura(ids: number[] | null): CorteLeitura {
  if (ids == null) return { todas: true };
  return { ids: idsReaisDeLeitura(ids) };
}

export function interpretarPayloadLidas(payload: unknown): CorteLeitura | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (body.todas === true) return { todas: true };
  const ids = idsReaisDeLeitura(body.ids);
  if (ids.length === 0) return null;
  return { ids };
}

export function semMensagensLidas<T extends { id?: number | string }>(
  lista: T[],
  corte: CorteLeitura,
): T[] {
  if ("todas" in corte) return [];
  const ids = new Set(corte.ids);
  return lista.filter((item) => !ids.has(Number(item.id)));
}

export function urlBroadcastLidas(supabaseUrl: string): string {
  const base = supabaseUrl.replace(/\/$/, "");
  const topic = encodeURIComponent(MISSION_LIDAS_TOPIC);
  const event = encodeURIComponent(MISSION_LIDAS_EVENT);
  return `${base}/realtime/v1/api/broadcast/${topic}/events/${event}`;
}
