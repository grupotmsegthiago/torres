import { corteDeLeitura, urlBroadcastLidas, type CorteLeitura } from "../../shared/mission-lidas.ts";

export type AvisoLeituraResultado = { enviou: boolean; status: number | null };

/**
 * Avisa as telas abertas de que a leitura já está gravada.
 * Não abre a tabela no navegador: o corpo só traz ids.
 * Falha aqui não desfaz a leitura — o próximo ciclo da lista corrige.
 */
export async function avisarMensagensLidas(
  ids: number[] | null,
  fetchImpl: typeof fetch = fetch,
): Promise<AvisoLeituraResultado> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !key) return { enviou: false, status: null };

  const corte: CorteLeitura = corteDeLeitura(ids);
  if (!("todas" in corte) && corte.ids.length === 0) return { enviou: false, status: null };

  try {
    const res = await fetchImpl(urlBroadcastLidas(supabaseUrl), {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corte),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) {
      console.warn("[mission-updates] aviso de leitura não entregue:", res.status);
    }
    return { enviou: res.ok, status: res.status };
  } catch (err: any) {
    console.warn("[mission-updates] aviso de leitura não entregue:", err?.message || err);
    return { enviou: false, status: null };
  }
}
