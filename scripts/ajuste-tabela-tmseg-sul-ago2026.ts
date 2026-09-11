/**
 * Ajuste pontual ago/2026: OS TM SEG que iniciaram em Florianópolis/Palhoça
 * → tabela OP. DEDICADA SUL.
 *
 * DHL não é tocado. FATURADO / boletim APROVADO não reabre valor.
 * Recálculo: calcularEscolta com KM do billing (não relê foto).
 *
 * Uso:
 *   npx tsx scripts/ajuste-tabela-tmseg-sul-ago2026.ts
 *   npx tsx scripts/ajuste-tabela-tmseg-sul-ago2026.ts --apply
 */
import { loadReplitEnv } from "./replit-env";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const vars = loadReplitEnv();
  for (const [key, value] of Object.entries(vars)) {
    if (!process.env[key] && value) process.env[key] = value;
  }
}

const APPLY = process.argv.includes("--apply");

const { supabaseAdmin } = await import("../server/supabase");
const { calcularEscolta } = await import("../server/billing-calc");
const { writeEscortBillingAtomic } = await import("../server/lib/atomic-billing");
const { computeCanceladaBilling } = await import("../server/lib/cancelada-billing");
const { fetchAllSupabaseRows } = await import("../server/lib/supabase-page");
const { billingHasCommercialSnapshot } = await import("../server/lib/billing-frozen");
const { bustBalancoCaches } = await import("../server/lib/balanco-cache");
const { createAutoTransaction } = await import("../server/routes/_helpers");
const { logSystemAudit } = await import("../server/audit");
const sel = await import("../server/lib/ajuste-tabela-origem");

const ACTOR = {
  userName: "Sistema Torres",
  userRole: "diretoria",
  reason: "Ajuste dono: TM SEG ago/2026 FLO/Palhoça → OP. DEDICADA SUL",
};

function n(v: unknown): number {
  return Number(v) || 0;
}
function r(v: number): number {
  return Math.round(v * 100) / 100;
}
function toBrtHm(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function page<T>(table: string, select: string, extra?: (q: any) => any): Promise<T[]> {
  return fetchAllSupabaseRows<T>(async (from, to) => {
    let q = supabaseAdmin.from(table).select(select).range(from, to);
    if (extra) q = extra(q);
    return q;
  });
}

function canonicalPayload(input: {
  so: any;
  bill: any;
  contrato: any;
  observacao: string;
}) {
  const { so, bill, contrato } = input;
  const horario_agendado = toBrtHm(so.scheduled_date) || bill.horario_agendado || undefined;
  const horario_inicio = toBrtHm(so.mission_started_at) || bill.horario_inicio || undefined;
  const horario_fim = toBrtHm(so.completed_date) || bill.horario_fim || undefined;
  const canonical = calcularEscolta({
    km_inicial: n(bill.km_inicial),
    km_final: n(bill.km_final),
    km_vazio: n(bill.km_vazio),
    horas_missao: n(bill.horas_missao),
    horas_estadia: 0,
    teve_pernoite: false,
    horario_agendado,
    horario_inicio,
    horario_fim,
    inicio_ts: so.mission_started_at || null,
    fim_ts: so.completed_date || null,
    scheduled_date: so.scheduled_date || null,
    despesas_pedagio: n(bill.despesas_pedagio),
    despesas_combustivel: n(bill.despesas_combustivel),
    despesas_outras: n(bill.despesas_outras),
    receitas_os: n(bill.receitas_os),
    contrato,
  });
  const prevObs = String(bill.observacoes || "").trim();
  const observacoes = prevObs.includes(input.observacao)
    ? prevObs
    : [prevObs, input.observacao].filter(Boolean).join(" | ");
  return {
    canonical,
    payload: {
      service_order_id: so.id,
      client_id: so.client_id,
      client_name: bill.client_name,
      contract_id: contrato.id,
      km_inicial: n(bill.km_inicial),
      km_final: n(bill.km_final),
      km_vazio: n(canonical.km_vazio),
      km_carregado: n(canonical.km_carregado),
      km_total: n(canonical.km_total),
      km_faturado: n(canonical.km_faturado),
      km_franquia: n(canonical.km_franquia),
      km_excedente: n(canonical.km_excedente),
      horas_missao: r(canonical.horas_trabalhadas),
      horas_trabalhadas: r(canonical.horas_trabalhadas),
      horas_estadia: 0,
      teve_pernoite: false,
      horario_agendado: horario_agendado || null,
      horario_inicio: horario_inicio || null,
      horario_fim: horario_fim || null,
      horario_inicio_considerado: canonical.horario_inicio_considerado,
      is_noturno: canonical.is_noturno,
      despesas_pedagio: r(n(bill.despesas_pedagio)),
      despesas_combustivel: r(n(bill.despesas_combustivel)),
      despesas_outras: r(n(bill.despesas_outras)),
      receitas_os: r(n(bill.receitas_os)),
      fat_acionamento: r(canonical.fat_acionamento),
      fat_km: r(canonical.fat_km),
      fat_km_carregado: r(canonical.faturamento.km_carregado),
      fat_km_vazio: r(canonical.faturamento.km_vazio),
      fat_hora_extra: r(canonical.fat_hora_extra),
      fat_adicional_noturno: r(canonical.fat_adicional_noturno),
      fat_estadia: r(canonical.fat_estadia),
      fat_pernoite: r(canonical.fat_pernoite),
      fat_diaria: r(canonical.fat_pernoite),
      fat_total: r(canonical.fat_total),
      valor_franquia: r(canonical.valor_franquia),
      valor_km_extra: r(canonical.valor_km_extra),
      pag_vrp: r(canonical.pag_vrp),
      pag_periculosidade: r(canonical.pag_periculosidade),
      pag_adicional_noturno: r(canonical.pag_adicional_noturno),
      pag_reembolsos: r(canonical.pag_reembolsos),
      pag_total: r(canonical.pag_total),
      resultado_bruto: r(canonical.resultado.bruto),
      resultado_liquido: r(canonical.resultado.liquido),
      margem_percentual: r(canonical.resultado.margem_pct),
      desp_pedagio: r(n(bill.despesas_pedagio)),
      desp_combustivel: r(n(bill.despesas_combustivel)),
      desp_outras: r(n(bill.despesas_outras)),
      desp_total: r(canonical.despesas.total),
      status: "A_VERIFICAR",
      origem: so.origin || bill.origem,
      destino: so.destination || bill.destino,
      os_number: so.os_number,
      observacoes,
      edit_reason: ACTOR.reason,
    },
  };
}

async function mirrorOs(soId: number, fatTotal: number, estimado: number | null) {
  const patch: Record<string, unknown> = { fat_calculado: fatTotal };
  if (estimado != null) patch.valor_estimado = estimado;
  const { error } = await supabaseAdmin.from("service_orders").update(patch).eq("id", soId);
  if (error) throw error;
}

async function syncLedger(bill: any, fatTotal: number) {
  if (!(fatTotal > 0) || !bill?.id) return;
  await createAutoTransaction({
    description: `ESCOLTA ${bill.os_number || bill.client_name || ""} - ajuste OP. DEDICADA SUL ago/2026`.trim(),
    amount: fatTotal,
    type: "INCOME",
    due_date: new Date().toISOString().slice(0, 10),
    origin_type: "escort_billing",
    origin_id: String(bill.id),
    category_name: "Escolta",
    entity_name: bill.client_name,
    created_by: "SISTEMA",
  });
}

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");

  const clients = await page<any>("clients", "id,name");
  const tm = clients.filter((c) => sel.isTmSegClientName(c.name) && !sel.isDhlClientName(c.name));
  const dhl = clients.filter((c) => sel.isDhlClientName(c.name));
  if (tm.length === 0) throw new Error("Cliente TM SEG não encontrado");
  const tmIds = tm.map((c) => c.id);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  console.log(`TM SEG ids=${tmIds.join(",")} | DHL clients=${dhl.length} (não tocados)`);

  const contracts = await page<any>("escort_contracts", "*");
  const target = contracts.find(
    (c) => tmIds.includes(c.client_id) && sel.isTargetTableName(c.name) && String(c.status) === "Ativo",
  );
  if (!target) throw new Error("Tabela OP. DEDICADA SUL ativa do TM SEG não encontrada");
  console.log(
    `Alvo: ${target.name} id=${target.id} acion=${target.valor_acionamento} fk=${target.franquia_km} fh=${target.franquia_horas} km_extra=${target.valor_km_extra}`,
  );
  const contractById = new Map(contracts.map((c) => [String(c.id), c]));

  const orders = await page<any>(
    "service_orders",
    "id,os_number,client_id,status,mission_status,origin,destination,scheduled_date,mission_started_at,completed_date,escort_contract_id,valor_estimado,step_logs",
    (q) => q.in("client_id", tmIds).order("id", { ascending: true }),
  );

  const candidates = orders.filter((so) => {
    const start = sel.missionStartDateBrt(so);
    return sel.isOriginFlorianopolisOrPalhoca(so.origin) && sel.isInInclusivePeriod(start);
  });

  const osIds = candidates.map((so) => so.id);
  const bills: any[] = [];
  for (let i = 0; i < osIds.length; i += 80) {
    const chunk = osIds.slice(i, i + 80);
    bills.push(
      ...(await page<any>("escort_billings", "*", (q) => q.in("service_order_id", chunk))),
    );
  }
  const billByOs = new Map(bills.map((b) => [b.service_order_id, b]));

  const approvedBoletins = await page<any>(
    "boletim_approvals",
    "id,status,billing_ids",
    (q) => q.eq("status", "APROVADO").in("client_id", tmIds),
  );
  const snapshotted = new Set<string>();
  for (const a of approvedBoletins) {
    for (const id of a.billing_ids || []) snapshotted.add(String(id));
  }

  const NOTE = "Ajuste ago/2026: tabela OP. DEDICADA SUL (TM SEG, origem FLO/Palhoça)";
  const rows: Array<Record<string, unknown>> = [];
  let applied = 0;
  let failed = 0;

  for (const so of candidates.sort((a, b) => String(a.os_number).localeCompare(String(b.os_number)))) {
    const bill = billByOs.get(so.id);
    const clientName = clientById.get(so.client_id)?.name || "";
    const current = contractById.get(String(so.escort_contract_id || bill?.contract_id || ""));
    let snapshot = !!(bill?.id && snapshotted.has(String(bill.id)));
    if (bill?.id && !snapshot) {
      try {
        snapshot = await billingHasCommercialSnapshot(supabaseAdmin, bill.id, n(bill.lock_version));
      } catch (err: any) {
        console.warn(`  snapshot-check ${so.os_number}: ${err.message}`);
      }
    }
    const decision = sel.classifyAjuste({
      clientName,
      origin: so.origin,
      startDateBrt: sel.missionStartDateBrt(so),
      soStatus: so.status,
      currentTableName: current?.name,
      billingStatus: bill?.status,
      hasApprovedBoletimSnapshot: snapshot,
    });

    let newTotal: number | null = null;
    let oldTotal = bill ? n(bill.fat_total) : null;
    let errMsg = "";

    try {
      if (decision === "recalc_aprovada" || decision === "recalc_open") {
        if (!bill) throw new Error("sem billing para recálculo");
        const { canonical } = canonicalPayload({ so, bill, contrato: target, observacao: NOTE });
        newTotal = r(canonical.fat_total);
        if (APPLY) {
          const { error: soErr } = await supabaseAdmin
            .from("service_orders")
            .update({
              escort_contract_id: String(target.id),
              valor_estimado: sel.estimadoFromAcionamento(target),
            })
            .eq("id", so.id);
          if (soErr) throw soErr;

          let expected = n(bill.lock_version);
          if (decision === "recalc_aprovada") {
            await writeEscortBillingAtomic({
              action: "REOPEN_APPROVED",
              billingId: bill.id,
              serviceOrderId: so.id,
              expectedVersion: expected,
              payload: { status: "A_VERIFICAR", revisado_por: null, revisado_em: null },
              actor: ACTOR,
            });
            expected += 1;
          }
          const { payload } = canonicalPayload({ so, bill, contrato: target, observacao: NOTE });
          await writeEscortBillingAtomic({
            action: "WRITE_OFFICIAL",
            billingId: bill.id,
            serviceOrderId: so.id,
            expectedVersion: expected,
            payload,
            actor: ACTOR,
          });
          expected += 1;
          if (decision === "recalc_aprovada") {
            await writeEscortBillingAtomic({
              action: "FREEZE_COMMERCIAL",
              billingId: bill.id,
              serviceOrderId: so.id,
              expectedVersion: expected,
              payload: {
                status: "APROVADA",
                revisado_por: ACTOR.userName,
                revisado_em: new Date().toISOString(),
              },
              actor: ACTOR,
            });
          }
          await mirrorOs(so.id, newTotal, sel.estimadoFromAcionamento(target));
          await syncLedger(bill, newTotal);
          await logSystemAudit({
            userName: ACTOR.userName,
            userRole: ACTOR.userRole,
            action: "AJUSTE_TABELA_DEDICADA_SUL",
            targetId: String(so.id),
            targetType: "service_order",
            details: `${so.os_number}: ${current?.name || "?"} → ${target.name}; fat ${oldTotal} → ${newTotal}`,
          });
          applied += 1;
        }
      } else if (decision === "recalc_cancelada") {
        if (APPLY) {
          const { error: soErr } = await supabaseAdmin
            .from("service_orders")
            .update({
              escort_contract_id: String(target.id),
              valor_estimado: sel.estimadoFromAcionamento(target),
            })
            .eq("id", so.id);
          if (soErr) throw soErr;
        }
        const cancelada = await computeCanceladaBilling({
          serviceOrderId: so.id,
          clientId: so.client_id,
          escortContractId: String(target.id),
          scheduledDate: so.scheduled_date,
          missionStartedAt: so.mission_started_at,
          completedDate: so.completed_date,
          stepLogs: so.step_logs,
        });
        if (!cancelada) throw new Error("computeCanceladaBilling retornou null");
        newTotal = r(n(cancelada.fatFields.fat_total));
        if (APPLY && bill) {
          let expected = n(bill.lock_version);
          await writeEscortBillingAtomic({
            action: "REOPEN_CANCELLED",
            billingId: bill.id,
            serviceOrderId: so.id,
            expectedVersion: expected,
            payload: { status: "A_VERIFICAR" },
            actor: ACTOR,
          });
          expected += 1;
          await writeEscortBillingAtomic({
            action: "WRITE_CANCELLED",
            billingId: bill.id,
            serviceOrderId: so.id,
            expectedVersion: expected,
            payload: {
              service_order_id: so.id,
              client_id: so.client_id,
              client_name: bill.client_name,
              contract_id: target.id,
              ...cancelada.fatFields,
              horario_agendado: cancelada.horarios.horario_agendado,
              horario_inicio: cancelada.horarios.horario_inicio,
              horario_fim: cancelada.horarios.horario_fim,
              observacoes: NOTE,
              os_number: so.os_number,
            },
            actor: ACTOR,
          });
          await mirrorOs(so.id, newTotal, sel.estimadoFromAcionamento(target));
          await syncLedger(bill, newTotal);
          applied += 1;
        } else if (APPLY && !bill) {
          applied += 1;
        }
      } else if (decision === "pointer_recusada") {
        if (APPLY) {
          const { error: soErr } = await supabaseAdmin
            .from("service_orders")
            .update({ escort_contract_id: String(target.id), valor_estimado: 0 })
            .eq("id", so.id);
          if (soErr) throw soErr;
          applied += 1;
        }
        newTotal = 0;
      }
    } catch (err: any) {
      failed += 1;
      errMsg = err?.message || String(err);
    }

    rows.push({
      os: so.os_number,
      start: sel.missionStartDateBrt(so),
      so_status: so.status,
      bill_status: bill?.status || "—",
      from: current?.name || so.escort_contract_id || "—",
      decision,
      fat_antes: oldTotal,
      fat_depois: newTotal,
      delta: oldTotal != null && newTotal != null ? r(newTotal - oldTotal) : null,
      error: errMsg || undefined,
    });
  }

  const byDecision = new Map<string, number>();
  for (const row of rows) {
    const k = String(row.decision);
    byDecision.set(k, (byDecision.get(k) || 0) + 1);
  }

  console.log("\nDecisões:", Object.fromEntries(byDecision));
  console.log("\nOS | início | SO | bill | tabela atual | decisão | fat antes → depois | Δ");
  for (const row of rows) {
    const mark = row.error ? " FAIL" : "";
    console.log(
      `${row.os} | ${row.start} | ${row.so_status} | ${row.bill_status} | ${row.from} | ${row.decision} | ${row.fat_antes} → ${row.fat_depois} | ${row.delta ?? "—"}${mark}${row.error ? " " + row.error : ""}`,
    );
  }

  const mudaveis = rows.filter((row) =>
    ["recalc_aprovada", "recalc_open", "recalc_cancelada", "pointer_recusada"].includes(String(row.decision)),
  );
  const deltaSum = mudaveis.reduce((acc, row) => acc + n(row.delta), 0);
  console.log(`\nCandidatas no período: ${rows.length}`);
  console.log(`A aplicar (não faturadas / sem boletim aprovado): ${mudaveis.length}`);
  console.log(`Δ faturamento previsto (só recalculáveis): R$ ${r(deltaSum).toFixed(2)}`);
  console.log(`DHL clients no cadastro: ${dhl.length} (filtro ativo, 0 OS tocadas)`);
  if (APPLY) {
    bustBalancoCaches();
    console.log(`Aplicado=${applied} falhas=${failed}`);
  } else {
    console.log("Dry-run. Passe --apply para gravar.");
  }

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
