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

      const allOrders = await storage.getServiceOrders();
      const activeOrders = allOrders.filter((so: any) => so.status !== "concluida" && so.missionStatus !== "encerrada" && so.missionStatus !== "aguardando" && so.type === "escolta");

      const { data: existingBillingIds } = await supabaseAdmin.from("escort_billings").select("service_order_id");
      const billedSet = new Set((existingBillingIds || []).map((b: any) => b.service_order_id));
      const missingBillingOrders = allOrders.filter((so: any) =>
        so.type === "escolta" &&
        (so.status === "em_andamento" || so.status === "concluida") &&
        so.missionStatus !== "aguardando" &&
        !billedSet.has(so.id) &&
        !activeOrders.some((a: any) => a.id === so.id)
      );

      const liveOrders = [...activeOrders, ...missingBillingOrders];
      if (!liveOrders.length) return;
      log(`CRON Billing: ${liveOrders.length} OS em andamento para recalcular`, "cron");

      for (const so of liveOrders) {
        try {
          await supabaseAdmin.from("escort_billings").delete().eq("service_order_id", so.id);

          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }

          const photos = await storage.getMissionPhotosByOS(so.id);
          const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
          const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
          const kmInicial = kmSaidaPhoto?.kmValue || 0;
          const kmFinalRaw = kmFinalPhoto?.kmValue || 0;
          const kmFinal = kmFinalRaw > kmInicial ? kmFinalRaw : kmInicial;

          const scheduledTime = so.scheduledDate ? toBRT(new Date(so.scheduledDate)) : undefined;
          const startTime = so.missionStartedAt ? toBRT(new Date(so.missionStartedAt as string)) : undefined;
          const endTime = toBRT(new Date());

          const hasAcionamento = n(contrato.valor_acionamento) > 0;
          const franquiaKm = n(contrato.franquia_km) || n(contrato.franquia_minima_km);
          const franquiaHoras = n(contrato.franquia_horas);
          const valorKmExtra = n(contrato.valor_km_extra) || n(contrato.valor_km_carregado);
          const valorHoraExtra = n(contrato.valor_hora_extra) || n(contrato.valor_hora_estadia);
          const valorAcionamento = n(contrato.valor_acionamento);
          const valorKmCarregado = n(contrato.valor_km_carregado);
          const valorKmVazio = n(contrato.valor_km_vazio);

          const calcInicioCobranca = (agendado?: string, chegada?: string) => {
            if (!agendado && !chegada) return "00:00";
            if (!agendado) return chegada!;
            if (!chegada) return agendado;
            const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
            return toMin(chegada) <= toMin(agendado) ? agendado : chegada;
          };

          const inicioConsiderado = calcInicioCobranca(scheduledTime, startTime);
          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
          let diffMin = toMin(endTime) - toMin(inicioConsiderado);
          if (diffMin < 0) diffMin += 24 * 60;
          const horasMissao = Math.round((diffMin / 60) * 100) / 100;

          const km_total = kmFinal - kmInicial;
          const km_carregado = Math.max(0, km_total);
          const km_excedente = Math.max(0, km_carregado - franquiaKm);

          let fat_total = 0;
          let fat_km = 0;
          let fat_acionamento = 0;
          let fat_hora_extra = 0;
          if (hasAcionamento) {
            fat_acionamento = valorAcionamento;
            fat_km = km_excedente * valorKmExtra;
            const horasExcedentes = Math.max(0, horasMissao - franquiaHoras);
            fat_hora_extra = horasExcedentes * valorHoraExtra;
            fat_total = fat_acionamento + fat_km + fat_hora_extra;
          } else {
            const km_faturado = Math.max(km_carregado, franquiaKm);
            fat_km = km_faturado * valorKmCarregado;
            fat_total = fat_km;
          }

          const isNoturno = (() => {
            const checkH = (t?: string) => { if (!t) return false; const h = parseInt(t.split(":")[0]); return h >= 22 || h < 5; };
            return checkH(inicioConsiderado) || checkH(endTime);
          })();
          if (isNoturno) {
            fat_total += (hasAcionamento ? (valorAcionamento + fat_km) : fat_km) * (n(contrato.adicional_noturno_km_pct) / 100);
          }

          const pag_vrp = n(contrato.vrp_base);
          const pag_total = pag_vrp;
          const resultado_bruto = fat_total - pag_total;
          const resultado_liquido = resultado_bruto;

          const client = so.clientId ? await storage.getClient(so.clientId) : null;
          const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
          const emp2 = so.assignedEmployee2Id ? await storage.getEmployee(so.assignedEmployee2Id) : null;
          const r = (v: number) => Math.round(v * 100) / 100;

          const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;

          await supabaseAdmin.from("escort_billings").insert({
            service_order_id: so.id,
            client_id: so.clientId, client_name: client?.name || "--",
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
            valor_franquia: hasAcionamento ? r(valorAcionamento) : r(Math.min(km_carregado, franquiaKm) * valorKmCarregado),
            valor_km_extra: r(km_excedente * (hasAcionamento ? valorKmExtra : valorKmCarregado)),
            pag_vrp: r(pag_vrp), pag_total: r(pag_total),
            resultado_bruto: r(resultado_bruto), resultado_liquido: r(resultado_liquido),
            margem_percentual: fat_total > 0 ? r((resultado_liquido / fat_total) * 100) : 0,
            vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || "--",
            vigilante2_id: so.assignedEmployee2Id || null, vigilante2_name: emp2?.name || null,
            origem: so.origin || null, destino: so.destination || null,
            placa_viatura: vehicle?.plate || null,
            data_missao: so.scheduledDate || new Date().toISOString(),
            status: "A_VERIFICAR", created_by: "CRON",
          });

          log(`CRON Billing: OS ${so.osNumber} recalculada - ${r(horasMissao)}h, ${n(km_total)}km, fat=${r(fat_total)}`, "cron");
        } catch (err: any) {
          log(`CRON Billing: Erro OS ${so.osNumber}: ${err.message}`, "cron");
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
