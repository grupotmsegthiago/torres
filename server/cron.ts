import cron from "node-cron";
import { storage } from "./storage";
import * as apibrasil from "./apibrasil";
import { log } from "./index";
import { getVehicleCache, sendCommand } from "./truckscontrol";
import { supabaseAdmin } from "./supabase";
import { db } from "./db";
import { employeeSalaryDiscounts } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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
        ["concluida", "concluída", "cancelada"].includes(so.status) ||
        ["encerrada", "finalizada"].includes(so.mission_status);

      const activeOrders = allOrders.filter((so: any) =>
        so.type === "escolta" &&
        !isConcluded(so) &&
        so.mission_status !== "aguardando"
      );

      const { data: existingBillingIds } = await supabaseAdmin.from("escort_billings").select("service_order_id");
      const billedSet = new Set((existingBillingIds || []).map((b: any) => b.service_order_id));
      const unbilledConcluded = allOrders.filter((so: any) =>
        so.type === "escolta" &&
        isConcluded(so) &&
        !billedSet.has(so.id)
      );

      const liveOrders = [...activeOrders, ...unbilledConcluded];
      if (!liveOrders.length) return;
      log(`CRON Billing: ${activeOrders.length} ativas + ${unbilledConcluded.length} concluídas sem billing para processar`, "cron");

      for (const so of liveOrders) {
        try {
          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, valor_km_extra: 2.40, franquia_minima_km: 50, franquia_km: 50, franquia_horas: 3, valor_hora_estadia: 50, valor_hora_extra: 110, valor_acionamento: 0, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30 };
          if (so.escort_contract_id) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escort_contract_id).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.client_id) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.client_id).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }

          const { data: photos } = await supabaseAdmin.from("mission_photos").select("step, km_value").eq("service_order_id", so.id);
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

          const inicioConsideradoDate = (() => {
            if (!scheduledDate && !missionStartDate) return null;
            if (!scheduledDate) return missionStartDate;
            if (!missionStartDate) return scheduledDate;
            return missionStartDate.getTime() > scheduledDate.getTime() ? missionStartDate : scheduledDate;
          })();
          const inicioConsiderado = inicioConsideradoDate ? toBRT(inicioConsideradoDate) : (scheduledTime || startTime || "00:00");

          let horasMissao = 0;
          if (inicioConsideradoDate) {
            const diffMs = missionEndDate.getTime() - inicioConsideradoDate.getTime();
            horasMissao = diffMs > 0 ? r(diffMs / 3600000) : 0;
          }

          const km_total = kmFinal - kmInicial;
          const km_carregado = Math.max(0, km_total);
          const km_excedente = Math.max(0, km_carregado - (n(contrato.franquia_km) || n(contrato.franquia_minima_km)));

          const hasAcionamento = n(contrato.valor_acionamento) > 0;
          const franquiaKm = n(contrato.franquia_km) || n(contrato.franquia_minima_km);
          const franquiaHoras = n(contrato.franquia_horas);

          const valorKmExtra = n(contrato.valor_km_extra) || n(contrato.valor_km_carregado);
          const valorHoraExtra = n(contrato.valor_hora_extra) || n(contrato.valor_hora_estadia);

          let fat_acionamento = 0, fat_km = 0, fat_hora_extra = 0, fat_total = 0;
          if (hasAcionamento) {
            fat_acionamento = n(contrato.valor_acionamento);
            fat_km = km_excedente * valorKmExtra;
            fat_hora_extra = Math.max(0, horasMissao - franquiaHoras) * valorHoraExtra;
            fat_total = fat_acionamento + fat_km + fat_hora_extra;
          } else {
            fat_km = Math.max(km_carregado, franquiaKm) * n(contrato.valor_km_carregado);
            fat_total = fat_km;
          }

          const isNoturno = (() => {
            const checkH = (t?: string) => { if (!t) return false; const h = parseInt(t.split(":")[0]); return h >= 22 || h < 5; };
            return checkH(inicioConsiderado) || checkH(endTime);
          })();
          if (isNoturno) {
            fat_total += (hasAcionamento ? (fat_acionamento + fat_km) : fat_km) * (n(contrato.adicional_noturno_km_pct) / 100);
          }

          const { data: mCosts } = await supabaseAdmin.from("mission_costs").select("category, amount").eq("service_order_id", so.id);
          let despesas_pedagio = 0, despesas_combustivel = 0, despesas_outras = 0;
          (mCosts || []).forEach((c: any) => {
            if (c.category === "Pedágio") despesas_pedagio += n(c.amount);
            else if (c.category === "Combustível") despesas_combustivel += n(c.amount);
            else despesas_outras += n(c.amount);
          });
          fat_total += despesas_pedagio;

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
            despesas_pedagio: r(despesas_pedagio), despesas_combustivel: r(despesas_combustivel), despesas_outras: r(despesas_outras),
            data_missao: so.mission_started_at || so.scheduled_date || new Date().toISOString(),
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

  log("CRON: Tarefas agendadas - Frota (diário 02:00) | RH (trimestral dia 1 às 03:00) | Rodízio (seg-sex 06:30 e 16:30 BRT) | Billing (a cada 30min) | Provisão Salário (diário 23:59 BRT)", "cron");
}
