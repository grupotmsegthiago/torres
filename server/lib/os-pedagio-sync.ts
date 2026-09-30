import { supabaseAdmin } from "../supabase";

/** Copia o pedágio do boletim para o campo que a Ordem de Serviço exibe. */
export async function syncPedagioOsComBoletim(serviceOrderId: number, despesasPedagio: number) {
  const id = Number(serviceOrderId);
  const valor = Math.round((Number(despesasPedagio) || 0) * 100) / 100;
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(valor)) return;
  await supabaseAdmin
    .from("service_orders")
    .update({ pedagio_estimado: valor, custo_pedagio_alocado: valor })
    .eq("id", id);
}
