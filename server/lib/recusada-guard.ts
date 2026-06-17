// §8.1 (SYSTEM_BRAIN.md) — OS Recusada = faturamento ZERADO, SEMPRE.
//
// "Recusada" significa que o operacional NÃO atendeu a missão (sem equipe,
// viatura não saiu, etc.) — nunca pode gerar cobrança. A zeragem é a verdade
// final e INCONDICIONAL: sobrescreve qualquer valor/recálculo de qualquer
// caminho de escrita do billing.
//
// Esta lista de campos espelha EXATAMENTE o branch `isRecusada` do PATCH
// /api/service-orders/:id (server/routes/service-orders.ts). Centralizar aqui
// evita que um novo caminho de escrita (salvar/aprovar boletim) ressuscite a
// cobrança de uma OS recusada — bug histórico que deixou R$ 134.816,50 de
// cobrança indevida (vide §8.1) e que voltou a ocorrer na TOR-0255.

export type RecusadaZeroPayload = {
  status: "CANCELADO";
  fat_total: 0;
  fat_acionamento: 0;
  fat_hora_extra: 0;
  fat_km: 0;
  fat_km_carregado: 0;
  fat_km_vazio: 0;
  fat_estadia: 0;
  fat_pernoite: 0;
  fat_diaria: 0;
  fat_adicional_noturno: 0;
  resultado_bruto: 0;
  resultado_liquido: 0;
  margem_percentual: 0;
  observacoes: string;
};

/**
 * Verifica se a OS vinculada ao billing está RECUSADA (§8.1). Centraliza a
 * consulta para que qualquer caminho de escrita de billing possa aplicar a
 * zeragem incondicional. Usa `maybeSingle` e nunca lança: na dúvida (sem OS,
 * erro de leitura) retorna `false` para não bloquear billings avulsos legítimos.
 * @param sb cliente supabaseAdmin (REST).
 * @param serviceOrderId id da OS vinculada (ou null/undefined p/ billing avulso).
 */
export async function osIsRecusada(
  sb: any,
  serviceOrderId: number | string | null | undefined,
): Promise<boolean> {
  if (serviceOrderId == null || serviceOrderId === "") return false;
  try {
    const { data } = await sb
      .from("service_orders").select("status")
      .eq("id", serviceOrderId).maybeSingle();
    return data?.status === "recusada";
  } catch {
    return false;
  }
}

/**
 * Monta o payload de zeragem de billing para uma OS recusada (§8.1).
 * @param motivo motivo da recusa (entra na observação). Se já houver uma
 *   observação "OS RECUSADA ...", ela é preservada.
 * @param observacaoAtual observação já existente no billing (preserva se válida).
 */
export function buildRecusadaZeroPayload(
  motivo?: string | null,
  observacaoAtual?: string | null,
): RecusadaZeroPayload {
  let observacoes = "OS RECUSADA";
  if (observacaoAtual && observacaoAtual.startsWith("OS RECUSADA")) {
    observacoes = observacaoAtual;
  } else if (motivo && motivo.trim()) {
    observacoes = `OS RECUSADA — ${motivo.trim()}`;
  }
  return {
    status: "CANCELADO",
    fat_total: 0,
    fat_acionamento: 0,
    fat_hora_extra: 0,
    fat_km: 0,
    fat_km_carregado: 0,
    fat_km_vazio: 0,
    fat_estadia: 0,
    fat_pernoite: 0,
    fat_diaria: 0,
    fat_adicional_noturno: 0,
    resultado_bruto: 0,
    resultado_liquido: 0,
    margem_percentual: 0,
    observacoes,
  };
}
