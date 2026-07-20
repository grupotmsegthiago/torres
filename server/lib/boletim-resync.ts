// Re-sincroniza boletins de medição PENDENTES quando o status de uma OS muda
// DEPOIS do envio (recusada/cancelada). O snapshot é uma "foto única" congelada
// no envio; sem este resync, uma OS recusada após o envio continuava no boletim
// a valor cheio (bug do boletim 59 OS / R$127k vs faturamento 45 OS / R$103k).
//
// Regra (single source of truth = tela de Faturamento, INTOCÁVEL §8.4):
//   - OS recusada  ⇒ SAI do boletim (removida de billing_ids/snapshot, os_count-1)
//   - OS cancelada ⇒ PERMANECE, mas o snapshot é recongelado com os valores
//     atuais do billing (tabela 100 km, §8.1b)
// Boletins APROVADOS/CONFIRMADOS nunca são alterados (o cliente já aprovou).

import { supabaseAdmin } from "../supabase";
import { billingTotalForBoletim, round2 } from "./boletim-totals";

type SnapshotEntry = {
  billing_id: string;
  service_order_id: number;
  os_number: string;
  fat_acionamento: number;
  fat_hora_extra: number;
  fat_km: number;
  fat_adicional_noturno: number;
  fat_estadia: number;
  fat_pernoite: number;
  despesas_pedagio: number;
  despesas_outras: number;
  receitas_os: number;
  total: number;
};

export function rebuildSnapshotEntry(billing: any, osStatus: string | undefined, prev: SnapshotEntry): SnapshotEntry {
  const comp = (v: any) => (osStatus === "recusada" ? 0 : round2(Number(v || 0)));
  return {
    ...prev,
    fat_acionamento: comp(billing.fat_acionamento),
    fat_hora_extra: comp(billing.fat_hora_extra),
    fat_km: comp(billing.fat_km),
    fat_adicional_noturno: comp(billing.fat_adicional_noturno),
    fat_estadia: comp(billing.fat_estadia),
    fat_pernoite: comp(billing.fat_pernoite),
    despesas_pedagio: comp(billing.despesas_pedagio),
    despesas_outras: comp(billing.despesas_outras),
    receitas_os: comp(billing.receitas_os),
    total: billingTotalForBoletim(billing, osStatus),
  };
}

// Núcleo puro (testável): recebe o approval + estado atual das OSs/billings e
// devolve o approval corrigido (ou null se nada mudou).
export function rebuildApproval(
  approval: { billing_ids: any[]; billing_snapshot: SnapshotEntry[] },
  soStatusById: Map<number, string>,
  billingById: Map<string, any>,
): { billing_ids: string[]; billing_snapshot: SnapshotEntry[]; total_value: number; os_count: number } | null {
  const snapshot: SnapshotEntry[] = Array.isArray(approval.billing_snapshot) ? approval.billing_snapshot : [];
  if (!snapshot.length) return null;

  let changed = false;
  const newSnapshot: SnapshotEntry[] = [];
  for (const entry of snapshot) {
    const osStatus = soStatusById.get(Number(entry.service_order_id));
    if (osStatus === "recusada") {
      changed = true; // OS recusada sai do boletim
      continue;
    }
    if (osStatus === "cancelada") {
      const billing = billingById.get(String(entry.billing_id));
      if (billing) {
        const rebuilt = rebuildSnapshotEntry(billing, osStatus, entry);
        if (round2(rebuilt.total) !== round2(Number(entry.total) || 0)) changed = true;
        newSnapshot.push(rebuilt);
        continue;
      }
    }
    newSnapshot.push(entry);
  }
  if (!changed) return null;

  const keptIds = new Set(newSnapshot.map((s) => String(s.billing_id)));
  const billing_ids = (approval.billing_ids || []).map((x: any) => String(x)).filter((id: string) => keptIds.has(id));
  const total_value = round2(newSnapshot.reduce((sum, s) => sum + (Number(s.total) || 0), 0));
  return { billing_ids, billing_snapshot: newSnapshot, total_value, os_count: newSnapshot.length };
}

// Aplica o resync a todos os boletins PENDENTES que contêm a OS informada.
// Chamado após a OS virar recusada/cancelada (PATCH service-orders). Fail-open:
// erro aqui não pode derrubar a mudança de status da OS (só loga).
export async function resyncPendingBoletinsForServiceOrder(serviceOrderId: number): Promise<void> {
  try {
    const { data: pendentes } = await supabaseAdmin
      .from("boletim_approvals")
      .select("id, billing_ids, billing_snapshot")
      .eq("status", "PENDENTE");

    const affected = (pendentes || []).filter((a: any) =>
      (Array.isArray(a.billing_snapshot) ? a.billing_snapshot : []).some(
        (s: any) => Number(s.service_order_id) === Number(serviceOrderId),
      ),
    );
    if (!affected.length) return;

    // Estado atual das OSs e billings referenciadas pelos boletins afetados
    const soIds = new Set<number>();
    const billingIds = new Set<string>();
    for (const a of affected) {
      for (const s of (a.billing_snapshot || [])) {
        soIds.add(Number(s.service_order_id));
        billingIds.add(String(s.billing_id));
      }
    }
    const { data: sos } = await supabaseAdmin
      .from("service_orders").select("id, status").in("id", Array.from(soIds));
    const { data: bills } = await supabaseAdmin
      .from("escort_billings").select("*").in("id", Array.from(billingIds));
    const soStatusById = new Map<number, string>((sos || []).map((o: any) => [Number(o.id), String(o.status)]));
    const billingById = new Map<string, any>((bills || []).map((b: any) => [String(b.id), b]));

    for (const a of affected) {
      const rebuilt = rebuildApproval(a, soStatusById, billingById);
      if (!rebuilt) continue;
      const { error } = await supabaseAdmin
        .from("boletim_approvals")
        .update(rebuilt)
        .eq("id", a.id)
        .eq("status", "PENDENTE"); // nunca tocar boletim já aprovado (corrida)
      if (error) {
        console.error(`[boletim-resync] approval #${a.id}: ${error.message}`);
      } else {
        console.log(`[boletim-resync] approval #${a.id} re-sincronizado: ${rebuilt.os_count} OS, R$ ${rebuilt.total_value.toFixed(2)} (OS ${serviceOrderId} mudou de status)`);
      }
    }
  } catch (e: any) {
    console.error(`[boletim-resync] falha (não bloqueante) OS ${serviceOrderId}: ${e?.message || e}`);
  }
}
