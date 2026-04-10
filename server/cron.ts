import cron from "node-cron";
import nodemailer from "nodemailer";
import { storage } from "./storage";
import * as apibrasil from "./apibrasil";
import { log } from "./index";
import { getVehicleCache, sendCommand } from "./truckscontrol";
import { supabaseAdmin } from "./supabase";
import { getHorasElapsedFromDB, calcularFaturamentoLive } from "./billing-calc";

const RODIZIO_MAP: Record<number, number[]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
  5: [9, 0],
};

async function sendRodizioAlerts() {
  const now = new Date();
  const brHour = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric" }).format(now);
  const brDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(now);

  const dayOfWeekMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
  const dayNum = dayOfWeekMap[brDay];
  if (!dayNum) {
    log(`CRON Rodízio: Hoje é ${brDay} — sem rodízio (sábado/domingo)`, "cron");
    return;
  }

  const digitsToday = RODIZIO_MAP[dayNum];
  if (!digitsToday) return;

  log(`CRON Rodízio: Verificando veículos com final ${digitsToday.join(", ")} (${brDay}, ${brHour}h BRT)`, "cron");

  const tcVehicles = getVehicleCache();
  if (tcVehicles.length === 0) {
    log("CRON Rodízio: Cache de veículos TrucksControl vazio, pulando", "cron");
    return;
  }

  let sent = 0;
  for (const v of tcVehicles) {
    const plate = v.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (plate.length < 1) continue;
    const lastChar = plate.charAt(plate.length - 1);
    const lastDigit = parseInt(lastChar, 10);
    if (isNaN(lastDigit)) continue;

    if (digitsToday.includes(lastDigit)) {
      try {
        const result = await sendCommand(v.veiID, "mensagem_texto", "ATENCAO, RODIZIO DESSE VEICULO HOJE");
        log(`CRON Rodízio: Mensagem enviada para ${v.placa} (veiID=${v.veiID}): ${result.message}`, "cron");
        sent++;
      } catch (err: any) {
        log(`CRON Rodízio: Erro ao enviar para ${v.placa}: ${err.message}`, "cron");
      }
    }
  }
  log(`CRON Rodízio: ${sent} mensagem(ns) enviada(s)`, "cron");
}

export function initCronJobs() {
  cron.schedule("0 2 * * *", async () => {
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
  });

  cron.schedule("0 3 1 */3 *", async () => {
    log("CRON: Iniciando compliance de RH (a cada 90 dias)", "cron");
    try {
      const employees = await storage.getEmployees();
      const activeEmployees = employees.filter(e => e.status === "ativo");

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
  });

  cron.schedule("30 9 * * 1-5", () => {
    log("CRON Rodízio: Disparando alerta das 06:30 BRT", "cron");
    sendRodizioAlerts().catch(err => log(`CRON Rodízio: Erro: ${err.message}`, "cron"));
  });

  cron.schedule("30 19 * * 1-5", () => {
    log("CRON Rodízio: Disparando alerta das 16:30 BRT", "cron");
    sendRodizioAlerts().catch(err => log(`CRON Rodízio: Erro: ${err.message}`, "cron"));
  });

  cron.schedule("*/30 * * * *", async () => {
    try {
      const toBRT = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
      const n = (v: any) => Number(v) || 0;
      const r = (v: number) => Math.round(v * 100) / 100;

      const { data: allOrders } = await supabaseAdmin.from("service_orders").select("*");
      if (!allOrders?.length) return;

      const isConcluded = (so: any) =>
        ["concluida", "concluída", "cancelada", "recusada"].includes(so.status) ||
        ["encerrada", "finalizada"].includes(so.mission_status);

      const activeOrders = allOrders.filter((so: any) =>
        so.type === "escolta" &&
        !isConcluded(so) &&
        so.mission_status !== "aguardando"
      );

      const { data: existingBillings } = await supabaseAdmin.from("escort_billings").select("service_order_id, status");
      const billedSet = new Set((existingBillings || []).map((b: any) => b.service_order_id));
      const unverifBilledSet = new Set((existingBillings || []).filter((b: any) => b.status === "A_VERIFICAR").map((b: any) => b.service_order_id));
      const unbilledConcluded = allOrders.filter((so: any) =>
        so.type === "escolta" &&
        isConcluded(so) &&
        !billedSet.has(so.id)
      );
      const unverifConcluded = allOrders.filter((so: any) =>
        so.type === "escolta" &&
        isConcluded(so) &&
        unverifBilledSet.has(so.id)
      );

      const seenIds = new Set<number>();
      const liveOrders = [...activeOrders, ...unbilledConcluded, ...unverifConcluded].filter((so: any) => {
        if (seenIds.has(so.id)) return false;
        seenIds.add(so.id);
        return true;
      });
      if (!liveOrders.length) return;
      log(`CRON Billing: ${activeOrders.length} ativas + ${unbilledConcluded.length} concluídas sem billing + ${unverifConcluded.length} A_VERIFICAR para processar`, "cron");

      const { data: allContracts } = await supabaseAdmin.from("escort_contracts").select("*");
      const contractMap = new Map<number, any>();
      const clientContractMap = new Map<number, any>();
      for (const c of (allContracts || [])) {
        contractMap.set(c.id, c);
        if (c.status === "Ativo" && c.client_id) {
          clientContractMap.set(c.client_id, c);
        }
      }

      const liveOrderIds = liveOrders.map((so: any) => so.id);
      const { data: allPhotos } = await supabaseAdmin.from("mission_photos").select("service_order_id, step, km_value").in("service_order_id", liveOrderIds);
      const photosMap = new Map<number, any[]>();
      for (const p of (allPhotos || [])) {
        if (!photosMap.has(p.service_order_id)) photosMap.set(p.service_order_id, []);
        photosMap.get(p.service_order_id)!.push(p);
      }

      for (const so of liveOrders) {
        try {
          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, valor_km_extra: 2.40, franquia_minima_km: 50, franquia_km: 50, franquia_horas: 3, valor_hora_estadia: 50, valor_hora_extra: 110, valor_acionamento: 0, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30 };
          if (so.escort_contract_id && contractMap.has(so.escort_contract_id)) {
            contrato = contractMap.get(so.escort_contract_id);
          } else if (so.client_id && clientContractMap.has(so.client_id)) {
            contrato = clientContractMap.get(so.client_id);
          }

          const photos = photosMap.get(so.id) || [];
          const kmChegadaPhoto = (photos || []).find((p: any) => p.step === "km_chegada");
          const kmSaidaPhoto = (photos || []).find((p: any) => p.step === "km_saida");
          const kmFinalPhoto = (photos || []).find((p: any) => p.step === "km_final");
          const kmInicial = n(kmChegadaPhoto?.km_value) || n(kmSaidaPhoto?.km_value);
          const kmFinalVal = n(kmFinalPhoto?.km_value);
          const kmFinal = kmFinalVal > kmInicial ? kmFinalVal : kmInicial;

          const missionEndDate = so.completed_date ? new Date(so.completed_date) : new Date();
          const scheduledDate = so.scheduled_date ? new Date(so.scheduled_date) : null;
          const missionStartDate = so.mission_started_at ? new Date(so.mission_started_at) : null;

          const scheduledTime = scheduledDate ? toBRT(scheduledDate) : undefined;
          const startTime = missionStartDate ? toBRT(missionStartDate) : undefined;
          const endTime = toBRT(missionEndDate);

          const billingStartDate = missionStartDate || scheduledDate;
          const inicioConsiderado = billingStartDate ? toBRT(billingStartDate) : (startTime || scheduledTime || "00:00");

          const missionNotStartedYet = !so.mission_status || so.mission_status === "aguardando";
          const scheduledInFutureCron = (() => {
            if (!so.scheduled_date) return false;
            const sched = new Date(String(so.scheduled_date).includes("Z") || /[+-]\d{2}:\d{2}$/.test(String(so.scheduled_date)) ? String(so.scheduled_date) : String(so.scheduled_date) + "Z");
            return sched.getTime() > Date.now();
          })();
          const skipBillingHoursCron = missionNotStartedYet || (so.status === "agendada" && scheduledInFutureCron);

          const horasMissao = skipBillingHoursCron ? 0 : await getHorasElapsedFromDB(so.id);

          const km_total = kmFinal - kmInicial;
          const km_carregado = Math.max(0, km_total);

          const billing = calcularFaturamentoLive({
            horasMissao,
            kmInicial,
            kmFinal,
            contrato,
          });

          let { fat_acionamento, fat_km, fat_hora_extra, fat_total } = billing;
          const { km_excedente, has_acionamento: hasAcionamento } = billing;
          const franquiaKm = billing.franquia_km;

          const isNoturno = (() => {
            const checkH = (t?: string) => { if (!t) return false; const h = parseInt(t.split(":")[0]); return h >= 22 || h < 5; };
            return checkH(inicioConsiderado) || checkH(endTime);
          })();
          if (isNoturno) {
            fat_total += (hasAcionamento ? (fat_acionamento + fat_km) : fat_km) * (n(contrato.adicional_noturno_km_pct) / 100);
          }

          const { data: mCosts } = await supabaseAdmin.from("mission_costs").select("category, amount, cost_type").eq("service_order_id", so.id);
          let despesas_pedagio = 0, despesas_combustivel = 0, despesas_outras = 0, receitas_os = 0;
          (mCosts || []).forEach((c: any) => {
            if (c.cost_type === "revenue") {
              receitas_os += n(c.amount);
            } else {
              if (c.category === "Pedágio") despesas_pedagio += n(c.amount);
              else if (c.category === "Combustível") despesas_combustivel += n(c.amount);
              else despesas_outras += n(c.amount);
            }
          });
          fat_total += despesas_pedagio + receitas_os;

          const pag_vrp = n(contrato.vrp_base);
          const resultado_bruto = fat_total - pag_vrp;

          const { data: cliRow } = so.client_id ? await supabaseAdmin.from("clients").select("name").eq("id", so.client_id).single() : { data: null };
          const { data: empRow } = so.assigned_employee_id ? await supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_id).single() : { data: null };
          const { data: emp2Row } = so.assigned_employee_2_id ? await supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_2_id).single() : { data: null };
          const { data: vehRow } = so.vehicle_id ? await supabaseAdmin.from("vehicles").select("plate").eq("id", so.vehicle_id).single() : { data: null };

          const billingPayload = {
            service_order_id: so.id,
            client_id: so.client_id, client_name: cliRow?.name || "--",
            contract_id: contrato.id || null,
            km_inicial: n(kmInicial), km_final: n(kmFinal), km_vazio: 0,
            km_carregado: n(km_carregado), km_total: n(km_total),
            km_faturado: n(Math.max(km_carregado, franquiaKm)), km_franquia: n(franquiaKm),
            km_excedente: n(km_excedente),
            horario_agendado: scheduledTime || null,
            horario_inicio: startTime || null, horario_fim: endTime || null,
            horario_inicio_considerado: inicioConsiderado,
            horas_missao: r(horasMissao), horas_trabalhadas: r(horasMissao),
            horas_estadia: 0, teve_pernoite: false, is_noturno: isNoturno,
            fat_acionamento: r(fat_acionamento), fat_km: r(fat_km), fat_hora_extra: r(fat_hora_extra), fat_total: r(fat_total),
            valor_franquia: hasAcionamento ? r(fat_acionamento) : r(Math.min(km_carregado, franquiaKm) * n(contrato.valor_km_carregado)),
            valor_km_extra: r(km_excedente * (hasAcionamento ? n(contrato.valor_km_extra) : n(contrato.valor_km_carregado))),
            pag_vrp: r(pag_vrp), pag_total: r(pag_vrp),
            resultado_bruto: r(resultado_bruto), resultado_liquido: r(resultado_bruto),
            margem_percentual: fat_total > 0 ? r((resultado_bruto / fat_total) * 100) : 0,
            vigilante_id: so.assigned_employee_id, vigilante_name: empRow?.name || "--",
            vigilante2_id: so.assigned_employee_2_id || null, vigilante2_name: emp2Row?.name || null,
            origem: so.origin || null, destino: so.destination || null,
            placa_viatura: vehRow?.plate || null,
            placa_escoltado: so.escorted_vehicle_plate || null,
            motorista_escoltado: so.escorted_driver_name || null,
            despesas_pedagio: r(despesas_pedagio), despesas_combustivel: r(despesas_combustivel), despesas_outras: r(despesas_outras), receitas_os: r(receitas_os),
            data_missao: (() => {
              const a = so.mission_started_at ? new Date(so.mission_started_at).getTime() : Infinity;
              const b = so.scheduled_date ? new Date(so.scheduled_date).getTime() : Infinity;
              if (a === Infinity && b === Infinity) return new Date();
              return a <= b ? so.mission_started_at : so.scheduled_date;
            })(),
            status: "A_VERIFICAR", created_by: "CRON",
          };

          const { data: existBill } = await supabaseAdmin.from("escort_billings").select("id").eq("service_order_id", so.id).limit(1);
          if (existBill?.length) {
            const { service_order_id: _sid, created_by: _cb, ...updatePayload } = billingPayload;
            await supabaseAdmin.from("escort_billings").update(updatePayload).eq("id", existBill[0].id);
          } else {
            await supabaseAdmin.from("escort_billings").insert(billingPayload);
          }

          log(`CRON Billing: OS ${so.os_number} recalculada - ${r(horasMissao)}h, ${n(km_total)}km, fat=${r(fat_total)}`, "cron");
        } catch (err: any) {
          log(`CRON Billing: Erro OS ${so.os_number}: ${err.message}`, "cron");
        }
      }
    } catch (err: any) {
      log(`CRON Billing: Erro geral: ${err.message}`, "cron");
    }
  });

  cron.schedule("0 6 * * *", async () => {
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

      const insertAlert = async (clientId: number, clientName: string, alertType: string, message: string, osNumbers: string, billingIds: string, periodStart: string, periodEnd: string) => {
        const { data: existing } = await supabaseAdmin.from("billing_alerts")
          .select("id").eq("client_id", clientId).eq("alert_type", alertType)
          .eq("period_start", periodStart).eq("period_end", periodEnd).eq("resolved", false).limit(1);
        if (existing?.length) return false;
        await supabaseAdmin.from("billing_alerts").insert({
          client_id: clientId, client_name: clientName, alert_type: alertType,
          message, billing_ids: billingIds, os_numbers: osNumbers,
          period_start: periodStart, period_end: periodEnd,
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
          periods.push({ start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-16`, end: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${lastDay}`, cutoff: lastDay });
        } else if (cycle === "mensal") {
          const prevMonth = brMonth === 1 ? 12 : brMonth - 1;
          const prevYear = brMonth === 1 ? brYear - 1 : brYear;
          const lastDay = new Date(prevYear, prevMonth, 0).getDate();
          periods = [
            { start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`, end: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${lastDay}`, cutoff: lastDay },
          ];
        }

        for (const period of periods) {
          const periodCutoffDate = new Date(period.end);
          const daysSinceCutoff = Math.floor((now.getTime() - periodCutoffDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceCutoff < 1 || daysSinceCutoff > 60) continue;

          const { data: pendingBillings } = await supabaseAdmin.from("escort_billings")
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

            if (await insertAlert(client.id, client.name, alertType, msg, osNums(notApproved), bIds(notApproved), period.start, period.end)) {
              alertsCreated++;
              log(`CRON BillingAlerts: ${alertType} → ${client.name}`, "cron");
            }
          }

          if (daysSinceCutoff >= limiteEmissao - period.cutoff || daysSinceCutoff >= 25) {
            const allUnfatured = missionsInPeriod.filter((b: any) => !["FATURADO", "PAGO"].includes(b.status));
            if (allUnfatured.length > 0) {
              const msg = `🔴 URGENTE: ${client.name} — ${allUnfatured.length} OS do ciclo ${period.start} a ${period.end} ainda não faturada(s)! O prazo de emissão vence hoje. OS: ${osNums(allUnfatured)}`;
              if (await insertAlert(client.id, client.name, "VENCIMENTO_EMISSAO", msg, osNums(allUnfatured), bIds(allUnfatured), period.start, period.end)) {
                alertsCreated++;
                log(`CRON BillingAlerts: VENCIMENTO_EMISSAO → ${client.name}`, "cron");
              }
            }
          }

          if (approvedNotInvoiced.length > 0 && daysSinceCutoff >= 1) {
            const msg = `Faturamento Pendente: ${client.name} possui ${approvedNotInvoiced.length} missão(ões) aprovada(s) do ciclo ${period.start} a ${period.end} aguardando fatura. OS: ${osNums(approvedNotInvoiced)}`;
            if (await insertAlert(client.id, client.name, "PENDENTE_FATURAMENTO", msg, osNums(approvedNotInvoiced), bIds(approvedNotInvoiced), period.start, period.end)) {
              alertsCreated++;
            }
          }
        }
      }

      const { data: allBillings } = await supabaseAdmin.from("escort_billings")
        .select("id, client_id, client_name, os_number, status, data_missao")
        .in("status", ["A_VERIFICAR", "APROVADA"])
        .is("invoice_id", null);

      if (allBillings?.length) {
        for (const billing of allBillings) {
          if (!billing.data_missao || !billing.client_id) continue;
          const mDate = new Date(billing.data_missao);
          const daysSince = Math.floor((now.getTime() - mDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince <= 30) continue;

          const { data: existingAlert } = await supabaseAdmin.from("billing_alerts")
            .select("id").eq("client_id", billing.client_id).eq("alert_type", "OS_ESQUECIDA")
            .eq("resolved", false).ilike("os_numbers", `%${billing.os_number}%`).limit(1);
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
  });

  cron.schedule("59 2 * * *", async () => {
    log("CRON Provisão: Iniciando provisão diária de salários", "cron");
    try {
      const now = new Date();
      const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
      const [yearStr, monthStr, dayStr] = brDate.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);

      const CCT = { salarioBase: 2432.50, periculosidadePct: 30, valeRefeicaoDia: 40.00, cestaBasica: 208.45, diasUteisMes: 22, horaExtraValor: 22.99 };
      const periculosidade = CCT.salarioBase * (CCT.periculosidadePct / 100);
      const valeRefeicaoMes = CCT.valeRefeicaoDia * CCT.diasUteisMes;
      const totalBrutoMensal = CCT.salarioBase + periculosidade + valeRefeicaoMes + CCT.cestaBasica;
      const custoDiario = +(totalBrutoMensal / 30).toFixed(2);

      const allEmployees = await storage.getEmployees();
      const activeEmployees = allEmployees.filter((e: any) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta")));

      let created = 0;
      let skipped = 0;

      for (const emp of activeEmployees) {
        const originId = `payroll-diario-${emp.id}-${brDate}`;

        const { data: existing } = await supabaseAdmin.from("financial_transactions")
          .select("id").eq("origin_type", "payroll").eq("origin_id", originId).limit(1);
        if (existing && existing.length > 0) { skipped++; continue; }

        let fator = 1;
        if (emp.hireDate) {
          const hire = new Date(emp.hireDate);
          if (hire > now) { skipped++; continue; }
          if (hire.getFullYear() === year && hire.getMonth() + 1 === month && hire.getDate() > day) { skipped++; continue; }
        }

        const { data, error } = await supabaseAdmin.from("financial_transactions").insert({
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
        }).select().single();

        if (error) {
          log(`CRON Provisão: Erro ao criar provisão para ${emp.name}: ${error.message}`, "cron");
        } else {
          created++;
        }
      }

      log(`CRON Provisão: ${brDate} — ${created} provisão(ões) criada(s), ${skipped} ignorada(s) (${activeEmployees.length} agentes ativos)`, "cron");
    } catch (err: any) {
      log(`CRON Provisão: Erro geral: ${err.message}`, "cron");
    }
  });

  cron.schedule("0 11 * * *", async () => {
    try {
      log("CRON JornadaAlerta: Verificando agentes com ≥200h no mês atual", "cron");
      const now = new Date();
      const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now).slice(0, 7);
      const [y, m] = mes.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const inicioMes = `${mes}-01T00:00:00-03:00`;
      const fimMes = `${mes}-${String(lastDay).padStart(2, "0")}T23:59:59-03:00`;

      const { data: pontos } = await supabaseAdmin.from("ponto_operacional")
        .select("employee_id, employee_name, horas_decimal")
        .gte("entrada", inicioMes).lte("entrada", fimMes);

      const byEmp: Record<number, { name: string; total: number }> = {};
      for (const p of pontos || []) {
        if (!byEmp[p.employee_id]) byEmp[p.employee_id] = { name: p.employee_name || `#${p.employee_id}`, total: 0 };
        byEmp[p.employee_id].total += Number(p.horas_decimal || 0);
      }

      let created = 0;
      for (const [empIdStr, info] of Object.entries(byEmp)) {
        if (info.total < 200) continue;
        const empId = Number(empIdStr);

        const { data: existing } = await supabaseAdmin.from("billing_alerts")
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
      log(`CRON JornadaAlerta: ${created} alerta(s) criado(s), ${Object.values(byEmp).filter(e => e.total >= 200).length} agente(s) ≥200h`, "cron");
    } catch (err: any) {
      log(`CRON JornadaAlerta: Erro: ${err.message}`, "cron");
    }
  });

  cron.schedule("*/30 * * * *", async () => {
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: expired } = await supabaseAdmin
        .from("mission_acceptances").select("id, service_order_id, employee_id")
        .eq("status", "pendente")
        .lt("notified_at", twoHoursAgo);

      if (!expired?.length) return;

      for (const acc of expired) {
        await supabaseAdmin.from("mission_acceptances").update({
          status: "expirado",
          responded_at: new Date().toISOString(),
          notes: "Expirado automaticamente — sem resposta em 2 horas",
        }).eq("id", acc.id);
      }

      log(`CRON AceiteExpirado: ${expired.length} aceite(s) expirado(s)`, "cron");
    } catch (err: any) {
      log(`CRON AceiteExpirado: Erro: ${err.message}`, "cron");
    }
  });

  cron.schedule("0 7 * * *", async () => {
    try {
      const { data: vehicles } = await supabaseAdmin.from("vehicles")
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

        const { data: nextMaint } = await supabaseAdmin.from("vehicle_maintenance")
          .select("id, type, next_maintenance_km, next_maintenance_date")
          .eq("vehicle_id", v.id).eq("status", "scheduled")
          .order("next_maintenance_km", { ascending: true }).limit(1);

        if (nextMaint?.length && nextMaint[0].next_maintenance_km) {
          const kmUntil = nextMaint[0].next_maintenance_km - currentKm;
          if (kmUntil <= 0) {
            alerts.push(`🔴 ${label}: Manutenção "${nextMaint[0].type}" VENCIDA (KM ${nextMaint[0].next_maintenance_km.toLocaleString()} ultrapassado)`);
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
          user_name: "SISTEMA", user_role: "system",
          action: "CRON_ALERTA_FROTA",
          details: `${alerts.length} alerta(s) de frota:\n${alerts.join("\n")}`,
        });
      }
      log(`CRON AlertaFrota: ${alerts.length} alerta(s) de ${vehicles.length} veículo(s)`, "cron");
    } catch (err: any) {
      log(`CRON AlertaFrota: Erro: ${err.message}`, "cron");
    }
  });

  cron.schedule("0 8 * * *", async () => {
    try {
      const { data: employees } = await supabaseAdmin.from("employees")
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

      const { data: weapons } = await supabaseAdmin.from("weapons")
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

      const { data: docs } = await supabaseAdmin.from("employee_documents")
        .select("id, employee_id, type, expiry_date, file_name")
        .not("expiry_date", "is", null);

      if (docs?.length) {
        const empMap = new Map(employees.map(e => [e.id, e.name]));
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
          user_name: "SISTEMA", user_role: "system",
          action: "CRON_ALERTA_DOCUMENTOS_RH",
          details: `${alerts.length} alerta(s) de documentos:\n${alerts.join("\n")}`,
        });
      }
      log(`CRON AlertaDocRH: ${alerts.length} alerta(s) de ${employees.length} funcionário(s)`, "cron");
    } catch (err: any) {
      log(`CRON AlertaDocRH: Erro: ${err.message}`, "cron");
    }
  });

  cron.schedule("59 2 * * *", () => {
    log("CRON ResumoDiario: Gerando resumo financeiro do dia (23:59 BRT)", "cron");
    sendDailySummaryEmail().catch(err => log(`CRON ResumoDiario: Erro: ${err.message}`, "cron"));
  });

  log("CRON: Tarefas agendadas - Frota (diário 02:00) | RH (trimestral dia 1 às 03:00) | Rodízio (seg-sex 06:30 e 16:30 BRT) | Billing (a cada 30min) | BillingAlerts (diário 03:00 BRT) | Provisão Salário (diário 23:59 BRT) | JornadaAlerta (diário 08:00 BRT) | AceiteExpirado (a cada 30min) | AlertaFrota (diário 07:00) | AlertaDocRH (diário 08:00) | ResumoDiario (diário 23:59 BRT)", "cron");
}

function getCronMailTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });
}

const DIRETORIA_EMAIL = "diretoria@torresseguranca.com.br, thiago@grupotmseg.com.br";

export async function sendDailySummaryEmail(targetDate?: string): Promise<{ success: boolean; message: string }> {
  const transporter = getCronMailTransporter();
  if (!transporter) {
    return { success: false, message: "SMTP não configurado" };
  }

  const todayBRT = targetDate || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const todayLabel = new Date(todayBRT + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const diaSemana = new Date(todayBRT + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });

  try {
    const todayStart = todayBRT + "T00:00:00";
    const todayEnd = todayBRT + "T23:59:59";

    const [billingsRes, transactionsRes, clientsRes] = await Promise.all([
      supabaseAdmin.from("escort_billings").select("*").gte("data_missao", todayStart).lte("data_missao", todayEnd),
      supabaseAdmin.from("financial_transactions").select("*"),
      supabaseAdmin.from("clients").select("id, name, company_name"),
    ]);

    const allOrders = await storage.getServiceOrders();
    const employees = await storage.getEmployees();

    const clientMap = new Map<number, string>();
    for (const c of (clientsRes.data || [])) {
      clientMap.set(c.id, c.company_name || c.name || `Cliente #${c.id}`);
    }

    const extractDateBRT = (v: any): string | null => {
      if (!v) return null;
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      try { return new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
      catch { return null; }
    };

    const todayOrders = allOrders.filter((so: any) => {
      const sd = extractDateBRT(so.scheduledDate);
      const cd = extractDateBRT(so.completedDate);
      const ms = so.missionStartedAt ? extractDateBRT(so.missionStartedAt) : null;
      return sd === todayBRT || cd === todayBRT || ms === todayBRT;
    });

    const escoltaOrders = todayOrders.filter((so: any) => so.type === "escolta");
    const concluidas = todayOrders.filter((so: any) => so.status === "concluida" || so.status === "concluída" || so.missionStatus === "encerrada");
    const emAndamento = todayOrders.filter((so: any) => so.status === "em_andamento");
    const canceladas = todayOrders.filter((so: any) => so.status === "cancelada" || so.status === "recusada");

    const todayBillings = billingsRes.data || [];
    const billingBySO = new Map<number, any>();
    for (const b of todayBillings) {
      const soId = Number(b.service_order_id);
      if (!soId) continue;
      const existing = billingBySO.get(soId);
      if (!existing || new Date(b.created_at || 0) > new Date(existing.created_at || 0)) {
        billingBySO.set(soId, b);
      }
    }
    const dedupedBillings = Array.from(billingBySO.values());

    let fatTotal = 0;
    let custoEscolta = 0;
    let kmTotal = 0;
    let despPedagio = 0;
    let despCombustivel = 0;

    for (const b of dedupedBillings) {
      fatTotal += Number(b.fat_total) || 0;
      const pagTotal = Number(b.pag_total) || (Number(b.pag_vrp) || 0) + (Number(b.pag_periculosidade) || 0) + (Number(b.pag_adicional_noturno) || 0) + (Number(b.pag_reembolsos) || 0);
      const despTotal = Number(b.desp_total) || (Number(b.desp_pedagio) || Number(b.despesas_pedagio) || 0) + (Number(b.desp_combustivel) || Number(b.despesas_combustivel) || 0) + (Number(b.desp_outras) || Number(b.despesas_outras) || 0);
      custoEscolta += pagTotal + despTotal;
      kmTotal += Number(b.km_total) || 0;
      despPedagio += Number(b.desp_pedagio) || Number(b.despesas_pedagio) || 0;
      despCombustivel += Number(b.desp_combustivel) || Number(b.despesas_combustivel) || 0;
    }

    for (const so of todayOrders) {
      if (billingBySO.has(so.id)) continue;
      const soFat = Number((so as any).fat_calculado) || 0;
      const soCusto = Number((so as any).custo_total_alocado) || 0;
      if (soFat > 0 && !dedupedBillings.some((b: any) => b.service_order_id === so.id)) {
        fatTotal += soFat;
      }
      custoEscolta += soCusto;
      kmTotal += Number((so as any).km_total_calculado) || 0;
    }

    const allTx = transactionsRes.data || [];
    const todayTx = allTx.filter((t: any) => {
      const dueDate = t.due_date ? String(t.due_date) : null;
      const payDate = t.payment_date ? String(t.payment_date) : null;
      const createdDate = extractDateBRT(t.created_at);
      return dueDate === todayBRT || payDate === todayBRT || createdDate === todayBRT;
    });
    let despesas = 0;
    let receitas = 0;
    for (const t of todayTx) {
      const amt = Math.abs(Number(t.amount) || 0);
      if (t.type === "EXPENSE" || t.type === "despesa") despesas += amt;
      else if (t.type === "INCOME" || t.type === "receita") receitas += amt;
    }

    const custoTotal = custoEscolta + despesas;
    const resultado = fatTotal + receitas - custoTotal;
    const margem = fatTotal > 0 ? (resultado / (fatTotal + receitas)) * 100 : 0;

    const activeEmps = employees.filter(e => e.status === "ativo");

    const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const osDetails = todayOrders.slice(0, 30).map((so: any) => {
      const statusMap: Record<string, string> = {
        em_andamento: "&#128994; Em Andamento",
        concluida: "&#9989; Concluída",
        "concluída": "&#9989; Concluída",
        agendada: "&#128197; Agendada",
        aberta: "&#128203; Aberta",
        cancelada: "&#10060; Cancelada",
        recusada: "&#128683; Recusada",
      };
      const statusLabel = statusMap[so.status] || so.status;

      const billing = billingBySO.get(so.id);
      const fat = billing ? (Number(billing.fat_total) || 0) : (Number((so as any).fat_calculado) || 0);
      let custo = Number((so as any).custo_total_alocado) || 0;
      if (billing) {
        const bPag = Number(billing.pag_total) || (Number(billing.pag_vrp) || 0) + (Number(billing.pag_periculosidade) || 0) + (Number(billing.pag_adicional_noturno) || 0) + (Number(billing.pag_reembolsos) || 0);
        const bDesp = Number(billing.desp_total) || (Number(billing.desp_pedagio) || Number(billing.despesas_pedagio) || 0) + (Number(billing.desp_combustivel) || Number(billing.despesas_combustivel) || 0) + (Number(billing.desp_outras) || Number(billing.despesas_outras) || 0);
        if (bPag + bDesp > 0) custo = bPag + bDesp;
      }

      const clientName = billing?.client_name || clientMap.get(so.clientId) || "-";

      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${so.osNumber || "-"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${clientName}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${statusLabel}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;">R$ ${fmt(fat)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;color:#dc2626;">R$ ${fmt(custo)}</td>
      </tr>`;
    }).join("");

    const margemColor = margem >= 30 ? "#16a34a" : margem >= 15 ? "#ca8a04" : "#dc2626";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px;">
  <div style="max-width:650px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 30px;color:#fff;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;opacity:0.7;">Torres Vigilância Patrimonial</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px;">Resumo Diário — Balanço Geral</div>
      <div style="font-size:14px;opacity:0.8;margin-top:4px;">${diaSemana}, ${todayLabel}</div>
    </div>

    <div style="padding:24px 30px;">

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
        <div style="flex:1;min-width:140px;background:#f0fdf4;border-radius:8px;padding:16px;border-left:4px solid #16a34a;">
          <div style="font-size:11px;color:#666;text-transform:uppercase;">Faturamento</div>
          <div style="font-size:22px;font-weight:700;color:#16a34a;">R$ ${fmt(fatTotal)}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#fef2f2;border-radius:8px;padding:16px;border-left:4px solid #dc2626;">
          <div style="font-size:11px;color:#666;text-transform:uppercase;">Custos</div>
          <div style="font-size:22px;font-weight:700;color:#dc2626;">R$ ${fmt(custoTotal)}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#eff6ff;border-radius:8px;padding:16px;border-left:4px solid #2563eb;">
          <div style="font-size:11px;color:#666;text-transform:uppercase;">Resultado</div>
          <div style="font-size:22px;font-weight:700;color:${resultado >= 0 ? "#2563eb" : "#dc2626"};">R$ ${fmt(resultado)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Margem de Lucro</td>
          <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:${margemColor};">${fmt(margem)}%</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">KM Total Rodados</td>
          <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">${fmt(kmTotal)} km</td>
        </tr>
        ${despPedagio > 0 ? `<tr>
          <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Pedágio (Escoltas)</td>
          <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmt(despPedagio)}</td>
        </tr>` : ""}
        ${despCombustivel > 0 ? `<tr>
          <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Combustível (Escoltas)</td>
          <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmt(despCombustivel)}</td>
        </tr>` : ""}
        ${receitas > 0 ? `<tr>
          <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Receitas Avulsas</td>
          <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#16a34a;">R$ ${fmt(receitas)}</td>
        </tr>` : ""}
        ${despesas > 0 ? `<tr>
          <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Despesas Avulsas</td>
          <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmt(despesas)}</td>
        </tr>` : ""}
      </table>

      <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:24px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px;color:#334155;">Operações do Dia</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#666;">Total de OS</td>
            <td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${todayOrders.length}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#666;">Escoltas</td>
            <td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${escoltaOrders.length}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#666;">Concluídas</td>
            <td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#16a34a;">${concluidas.length}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#666;">Em Andamento</td>
            <td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#2563eb;">${emAndamento.length}</td>
          </tr>
          ${canceladas.length > 0 ? `<tr>
            <td style="padding:6px 0;font-size:13px;color:#666;">Canceladas/Recusadas</td>
            <td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#dc2626;">${canceladas.length}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#666;">Efetivo Ativo</td>
            <td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${activeEmps.length} agentes</td>
          </tr>
        </table>
      </div>

      ${todayOrders.length > 0 ? `
      <div style="margin-bottom:24px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#334155;">Detalhamento por OS</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#666;font-weight:600;">OS</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#666;font-weight:600;">Cliente</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#666;font-weight:600;">Status</th>
              <th style="padding:8px 10px;text-align:right;font-size:12px;color:#666;font-weight:600;">Faturamento</th>
              <th style="padding:8px 10px;text-align:right;font-size:12px;color:#666;font-weight:600;">Custo</th>
            </tr>
          </thead>
          <tbody>${osDetails}</tbody>
        </table>
      </div>
      ` : ""}

    </div>

    <div style="background:#f8fafc;padding:16px 30px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
      Torres Vigilância Patrimonial — CNPJ 36.982.392/0001-89<br>
      Relatório gerado automaticamente em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
    </div>

  </div>
</body>
</html>`;

    const from = `"Torres Vigilância - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;

    await transporter.sendMail({
      from,
      to: DIRETORIA_EMAIL,
      subject: `📊 Resumo Diário — ${todayLabel} | Fat. R$ ${fmt(fatTotal)} | Resultado R$ ${fmt(resultado)}`,
      html,
    });

    log(`CRON ResumoDiario: E-mail enviado para ${DIRETORIA_EMAIL} — Fat. R$ ${fmt(fatTotal)} | Resultado R$ ${fmt(resultado)}`, "cron");
    return { success: true, message: `E-mail enviado para ${DIRETORIA_EMAIL}` };
  } catch (err: any) {
    log(`CRON ResumoDiario: Erro: ${err.message}`, "cron");
    return { success: false, message: err.message };
  }
}
