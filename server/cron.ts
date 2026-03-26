import cron from "node-cron";
import { storage } from "./storage";
import * as apibrasil from "./apibrasil";
import { log } from "./index";
import { getVehicleCache, sendCommand } from "./truckscontrol";

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

  log("CRON: Tarefas agendadas - Frota (diário 02:00) | RH (trimestral dia 1 às 03:00) | Rodízio (seg-sex 06:30 e 16:30 BRT)", "cron");
}
