/**
 * Implementações dos jobs agendados (compartilhadas entre Replit node-cron e Vercel buckets).
 */
import { storage } from "./storage";
import * as apibrasil from "./apibrasil";
import { log } from "./lib/logger";
import { getVehicleCache, sendCommand } from "./truckscontrol";
import { supabaseAdmin } from "./supabase";
import { isSupabaseHealthy } from "./pg-fallback";
import { ymdBRT } from "./lib/hours-calc";
import { processRhidSyncQueue } from "./control-id";
import { runDailyReconciliation } from "./rhid-reconciliation";
import { snapshotFolhaMes, snapshotFolhaMesIfMissing, prevMonthRef } from "./lib/folha-historico";
import { countBusinessDays, loadHolidaySet, monthRange } from "./routes/holidays";
import { sendVencimentosDoDiaEmail } from "./email-vencimentos";

const locks = new Set<string>();

export async function withCronLock(name: string, fn: () => Promise<void>): Promise<void> {
  if (locks.has(name)) return;
  locks.add(name);
  try {
    await fn();
  } finally {
    locks.delete(name);
  }
}

async function runInterReconcile(diasJanela: number, contexto: string): Promise<void> {
  const { isInterConfigured } = await import("./services/inter/client");
  if (!isInterConfigured()) return;
  const { consultarExtrato } = await import("./services/inter/banking");
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - diasJanela * 24 * 60 * 60 * 1000);
  const dataInicio = ymdBRT(inicio);
  const dataFim = ymdBRT(hoje);

  const extrato = await consultarExtrato(dataInicio, dataFim);
  const transacoes = extrato.transacoes || [];

  let novosLancamentos = 0;
  let conciliados = 0;

  for (const tx of transacoes) {
    if (tx.tipoOperacao !== "C") continue;

    const { data: existing } = await supabaseAdmin
      .from("inter_extrato_lancamentos")
      .select("id")
      .eq("data_entrada", tx.dataEntrada)
      .eq("valor", Number(tx.valor || 0).toFixed(2))
      .eq("tipo_operacao", "C")
      .eq("titulo", tx.titulo || "")
      .maybeSingle();

    if (existing) continue;

    const { data: candidateInvoices } = await supabaseAdmin
      .from("invoices")
      .select("id, status, due_date, client_name")
      .eq("value", Number(tx.valor || 0).toFixed(2))
      .in("status", ["PENDING", "OVERDUE"])
      .order("due_date", { ascending: true });

    const invoice = candidateInvoices && candidateInvoices.length === 1 ? candidateInvoices[0] : null;

    let ambiguousCount = 0;
    if (candidateInvoices && candidateInvoices.length > 1) {
      ambiguousCount = candidateInvoices.length;
      log(
        `CRON Inter-Reconcile[${contexto}]: AMBIGUO — ${candidateInvoices.length} invoices com valor R$ ${tx.valor} em ${tx.dataEntrada}. Conciliação manual necessária.`,
        "cron",
      );
    }

    await supabaseAdmin.from("inter_extrato_lancamentos").insert({
      data_entrada: tx.dataEntrada,
      tipo_transacao: tx.tipoTransacao,
      tipo_operacao: tx.tipoOperacao,
      valor: Number(tx.valor || 0).toFixed(2),
      titulo: tx.titulo || null,
      descricao:
        ambiguousCount > 0
          ? `${tx.descricao || ""} [AMBIGUO: ${ambiguousCount} faturas mesmo valor — conciliar manualmente]`
          : tx.descricao || null,
      detalhes: tx,
      invoice_id: invoice?.id || null,
      reconciled_at: invoice ? new Date().toISOString() : null,
    });

    novosLancamentos++;

    if (invoice) {
      await supabaseAdmin
        .from("invoices")
        .update({ status: "RECEIVED", payment_date: tx.dataEntrada })
        .eq("id", invoice.id);
      conciliados++;
    }
  }

  if (novosLancamentos > 0) {
    log(
      `CRON Inter-Reconcile[${contexto}]: ${novosLancamentos} lançamento(s), ${conciliados} invoice(s) conciliada(s)`,
      "cron",
    );
  }
}

export async function runNfReconcileCron(): Promise<void> {
  log("CRON NF-Reconcile: Iniciando reconciliação de NFs com Asaas", "cron");
  try {
    const { reconcileAllInvoicesAsaas } = await import("./asaas");
    const result = await reconcileAllInvoicesAsaas({ limit: 80 });
    log(
      `CRON NF-Reconcile: ${result.processed} processada(s), ${result.updated} atualizada(s), ${result.errors} erro(s)`,
      "cron",
    );
  } catch (e: any) {
    log(`CRON NF-Reconcile: Erro: ${e.message}`, "cron");
  }
}

export async function runControlIdCron(): Promise<void> {
  await withCronLock("control-id", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const { syncAllDevices } = await import("./control-id");
      const r = await syncAllDevices();
      if (r.devices > 0 && r.totalSaved > 0) {
        log(`CRON ControlID: ${r.devices} aparelho(s), ${r.totalSaved} batida(s) nova(s)`, "cron");
      }
    } catch (e: any) {
      log(`CRON ControlID: Erro: ${e.message}`, "cron");
    }
  });
}

export async function runRhidQueueCron(): Promise<void> {
  await withCronLock("rhid-queue", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const r = await processRhidSyncQueue(50);
      if (r.processed > 0) {
        log(`CRON RHID-Queue: ${r.done} OK, ${r.failed} falhou (de ${r.processed})`, "cron");
      }
    } catch (e: any) {
      log(`CRON RHID-Queue ERRO: ${e?.message}`, "cron");
    }
  });
}

export async function runRhidReconCron(): Promise<void> {
  await withCronLock("rhid-recon", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const r = await runDailyReconciliation({ triggeredBy: "cron" });
      log(
        `CRON RHID-Recon: validado=${r.recon.totals.validado} faltamRhid=${r.recon.totals.faltandoNoRhid} faltamLocal=${r.recon.totals.faltandoNoLocal} dup=${r.recon.totals.duplicadas} | imp=${r.actions.imported} exp=${r.actions.exported} | ${r.email.message}`,
        "cron",
      );
    } catch (e: any) {
      log(`CRON RHID-Recon ERRO: ${e?.message}`, "cron");
    }
  });
}

export async function runFolhaSnapshotCron(): Promise<void> {
  await withCronLock("folha-snapshot", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const mes = prevMonthRef();
      const r = await snapshotFolhaMes(mes, { source: "auto" });
      log(`CRON Folha-Snapshot: mês=${r.mes} ativos=${r.ativos} salvos=${r.saved} pulados=${r.skipped}`, "cron");
    } catch (e: any) {
      log(`CRON Folha-Snapshot ERRO: ${e?.message}`, "cron");
    }
  });
}

export async function runFolhaCatchupCron(): Promise<void> {
  await withCronLock("folha-catchup", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const mes = prevMonthRef();
      const r = await snapshotFolhaMesIfMissing(mes, { source: "auto-catchup" });
      if (r) {
        log(
          `CRON Folha-Snapshot[catch-up]: mês=${r.mes} ativos=${r.ativos} salvos=${r.saved} pulados=${r.skipped}`,
          "cron",
        );
      }
    } catch (e: any) {
      log(`CRON Folha-Snapshot[catch-up] ERRO: ${e?.message}`, "cron");
    }
  });
}

export async function runInterReconcileFastCron(): Promise<void> {
  await withCronLock("inter-reconcile", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      await runInterReconcile(2, "5min/2d");
    } catch (e: any) {
      log(`CRON Inter-Reconcile[5min/2d]: Erro: ${e.message}`, "cron");
    }
  });
}

export async function runInterReconcileBackfillCron(): Promise<void> {
  await withCronLock("inter-reconcile", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      log("CRON Inter-Reconcile[backfill/30d]: iniciando varredura ampla", "cron");
      await runInterReconcile(30, "backfill/30d");
    } catch (e: any) {
      log(`CRON Inter-Reconcile[backfill/30d]: Erro: ${e.message}`, "cron");
    }
  });
}

export async function runDiariasJornadaCron(): Promise<void> {
  try {
    const { processDiariasJornadaLonga } = await import("./jobs/diarias-jornada-longa");
    const ontemBrt = new Date(Date.now() - 24 * 3600 * 1000);
    const ymd = new Date(ontemBrt.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    const r = await processDiariasJornadaLonga(ymd);
    if (r.paresLongosDetectados > 0 || r.linhasCriadas > 0) {
      log(
        `CRON Diárias>16h: ${r.quinzena} (${r.quinzenaInicio}→${r.quinzenaFim}) pares=${r.paresLongosDetectados} agentes=${r.agentes.length} criadas=${r.linhasCriadas} removidas=${r.linhasRemovidas}`,
        "cron",
      );
    }
  } catch (e: any) {
    log(`CRON Diárias>16h: Erro: ${e.message}`, "cron");
  }
}

export async function runContratoDefinitivoCron(): Promise<void> {
  try {
    const { syncDuePermanentContracts } = await import("./routes/permanent-contracts");
    const r = await syncDuePermanentContracts();
    if (r.scanned > 0 || r.created > 0) {
      log(`CRON Contrato-Definitivo: scanned=${r.scanned} created=${r.created} errors=${r.errors}`, "cron");
    }
  } catch (e: any) {
    log(`CRON Contrato-Definitivo: Erro: ${e.message}`, "cron");
  }
}

export async function runFleetMultasCron(): Promise<void> {
  log("CRON: Iniciando monitoramento de frota (multas PRF)", "cron");
  try {
    const vehicles = await storage.getVehicles();
    for (const v of vehicles) {
      if (!v.plate) continue;
      try {
        const result = await apibrasil.consultaMultasPRF(v.plate, undefined, "cron_frota");
        if (result.success) {
          log(`CRON: Veículo ${v.plate} - multas consultadas com sucesso`, "cron");
        } else {
          log(`CRON: Veículo ${v.plate} - erro: ${result.data?.error || "desconhecido"}`, "cron");
        }
      } catch (err: any) {
        log(`CRON: Erro ao consultar multas para ${v.plate}: ${err.message}`, "cron");
      }
    }
    log(`CRON: Monitoramento de frota concluído (${vehicles.length} veículos)`, "cron");
  } catch (err: any) {
    log(`CRON: Erro geral no monitoramento de frota: ${err.message}`, "cron");
  }
}

export async function runRhComplianceCron(): Promise<void> {
  log("CRON: Iniciando compliance de RH (a cada 90 dias)", "cron");
  try {
    const employees = await storage.getEmployees();
    const activeEmployees = employees.filter((e) => e.status === "ativo");

    for (const emp of activeEmployees) {
      if (!emp.cpf) continue;
      const cpf = emp.cpf.replace(/\D/g, "");

      try {
        await apibrasil.consultaCNH(cpf, undefined, "cron_rh");
        log(`CRON RH: CNH consultada para ${emp.name}`, "cron");
      } catch (err: any) {
        log(`CRON RH: Erro CNH para ${emp.name}: ${err.message}`, "cron");
      }

      try {
        await apibrasil.consultaProcessos(cpf, undefined, "cron_rh");
        log(`CRON RH: Processos consultados para ${emp.name}`, "cron");
      } catch (err: any) {
        log(`CRON RH: Erro Processos para ${emp.name}: ${err.message}`, "cron");
      }

      try {
        await apibrasil.consultaSituacaoEleitoral(cpf, undefined, "cron_rh");
        log(`CRON RH: Situação eleitoral consultada para ${emp.name}`, "cron");
      } catch (err: any) {
        log(`CRON RH: Erro Sit. Eleitoral para ${emp.name}: ${err.message}`, "cron");
      }
    }
    log(`CRON: Compliance RH concluído (${activeEmployees.length} funcionários)`, "cron");
  } catch (err: any) {
    log(`CRON: Erro geral compliance RH: ${err.message}`, "cron");
  }
}

export async function runRodizioCron(): Promise<void> {
  const { sendRodizioAlerts } = await import("./cron");
  log("CRON Rodízio: Disparando alerta BRT", "cron");
  await sendRodizioAlerts();
}

export async function runBillingAlertsCron(): Promise<void> {
  if (!isSupabaseHealthy()) {
    log("CRON BillingAlerts: SKIP — Supabase offline (modo fallback)", "cron");
    return;
  }
  log("CRON BillingAlerts: Verificando linha do tempo de cobrança", "cron");
  try {
    const now = new Date();
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const brDay = Number(brDate.split("-")[2]);
    const brMonth = Number(brDate.split("-")[1]);
    const brYear = Number(brDate.split("-")[0]);

    const { data: allClients } = await supabaseAdmin.from("clients").select("*");
    if (!allClients?.length) return;

    const clientsWithCycle = allClients.filter((c: any) => c.billing_cycle && c.billing_cycle !== "por_missao");
    let alertsCreated = 0;

    const insertAlert = async (
      clientId: number,
      clientName: string,
      alertType: string,
      message: string,
      osNumbers: string,
      billingIds: string,
      periodStart: string,
      periodEnd: string,
    ) => {
      const { data: existing } = await supabaseAdmin
        .from("billing_alerts")
        .select("id")
        .eq("client_id", clientId)
        .eq("alert_type", alertType)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .eq("resolved", false)
        .limit(1);
      if (existing?.length) return false;
      await supabaseAdmin.from("billing_alerts").insert({
        client_id: clientId,
        client_name: clientName,
        alert_type: alertType,
        message,
        billing_ids: billingIds,
        os_numbers: osNumbers,
        period_start: periodStart,
        period_end: periodEnd,
      });
      return true;
    };

    for (const client of clientsWithCycle) {
      const cycle = client.billing_cycle;
      const prazoAprovacao = client.prazo_aprovacao_dias || 10;
      const limiteEmissao = client.billing_cutoff_day || 25;

      let periods: { start: string; end: string; cutoff: number }[] = [];

      if (cycle === "quinzenal") {
        periods = [
          { start: `${brYear}-${String(brMonth).padStart(2, "0")}-01`, end: `${brYear}-${String(brMonth).padStart(2, "0")}-15`, cutoff: 15 },
        ];
        const prevMonth = brMonth === 1 ? 12 : brMonth - 1;
        const prevYear = brMonth === 1 ? brYear - 1 : brYear;
        const lastDay = new Date(prevYear, prevMonth, 0).getDate();
        periods.push({
          start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-16`,
          end: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${lastDay}`,
          cutoff: lastDay,
        });
      } else if (cycle === "mensal") {
        const prevMonth = brMonth === 1 ? 12 : brMonth - 1;
        const prevYear = brMonth === 1 ? brYear - 1 : brYear;
        const lastDay = new Date(prevYear, prevMonth, 0).getDate();
        periods = [
          {
            start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`,
            end: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${lastDay}`,
            cutoff: lastDay,
          },
        ];
      }

      for (const period of periods) {
        const periodCutoffDate = new Date(period.end);
        const daysSinceCutoff = Math.floor((now.getTime() - periodCutoffDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCutoff < 1 || daysSinceCutoff > 60) continue;

        const { data: pendingBillings } = await supabaseAdmin
          .from("escort_billings")
          .select("id, service_order_id, os_number, status, data_missao")
          .eq("client_id", client.id)
          .is("invoice_id", null);

        if (!pendingBillings?.length) continue;

        const missionsInPeriod = pendingBillings.filter((b: any) => {
          if (!b.data_missao) return false;
          const mDate = b.data_missao.split("T")[0];
          return mDate >= period.start && mDate <= period.end;
        });

        if (!missionsInPeriod.length) continue;

        const notApproved = missionsInPeriod.filter((b: any) => b.status === "A_VERIFICAR");
        const approvedNotInvoiced = missionsInPeriod.filter((b: any) => b.status === "APROVADA");
        const osNums = (arr: any[]) => arr.map((b: any) => b.os_number).filter(Boolean).join(", ");
        const bIds = (arr: any[]) => arr.map((b: any) => b.id).join(",");

        const approvalDeadline = prazoAprovacao;
        const anticipation = Math.max(0, approvalDeadline - 5);

        if (notApproved.length > 0 && daysSinceCutoff >= anticipation) {
          const isUrgent = daysSinceCutoff >= approvalDeadline;
          const alertType = isUrgent ? "ATRASO_APROVACAO" : "ANTECIPACAO_APROVACAO";
          const msg = isUrgent
            ? `⚠️ Pendência de Faturamento: ${client.name} possui ${notApproved.length} missão(ões) ainda não autorizadas pelo cliente. OS: ${osNums(notApproved)}. Período: ${period.start} a ${period.end}`
            : `Alerta de Antecipação: ${client.name} — faltam ${approvalDeadline - daysSinceCutoff} dia(s) para o fim do prazo de aprovação. ${notApproved.length} OS pendente(s): ${osNums(notApproved)}`;

          if (
            await insertAlert(
              client.id,
              client.name,
              alertType,
              msg,
              osNums(notApproved),
              bIds(notApproved),
              period.start,
              period.end,
            )
          ) {
            alertsCreated++;
            log(`CRON BillingAlerts: ${alertType} → ${client.name}`, "cron");
          }
        }

        if (daysSinceCutoff >= limiteEmissao - period.cutoff || daysSinceCutoff >= 25) {
          const allUnfatured = missionsInPeriod.filter((b: any) => !["FATURADO", "PAGO"].includes(b.status));
          if (allUnfatured.length > 0) {
            const msg = `🔴 URGENTE: ${client.name} — ${allUnfatured.length} OS do ciclo ${period.start} a ${period.end} ainda não faturada(s)! O prazo de emissão vence hoje. OS: ${osNums(allUnfatured)}`;
            if (
              await insertAlert(
                client.id,
                client.name,
                "VENCIMENTO_EMISSAO",
                msg,
                osNums(allUnfatured),
                bIds(allUnfatured),
                period.start,
                period.end,
              )
            ) {
              alertsCreated++;
              log(`CRON BillingAlerts: VENCIMENTO_EMISSAO → ${client.name}`, "cron");
            }
          }
        }

        if (approvedNotInvoiced.length > 0 && daysSinceCutoff >= 1) {
          const msg = `Faturamento Pendente: ${client.name} possui ${approvedNotInvoiced.length} missão(ões) aprovada(s) do ciclo ${period.start} a ${period.end} aguardando fatura. OS: ${osNums(approvedNotInvoiced)}`;
          if (
            await insertAlert(
              client.id,
              client.name,
              "PENDENTE_FATURAMENTO",
              msg,
              osNums(approvedNotInvoiced),
              bIds(approvedNotInvoiced),
              period.start,
              period.end,
            )
          ) {
            alertsCreated++;
          }
        }
      }
    }

    const { data: allBillings } = await supabaseAdmin
      .from("escort_billings")
      .select("id, client_id, client_name, os_number, status, data_missao")
      .in("status", ["A_VERIFICAR", "APROVADA"])
      .is("invoice_id", null);

    if (allBillings?.length) {
      for (const billing of allBillings) {
        if (!billing.data_missao || !billing.client_id) continue;
        if (!billing.os_number) continue;
        const mDate = new Date(billing.data_missao);
        const daysSince = Math.floor((now.getTime() - mDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince <= 30) continue;

        const { data: existingAlert } = await supabaseAdmin
          .from("billing_alerts")
          .select("id")
          .eq("client_id", billing.client_id)
          .eq("alert_type", "OS_ESQUECIDA")
          .eq("resolved", false)
          .ilike("os_numbers", `%${billing.os_number}%`)
          .limit(1);
        if (existingAlert?.length) continue;

        const clientRow = allClients.find((c: any) => c.id === billing.client_id);
        await supabaseAdmin.from("billing_alerts").insert({
          client_id: billing.client_id,
          client_name: billing.client_name || clientRow?.name,
          alert_type: "OS_ESQUECIDA",
          message: `🔴 OS ${billing.os_number} ficou fora do faturamento! Missão de ${billing.data_missao?.split("T")[0]} há ${daysSince} dias sem faturar. Incluir agora?`,
          os_numbers: billing.os_number,
        });
        alertsCreated++;
      }
    }

    log(`CRON BillingAlerts: ${alertsCreated} alerta(s) criado(s)`, "cron");
  } catch (err: any) {
    log(`CRON BillingAlerts: Erro: ${err.message}`, "cron");
  }
}

export async function runProvisaoCron(): Promise<void> {
  log("CRON Provisão: Iniciando provisão diária de salários", "cron");
  try {
    const now = new Date();
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const [yearStr, monthStr, dayStr] = brDate.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    const CCT = {
      salarioBase: 2432.5,
      periculosidadePct: 30,
      valeRefeicaoDia: 40.0,
      cestaBasica: 208.45,
      diasUteisMes: 22,
      horaExtraValor: 22.99,
    };
    const periculosidade = CCT.salarioBase * (CCT.periculosidadePct / 100);
    const valeRefeicaoMes = CCT.valeRefeicaoDia * CCT.diasUteisMes;
    const totalBrutoMensal = CCT.salarioBase + periculosidade + valeRefeicaoMes + CCT.cestaBasica;
    const custoDiario = +(totalBrutoMensal / 30).toFixed(2);

    const allEmployees = await storage.getEmployees();
    const activeEmployees = allEmployees.filter(
      (e: any) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta")),
    );

    let created = 0;
    let skipped = 0;

    for (const emp of activeEmployees) {
      const originId = `payroll-diario-${emp.id}-${brDate}`;

      const { data: existing } = await supabaseAdmin
        .from("financial_transactions")
        .select("id")
        .eq("origin_type", "payroll")
        .eq("origin_id", originId)
        .limit(1);
      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      if (emp.hireDate) {
        const hire = new Date(emp.hireDate);
        if (hire > now) {
          skipped++;
          continue;
        }
        if (hire.getFullYear() === year && hire.getMonth() + 1 === month && hire.getDate() > day) {
          skipped++;
          continue;
        }
      }

      const { error } = await supabaseAdmin
        .from("financial_transactions")
        .insert({
          description: `PROVISÃO DIÁRIA ${dayStr}/${monthStr} - ${emp.name?.toUpperCase()}`,
          amount: custoDiario,
          type: "EXPENSE",
          status: "PENDING",
          due_date: brDate,
          origin_type: "payroll",
          origin_id: originId,
          category_name: "Recursos Humanos",
          entity_name: emp.name || "",
          created_by: "CRON",
        })
        .select()
        .single();

      if (error) {
        log(`CRON Provisão: Erro ao criar provisão para ${emp.name}: ${error.message}`, "cron");
      } else {
        created++;
      }
    }

    log(
      `CRON Provisão: ${brDate} — ${created} provisão(ões) criada(s), ${skipped} ignorada(s) (${activeEmployees.length} agentes ativos)`,
      "cron",
    );
  } catch (err: any) {
    log(`CRON Provisão: Erro geral: ${err.message}`, "cron");
  }
}

export async function runJornadaAlertaCron(): Promise<void> {
  try {
    log("CRON JornadaAlerta: Verificando agentes com ≥200h no mês atual", "cron");
    const now = new Date();
    const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now).slice(0, 7);
    const [y, m] = mes.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const inicioMes = `${mes}-01T00:00:00-03:00`;
    const fimMes = `${mes}-${String(lastDay).padStart(2, "0")}T23:59:59-03:00`;

    const { data: pontos } = await supabaseAdmin
      .from("ponto_operacional")
      .select("employee_id, employee_name, horas_decimal")
      .gte("entrada", inicioMes)
      .lte("entrada", fimMes);

    const byEmp: Record<number, { name: string; total: number }> = {};
    for (const p of pontos || []) {
      if (!byEmp[p.employee_id]) byEmp[p.employee_id] = { name: p.employee_name || `#${p.employee_id}`, total: 0 };
      byEmp[p.employee_id].total += Number(p.horas_decimal || 0);
    }

    let created = 0;
    for (const [empIdStr, info] of Object.entries(byEmp)) {
      if (info.total < 200) continue;
      const empId = Number(empIdStr);

      const { data: existing } = await supabaseAdmin
        .from("billing_alerts")
        .select("id")
        .eq("alert_type", "JORNADA_LIMITE")
        .eq("client_id", empId)
        .eq("resolved", false)
        .like("period_start", `${mes}%`)
        .limit(1);
      if (existing && existing.length > 0) continue;

      await supabaseAdmin.from("billing_alerts").insert({
        client_id: empId,
        client_name: info.name,
        alert_type: "JORNADA_LIMITE",
        message: `Agente ${info.name} atingiu ${info.total.toFixed(1)}h neste mês. Limite: 220h`,
        period_start: `${mes}-01`,
        period_end: `${mes}-${String(lastDay).padStart(2, "0")}`,
        resolved: false,
      });
      created++;
    }
    log(
      `CRON JornadaAlerta: ${created} alerta(s) criado(s), ${Object.values(byEmp).filter((e) => e.total >= 200).length} agente(s) ≥200h`,
      "cron",
    );
  } catch (err: any) {
    log(`CRON JornadaAlerta: Erro: ${err.message}`, "cron");
  }
}

export async function runAceiteExpiradoCron(): Promise<void> {
  if (!isSupabaseHealthy()) {
    log("CRON AceiteExpirado: SKIP — Supabase offline (modo fallback)", "cron");
    return;
  }
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: expired } = await supabaseAdmin
      .from("mission_acceptances")
      .select("id, service_order_id, employee_id")
      .eq("status", "pendente")
      .lt("notified_at", twoHoursAgo);

    if (!expired?.length) return;

    for (const acc of expired) {
      await supabaseAdmin
        .from("mission_acceptances")
        .update({
          status: "expirado",
          responded_at: new Date().toISOString(),
          notes: "Expirado automaticamente — sem resposta em 2 horas",
        })
        .eq("id", acc.id);
    }

    log(`CRON AceiteExpirado: ${expired.length} aceite(s) expirado(s)`, "cron");
  } catch (err: any) {
    log(`CRON AceiteExpirado: Erro: ${err.message}`, "cron");
  }
}

export async function runVencimentosCron(): Promise<void> {
  try {
    log("CRON Vencimentos: disparando e-mail diário", "cron");
    await sendVencimentosDoDiaEmail();
  } catch (err: any) {
    log(`CRON Vencimentos: erro: ${err.message}`, "cron");
  }
}

export async function runAlertaFrotaCron(): Promise<void> {
  try {
    const { data: vehicles } = await supabaseAdmin
      .from("vehicles")
      .select("id, plate, model, brand, km, last_oil_change_km, status")
      .not("status", "eq", "inativo");

    if (!vehicles?.length) return;
    const alerts: string[] = [];

    for (const v of vehicles) {
      const currentKm = v.km || 0;
      const lastOilKm = v.last_oil_change_km || 0;
      const kmSinceOil = currentKm - lastOilKm;
      const label = `${v.plate} (${v.brand || ""} ${v.model || ""})`.trim();

      if (kmSinceOil >= 10000) {
        alerts.push(`🔴 ${label}: Troca de óleo VENCIDA (${kmSinceOil.toLocaleString()} km desde última troca)`);
        if (v.status !== "manutenção") {
          await supabaseAdmin.from("vehicles").update({ status: "manutenção" }).eq("id", v.id);
        }
      } else if (kmSinceOil >= 8000) {
        alerts.push(`🟡 ${label}: Troca de óleo em ${(10000 - kmSinceOil).toLocaleString()} km`);
      }

      const { data: nextMaint } = await supabaseAdmin
        .from("vehicle_maintenance")
        .select("id, type, next_maintenance_km, next_maintenance_date")
        .eq("vehicle_id", v.id)
        .eq("status", "scheduled")
        .order("next_maintenance_km", { ascending: true })
        .limit(1);

      if (nextMaint?.length && nextMaint[0].next_maintenance_km) {
        const kmUntil = nextMaint[0].next_maintenance_km - currentKm;
        if (kmUntil <= 0) {
          alerts.push(
            `🔴 ${label}: Manutenção "${nextMaint[0].type}" VENCIDA (KM ${nextMaint[0].next_maintenance_km.toLocaleString()} ultrapassado)`,
          );
        } else if (kmUntil <= 1000) {
          alerts.push(`🟡 ${label}: Manutenção "${nextMaint[0].type}" em ${kmUntil.toLocaleString()} km`);
        }
      }

      if (nextMaint?.length && nextMaint[0].next_maintenance_date) {
        const dueDate = new Date(nextMaint[0].next_maintenance_date);
        const daysUntil = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil < 0) {
          alerts.push(`🔴 ${label}: Manutenção "${nextMaint[0].type}" vencida há ${Math.abs(daysUntil)} dia(s)`);
        } else if (daysUntil <= 7) {
          alerts.push(`🟡 ${label}: Manutenção "${nextMaint[0].type}" em ${daysUntil} dia(s)`);
        }
      }
    }

    if (alerts.length > 0) {
      await supabaseAdmin.from("audit_logs").insert({
        user_name: "SISTEMA",
        user_role: "system",
        action: "CRON_ALERTA_FROTA",
        details: `${alerts.length} alerta(s) de frota:\n${alerts.join("\n")}`,
      });
    }
    log(`CRON AlertaFrota: ${alerts.length} alerta(s) de ${vehicles.length} veículo(s)`, "cron");
  } catch (err: any) {
    log(`CRON AlertaFrota: Erro: ${err.message}`, "cron");
  }
}

export async function runAlertaDocRhCron(): Promise<void> {
  try {
    const { data: employees } = await supabaseAdmin
      .from("employees")
      .select("id, name, status, cnh_expiry, cnv_expiry, cnv_number, vest_expiry")
      .eq("status", "ativo");

    if (!employees?.length) return;
    const today = new Date();
    const alerts: string[] = [];

    const checkExpiry = (name: string, docName: string, expiryStr: string | null) => {
      if (!expiryStr) return;
      const expiry = new Date(expiryStr);
      const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 0) {
        alerts.push(`🔴 ${name}: ${docName} VENCIDO há ${Math.abs(daysUntil)} dia(s)`);
      } else if (daysUntil <= 30) {
        alerts.push(`🟡 ${name}: ${docName} vence em ${daysUntil} dia(s) (${expiry.toLocaleDateString("pt-BR")})`);
      }
    };

    const checkReciclagem = (name: string, cnvExpiry: string | null) => {
      if (!cnvExpiry) return;
      const cnvDate = new Date(cnvExpiry);
      const twoYearsFromCnv = new Date(cnvDate);
      twoYearsFromCnv.setFullYear(twoYearsFromCnv.getFullYear() + 2);
      const daysUntilRecicla = Math.floor((twoYearsFromCnv.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilRecicla < 0) {
        alerts.push(`🔴 ${name}: Reciclagem VENCIDA há ${Math.abs(daysUntilRecicla)} dia(s)`);
      } else if (daysUntilRecicla <= 60) {
        alerts.push(`🟡 ${name}: Reciclagem em ${daysUntilRecicla} dia(s)`);
      }
    };

    for (const emp of employees) {
      checkExpiry(emp.name, "CNH", emp.cnh_expiry);
      checkExpiry(emp.name, "CNV", emp.cnv_expiry);
      checkExpiry(emp.name, "Colete Balístico", emp.vest_expiry);
      checkReciclagem(emp.name, emp.cnv_expiry);
    }

    const { data: weapons } = await supabaseAdmin
      .from("weapons")
      .select("id, model, serial_number, registration_expiry, assigned_employee_id")
      .not("registration_expiry", "is", null);

    if (weapons?.length) {
      for (const w of weapons) {
        const expiry = new Date(w.registration_expiry);
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const label = `Arma ${w.model || ""} (${w.serial_number || "S/N"})`;
        if (daysUntil < 0) {
          alerts.push(`🔴 ${label}: Registro VENCIDO há ${Math.abs(daysUntil)} dia(s)`);
        } else if (daysUntil <= 60) {
          alerts.push(`🟡 ${label}: Registro vence em ${daysUntil} dia(s)`);
        }
      }
    }

    const { data: docs } = await supabaseAdmin
      .from("employee_documents")
      .select("id, employee_id, type, expiry_date, file_name")
      .not("expiry_date", "is", null);

    if (docs?.length) {
      const empMap = new Map(employees.map((e) => [e.id, e.name]));
      for (const doc of docs) {
        const expiry = new Date(doc.expiry_date);
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const empName = empMap.get(doc.employee_id) || `Func. #${doc.employee_id}`;
        if (daysUntil < 0) {
          alerts.push(`🔴 ${empName}: Documento "${doc.type}" VENCIDO há ${Math.abs(daysUntil)} dia(s)`);
        } else if (daysUntil <= 30) {
          alerts.push(`🟡 ${empName}: Documento "${doc.type}" vence em ${daysUntil} dia(s)`);
        }
      }
    }

    if (alerts.length > 0) {
      await supabaseAdmin.from("audit_logs").insert({
        user_name: "SISTEMA",
        user_role: "system",
        action: "CRON_ALERTA_DOCUMENTOS_RH",
        details: `${alerts.length} alerta(s) de documentos:\n${alerts.join("\n")}`,
      });
    }
    log(`CRON AlertaDocRH: ${alerts.length} alerta(s) de ${employees.length} funcionário(s)`, "cron");
  } catch (err: any) {
    log(`CRON AlertaDocRH: Erro: ${err.message}`, "cron");
  }
}

export async function runResumoFinanceiroCron(): Promise<void> {
  try {
    log("CRON ResumoFinanceiro: Disparando resumo da diretoria (seg-sex)", "cron");
    const { sendDailySummaryEmail } = await import("./cron");
    await sendDailySummaryEmail();
  } catch (err: any) {
    log(`CRON ResumoFinanceiro: Erro: ${err.message}`, "cron");
  }
}

export async function runComprovantesCron(): Promise<void> {
  log("CRON Comprovantes: verificando pendências financeiras", "cron");
  const { sendComprovantesPendentesEmail } = await import("./cron");
  await sendComprovantesPendentesEmail();
}

export async function runPayslipReminderCron(): Promise<void> {
  try {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [yStr, mStr] = today.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const { from, to } = monthRange(year, month);
    const holidaySet = await loadHolidaySet(from, to);
    const elapsed = countBusinessDays(from, today, holidaySet);
    if (elapsed !== 5) return;
    log("CRON LembreteHolerite: Hoje é o 5º dia útil — verificando holerites do mês anterior", "cron");
    const { sendPayslipReminderToDiretoria } = await import("./cron");
    await sendPayslipReminderToDiretoria(year, month);
  } catch (err: any) {
    log(`CRON LembreteHolerite: Erro: ${err.message}`, "cron");
  }
}

export async function runDocComplianceCron(): Promise<void> {
  try {
    const { sendDocComplianceEmail } = await import("./jobs/document-compliance");
    const r = await sendDocComplianceEmail();
    log(
      `CRON DocCompliance: ${r.message} — ${r.employees} funcionário(s), ${r.totalMissing} faltante(s), ${r.totalExpired} vencido(s)`,
      "cron",
    );
  } catch (e: any) {
    log(`CRON DocCompliance: Erro: ${e.message}`, "cron");
  }
}

export async function runAgentCentralCron(): Promise<void> {
  await withCronLock("agent-central", async () => {
    try {
      const { runAgentCentralCheck } = await import("./cron-agent-central");
      const r = await runAgentCentralCheck();
      if (r.reminded > 0 || r.skipped_nophone > 0) {
        log(
          `CRON AgenteCentral: ${r.scanned} OSs ativas, ${r.reminded} cobranças enviadas, ${r.skipped_nophone} sem telefone`,
          "cron",
        );
      }
    } catch (e: any) {
      log(`CRON AgenteCentral: Erro: ${e.message}`, "cron");
    }
  });
}

export async function runAgentCentralEscalationCron(): Promise<void> {
  await withCronLock("agent-central-escalation", async () => {
    try {
      const { flushAgentEscalations } = await import("./lib/agent-central-mention");
      const r = await flushAgentEscalations();
      if (r.escalated > 0 || r.fulfilled > 0 || r.no_second > 0) {
        log(
          `CRON AgenteCentral-Escalonamento: ${r.escalated} 2º agente(s) cobrado(s), ${r.fulfilled} resolvido(s) (1º respondeu), ${r.no_second} sem 2º agente`,
          "cron",
        );
      }
    } catch (e: any) {
      log(`CRON AgenteCentral-Escalonamento: Erro: ${e.message}`, "cron");
    }
  });
}
