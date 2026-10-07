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

/**
 * Copia o pedágio salvo na Ordem de Serviço para o faturamento e para o
 * boletim. OS já faturada ou paga não é alterada.
 */
export async function syncOsPedagioParaCobranca(
  serviceOrderId: number,
  cobrancaCliente: number,
  custoEmpresa: number,
) {
  const id = Number(serviceOrderId);
  const cobranca = Math.round((Number(cobrancaCliente) || 0) * 100) / 100;
  const custo = Math.round((Number(custoEmpresa) || 0) * 100) / 100;
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(cobranca) || !Number.isFinite(custo)) return;
  const { error } = await supabaseAdmin.rpc("sync_os_pedagio_to_billing", {
    p_service_order_id: id,
    p_cobranca: cobranca,
    p_custo: custo,
  });
  if (error) throw new Error(error.message);
}
