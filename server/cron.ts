import cron from "node-cron";
import nodemailer from "nodemailer";
import { storage } from "./storage";
import * as apibrasil from "./apibrasil";
import { log } from "./index";
import { getVehicleCache, sendCommand } from "./truckscontrol";
import { supabaseAdmin } from "./supabase";
import { getHorasElapsedFromDB, calcularFaturamentoLive } from "./billing-calc";
import { getDiretoriaSnapshot } from "./financial-snapshot";
import { countBusinessDays, loadHolidaySet, monthRange } from "./routes/holidays";

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

const META_DIARIA_VIATURA = 1800;
const isActiveVehicle = (v: any) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);

async function checkMetaAndNotify() {
  try {
    const now = new Date();
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const [brYear, brMonth] = brDate.split("-");
    const monthKey = `meta_atingida_${brYear}-${brMonth}`;

    const { data: already } = await supabaseAdmin.from("system_settings").select("id").eq("key", monthKey);
    if (already?.length) return;

    const { data: vehicles } = await supabaseAdmin.from("vehicles").select("*");
    const activeCount = (vehicles || []).filter(isActiveVehicle).length;
    if (activeCount === 0) return;

    const daysInMonth = new Date(Number(brYear), Number(brMonth), 0).getDate();
    const metaMensal = META_DIARIA_VIATURA * activeCount * daysInMonth;

    const monthStart = `${brYear}-${brMonth}-01T00:00:00`;
    const monthEnd = `${brYear}-${brMonth}-${String(daysInMonth).padStart(2, "0")}T23:59:59`;
    const { data: billings } = await supabaseAdmin.from("escort_billings")
      .select("total_value, created_at")
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd);

    const totalFat = (billings || []).reduce((sum: number, b: any) => sum + (Number(b.total_value) || 0), 0);
    if (totalFat < metaMensal) return;

    const pct = ((totalFat / metaMensal) * 100).toFixed(1);
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const transporter = getCronMailTransporter();
    if (!transporter) {
      log(`CRON Meta: Meta atingida (${pct}%) mas SMTP não configurado`, "cron");
      return;
    }

    const monthLabel = new Date(Number(brYear), Number(brMonth) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    await transporter.sendMail({
      from: process.env.SMTP_USER || process.env.EMAIL_USER,
      to: "thiago@grupotmseg.com.br",
      subject: `🎯 Meta Atingida — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#059669;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="margin:0;font-size:24px;">🎯 META ATINGIDA!</h1>
            <p style="margin:5px 0 0;font-size:14px;opacity:0.9;">${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</p>
          </div>
          <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Faturamento Acumulado</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;color:#059669;font-size:18px;">${fmt(totalFat)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Meta do Mês</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;">${fmt(metaMensal)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Atingimento</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;color:#059669;">${pct}%</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#6b7280;">Viaturas Ativas</td>
                <td style="padding:10px 0;font-weight:bold;text-align:right;">${activeCount}</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Torres Vigilância Patrimonial — Sistema de Gestão</p>
          </div>
        </div>
      `,
    });

    await supabaseAdmin.from("system_settings").insert({ key: monthKey, value: `${totalFat}` });
    log(`CRON Meta: ✅ Meta atingida! ${fmt(totalFat)} / ${fmt(metaMensal)} (${pct}%) — e-mail enviado`, "cron");
  } catch (err: any) {
    log(`CRON Meta: Erro ao verificar meta: ${err.message}`, "cron");
  }
}

export function initCronJobs() {
  // ============================================================
    // CRON: Reconciliação de NFs com Asaas — a cada 15 min
    // ============================================================
    cron.schedule("*/15 * * * *", async () => {
      log("CRON NF-Reconcile: Iniciando reconciliação de NFs com Asaas", "cron");
      try {
        const { reconcileAllInvoicesAsaas } = await import("./asaas");
        const result = await reconcileAllInvoicesAsaas({ limit: 80 });
        log(`CRON NF-Reconcile: ${result.processed} processada(s), ${result.updated} atualizada(s), ${result.errors} erro(s)`, "cron");
      } catch (e: any) {
        log(`CRON NF-Reconcile: Erro: ${e.message}`, "cron");
      }
    });

    // ============================================================
    // CRON: Validação TicketLog — re-tenta fuelings pendentes a cada 20 min
    // (TicketLog pode demorar minutos pra processar a transação após o agente
    //  passar o cartão; tentamos novamente até bater)
    // ============================================================
    let ticketLogRunning = false;
    cron.schedule("*/1 * * * *", async () => {
      if (ticketLogRunning) return; // evita sobreposição
      ticketLogRunning = true;
      try {
        const { isTicketLogConfigured, retryPendingValidations } = await import("./ticketlog");
        if (!isTicketLogConfigured()) return;
        const r = await retryPendingValidations(5);
        if (r.tried > 0) log(`CRON TicketLog: ${r.tried} tentativa(s) — ${r.ok} OK, ${r.divergent} divergente, ${r.failed} falhou`, "cron");
      } catch (e: any) {
        log(`CRON TicketLog: Erro: ${e.message}`, "cron");
      } finally {
        ticketLogRunning = false;
      }
    });

    // ============================================================
    // CRON: Control iD — puxa batidas dos aparelhos a cada 1 min (near-realtime)
    // ============================================================
    let controlIdRunning = false;
    cron.schedule("*/1 * * * *", async () => {
      if (controlIdRunning) return; // evita sobreposição
      controlIdRunning = true;
      try {
        const { syncAllDevices } = await import("./control-id");
        const r = await syncAllDevices();
        if (r.devices > 0 && r.totalSaved > 0) {
          log(`CRON ControlID: ${r.devices} aparelho(s), ${r.totalSaved} batida(s) nova(s)`, "cron");
        }
      } catch (e: any) {
        log(`CRON ControlID: Erro: ${e.message}`, "cron");
      } finally {
        controlIdRunning = false;
      }
    });

    // ============================================================
    // CRON: Reconciliação Banco Inter — extrato dos últimos 7 dias
    // a cada 1 min, casa entradas com invoices PENDING
    // ============================================================
    let interReconcileRunning = false;
    cron.schedule("*/1 * * * *", async () => {
      if (interReconcileRunning) return; // evita sobreposição
      interReconcileRunning = true;
      try {
        const { isInterConfigured } = await import("./services/inter/client");
        if (!isInterConfigured()) return; // pula silenciosamente se Inter não configurado
        const { consultarExtrato } = await import("./services/inter/banking");
        const hoje = new Date();
        const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
        const dataInicio = seteDiasAtras.toISOString().slice(0, 10);
        const dataFim = hoje.toISOString().slice(0, 10);

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

          // Buscar TODAS as invoices PENDING/OVERDUE com mesmo valor
          // Se houver MAIS DE UMA, NÃO concilia automaticamente (ambíguo) — deixa para revisão manual
          const { data: candidateInvoices } = await supabaseAdmin
            .from("invoices")
            .select("id, status, due_date, client_name")
            .eq("value", Number(tx.valor || 0).toFixed(2))
            .in("status", ["PENDING", "OVERDUE"])
            .order("due_date", { ascending: true });

          const invoice = (candidateInvoices && candidateInvoices.length === 1)
            ? candidateInvoices[0]
            : null;

          // Auditoria: se múltiplas, registra para o usuário ver
          let ambiguousCount = 0;
          if (candidateInvoices && candidateInvoices.length > 1) {
            ambiguousCount = candidateInvoices.length;
            log(`CRON Inter-Reconcile: AMBIGUO — ${candidateInvoices.length} invoices com valor R$ ${tx.valor} em ${tx.dataEntrada}. Conciliação manual necessária.`, "cron");
          }

          await supabaseAdmin.from("inter_extrato_lancamentos").insert({
            data_entrada: tx.dataEntrada,
            tipo_transacao: tx.tipoTransacao,
            tipo_operacao: tx.tipoOperacao,
            valor: Number(tx.valor || 0).toFixed(2),
            titulo: tx.titulo || null,
            descricao: ambiguousCount > 0
              ? `${tx.descricao || ""} [AMBIGUO: ${ambiguousCount} faturas mesmo valor — conciliar manualmente]`
              : (tx.descricao || null),
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
          log(`CRON Inter-Reconcile: ${novosLancamentos} lançamento(s), ${conciliados} invoice(s) conciliada(s)`, "cron");
        }
      } catch (e: any) {
        log(`CRON Inter-Reconcile: Erro: ${e.message}`, "cron");
      } finally {
        interReconcileRunning = false;
      }
    });

    // ============================================================
    // CRON: Contratos Definitivos (CLT) — verifica diariamente quais
    // experiências assinadas já venceram e gera o contrato definitivo
    // pendente de assinatura. Roda às 03:10 BRT.
    // ============================================================
    cron.schedule("10 3 * * *", async () => {
      try {
        const { syncDuePermanentContracts } = await import("./routes/permanent-contracts");
        const r = await syncDuePermanentContracts();
        if (r.scanned > 0 || r.created > 0) {
          log(`CRON Contrato-Definitivo: scanned=${r.scanned} created=${r.created} errors=${r.errors}`, "cron");
        }
      } catch (e: any) {
        log(`CRON Contrato-Definitivo: Erro: ${e.message}`, "cron");
      }
    }, { timezone: "America/Sao_Paulo" });

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

      await checkMetaAndNotify();
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
          if (!billing.os_number) continue;
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

  // ============================================================
  // CRON: Vencimentos do dia (contas a pagar e a receber)
  // Roda diariamente às 07h BRT
  // Destinatários: adm@grupotmseg.com.br + diretoria@torresseguranca.com.br
  // ============================================================
  cron.schedule("0 7 * * *", async () => {
    try {
      log("CRON Vencimentos: disparando e-mail diário", "cron");
      await sendVencimentosDoDiaEmail();
    } catch (err: any) {
      log(`CRON Vencimentos: erro: ${err.message}`, "cron");
    }
  }, { timezone: "America/Sao_Paulo" });

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

  cron.schedule("0 6,9,12,15,18 * * 1-5", async () => {
    try {
      log("CRON ResumoFinanceiro: Disparando resumo da diretoria (seg-sex 06h/09h/12h/15h/18h BRT)", "cron");
      await sendDailySummaryEmail();
    } catch (err: any) {
      log(`CRON ResumoFinanceiro: Erro: ${err.message}`, "cron");
    }
  }, { timezone: "America/Sao_Paulo" });

  // CRON: Lembrete comprovantes/aprovações pendentes — 09:00 BRT diário
  cron.schedule("0 9 * * *", async () => {
    log("CRON Comprovantes: verificando pendências financeiras", "cron");
    await sendComprovantesPendentesEmail();
  }, { timezone: "America/Sao_Paulo" });

  cron.schedule("0 9 * * 1-5", async () => {
    try {
      log("CRON CobrançaVencidos: Verificando faturas vencidas para envio de lembrete diário", "cron");
      await sendOverdueReminders();
    } catch (err: any) {
      log(`CRON CobrançaVencidos: Erro: ${err.message}`, "cron");
    }
  }, { timezone: "America/Sao_Paulo" });

  // ============================================================
  // CRON: Lembrete Holerites — todo 5º dia útil do mês às 09:00 BRT
  // verifica funcionários ATIVOS sem holerite emitido OU sem assinatura
  // do mês ANTERIOR e notifica a Diretoria por e-mail.
  // ============================================================
  cron.schedule("0 9 * * 1-5", async () => {
    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const [yStr, mStr] = today.split("-");
      const year = Number(yStr); const month = Number(mStr);
      const { from, to } = monthRange(year, month);
      const holidaySet = await loadHolidaySet(from, to);
      // Quantos dias úteis do início do mês até hoje?
      const elapsed = countBusinessDays(from, today, holidaySet);
      if (elapsed !== 5) return; // só dispara exatamente no 5º dia útil
      log(`CRON LembreteHolerite: Hoje é o 5º dia útil — verificando holerites do mês anterior`, "cron");
      await sendPayslipReminderToDiretoria(year, month);
    } catch (err: any) {
      log(`CRON LembreteHolerite: Erro: ${err.message}`, "cron");
    }
  }, { timezone: "America/Sao_Paulo" });

  log("CRON: Tarefas agendadas - Frota (diário 02:00) | RH (trimestral dia 1 às 03:00) | Rodízio (seg-sex 06:30 e 16:30 BRT) | Billing (a cada 30min) | BillingAlerts (diário 03:00 BRT) | Provisão Salário (diário 23:59 BRT) | JornadaAlerta (diário 08:00 BRT) | AceiteExpirado (a cada 30min) | AlertaFrota (diário 07:00) | AlertaDocRH (diário 08:00) | ResumoFinanceiro (seg-sex 06h/09h/12h/15h/18h BRT — diretoria) | CobrançaVencidos (seg-sex 09:00 BRT)", "cron");
}

const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

/**
 * Verifica funcionários ativos sem holerite emitido OU com holerite pendente
 * de assinatura referente ao mês anterior, e envia e-mail à Diretoria.
 * `year`/`month` referem-se ao mês CORRENTE (a verificação é do anterior).
 */
async function sendPayslipReminderToDiretoria(year: number, month: number) {
  // Mês de referência = anterior ao corrente
  let refYear = year, refMonth = month - 1;
  if (refMonth === 0) { refMonth = 12; refYear -= 1; }

  // Funcionários ativos
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, status, matricula")
    .eq("status", "ativo");
  const employees = emps || [];
  if (employees.length === 0) {
    log(`CRON LembreteHolerite: Nenhum funcionário ativo`, "cron");
    return;
  }

  // Holerites do mês de referência
  const { data: psRows } = await supabaseAdmin
    .from("employee_payslips")
    .select("id, employee_id, assinatura_status")
    .eq("year", refYear)
    .eq("month", refMonth);
  const psByEmp = new Map<number, any>();
  for (const r of psRows || []) psByEmp.set(r.employee_id, r);

  const semHolerite: any[] = [];
  const naoAssinados: any[] = [];
  for (const e of employees) {
    const ps = psByEmp.get(e.id);
    if (!ps) semHolerite.push(e);
    else if (ps.assinatura_status !== "assinado") naoAssinados.push({ ...e, payslipId: ps.id });
  }

  if (semHolerite.length === 0 && naoAssinados.length === 0) {
    log(`CRON LembreteHolerite: Tudo em dia para ${MONTHS_PT[refMonth-1]}/${refYear}`, "cron");
    return;
  }

  const transporter = getCronMailTransporter();
  if (!transporter) {
    log(`CRON LembreteHolerite: Pendências encontradas (${semHolerite.length} sem holerite, ${naoAssinados.length} sem assinatura) mas SMTP não configurado`, "cron");
    return;
  }
  const recipients = getDiretoriaRecipients();
  if (recipients.length === 0) {
    log(`CRON LembreteHolerite: Sem destinatários da Diretoria configurados`, "cron");
    return;
  }

  const monthLabel = `${MONTHS_PT[refMonth-1]}/${refYear}`;
  const row = (e: any) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${e.matricula || "—"}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${e.name}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b;">${e.role || "—"}</td></tr>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;">
      <div style="background:#1e293b;color:#fff;padding:18px;border-radius:10px 10px 0 0;">
        <h1 style="margin:0;font-size:20px;">Lembrete — Holerites ${monthLabel}</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">Hoje é o 5º dia útil. Pendências detectadas:</p>
      </div>
      <div style="background:#f9fafb;padding:18px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;">
        ${semHolerite.length > 0 ? `
          <h2 style="margin:0 0 8px;color:#b91c1c;font-size:15px;">Sem holerite emitido (${semHolerite.length})</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
            <thead><tr style="background:#fef2f2;"><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Matrícula</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Funcionário</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Cargo</th></tr></thead>
            <tbody>${semHolerite.map(row).join("")}</tbody>
          </table>
        ` : ""}
        ${naoAssinados.length > 0 ? `
          <h2 style="margin:0 0 8px;color:#a16207;font-size:15px;">Holerite emitido mas pendente de assinatura (${naoAssinados.length})</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
            <thead><tr style="background:#fef3c7;"><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Matrícula</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Funcionário</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Cargo</th></tr></thead>
            <tbody>${naoAssinados.map(row).join("")}</tbody>
          </table>
        ` : ""}
        <p style="margin-top:16px;font-size:11px;color:#64748b;">Lembrete automático disparado pelo sistema às 09:00 BRT do 5º dia útil. Acesse Gestão de Holerites para emitir/conferir.</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: process.env.SMTP_USER || process.env.EMAIL_USER,
    to: recipients.join(","),
    bcc: process.env.SMTP_BCC ? process.env.SMTP_BCC.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : undefined,
    subject: `Lembrete — Holerites ${monthLabel}: ${semHolerite.length + naoAssinados.length} pendência(s)`,
    html,
  });
  log(`CRON LembreteHolerite: E-mail enviado — ${semHolerite.length} sem holerite, ${naoAssinados.length} sem assinatura (ref. ${monthLabel})`, "cron");
}

// ============================================================
// CRON: Lembrete diário 09:00 BRT — comprovantes de pagamento faltando
// + lançamentos AGUARDANDO_APROVACAO há mais de 1 dia
// ============================================================
async function sendComprovantesPendentesEmail() {
  try {
    const MISSION_CATEGORIES = ["CUSTOS DE MISSÃO", "COMBUSTÍVEL", "CUSTOS DE MISSAO", "COMBUSTIVEL"];
    const { data: pagosSemCompRaw } = await supabaseAdmin
      .from("financial_transactions")
      .select("id, description, amount, payment_date, entity_name, created_by, solicitado_por, category_name, origin_type")
      .eq("type", "EXPENSE")
      .eq("status", "PAID")
      .is("comprovante_url", null)
      .or("origin_type.is.null,origin_type.eq.manual")
      .order("payment_date", { ascending: true })
      .limit(200);
    const pagosSemComp = (pagosSemCompRaw || []).filter((t: any) =>
      !MISSION_CATEGORIES.includes(String(t.category_name || "").toUpperCase())
    );

    // Aguardando aprovação há MAIS DE 1 DIA (criados antes de "agora - 24h" em BRT).
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: aguardando } = await supabaseAdmin
      .from("financial_transactions")
      .select("id, description, amount, due_date, entity_name, solicitado_por, created_at")
      .eq("status", "AGUARDANDO_APROVACAO")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(200);

    const semComp = (pagosSemComp || []);
    const pendApro = (aguardando || []);

    if (semComp.length === 0 && pendApro.length === 0) return;

    const transporter = getCronMailTransporter();
    if (!transporter) {
      log(`CRON Comprovantes: ${semComp.length} pendentes / ${pendApro.length} aguardando — SMTP não configurado`, "cron");
      return;
    }
    const recipients = await getAprovacaoRecipients();
    if (recipients.length === 0) return;

    const fmtMoney = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
    const totalSemComp = semComp.reduce((s, t: any) => s + Number(t.amount || 0), 0);
    const totalAprov = pendApro.reduce((s, t: any) => s + Number(t.amount || 0), 0);

    const rowsSem = semComp.slice(0, 50).map((t: any) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${fmtDate(t.payment_date)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.description || "").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.entity_name || "—").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fmtMoney(Number(t.amount))}</td></tr>`
    ).join("");

    const rowsApro = pendApro.slice(0, 50).map((t: any) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${fmtDate(t.due_date)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.description || "").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.entity_name || "—").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.solicitado_por || "—")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fmtMoney(Number(t.amount))}</td></tr>`
    ).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#111;">
        <h2 style="margin:0 0 4px;">Lembrete Financeiro — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</h2>
        <p style="margin:0 0 16px;color:#555;font-size:13px;">Torres Vigilância Patrimonial — Pendências de Contas a Pagar</p>

        ${pendApro.length > 0 ? `
        <h3 style="background:#fde68a;color:#92400e;padding:8px 12px;border-radius:6px;margin:16px 0 8px;">Aguardando Aprovação Diretoria — ${pendApro.length} (${fmtMoney(totalAprov)})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Vencimento</th><th style="padding:6px 8px;text-align:left;">Descrição</th><th style="padding:6px 8px;text-align:left;">Favorecido</th><th style="padding:6px 8px;text-align:left;">Solicitante</th><th style="padding:6px 8px;text-align:right;">Valor</th></tr></thead>
          <tbody>${rowsApro}</tbody>
        </table>` : ""}

        ${semComp.length > 0 ? `
        <h3 style="background:#fecaca;color:#991b1b;padding:8px 12px;border-radius:6px;margin:24px 0 8px;">Pagamentos Sem Comprovante Anexado — ${semComp.length} (${fmtMoney(totalSemComp)})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Pagamento</th><th style="padding:6px 8px;text-align:left;">Descrição</th><th style="padding:6px 8px;text-align:left;">Favorecido</th><th style="padding:6px 8px;text-align:right;">Valor</th></tr></thead>
          <tbody>${rowsSem}</tbody>
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:#666;">Anexe o comprovante em <strong>Financeiro &rarr; Contas a Pagar</strong>.</p>` : ""}

        <p style="margin:24px 0 0;font-size:10px;color:#999;text-align:center;">E-mail automático — Sistema de Gestão Torres</p>
      </div>`;

    const extraBcc = process.env.SMTP_BCC ? process.env.SMTP_BCC.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;
    await transporter.sendMail({
      from: fromAddr,
      to: fromAddr,
      bcc: Array.from(new Set([...recipients, ...extraBcc])),
      subject: `Financeiro — ${pendApro.length} aguardando aprovação · ${semComp.length} sem comprovante`,
      html,
    });
    log(`CRON Comprovantes: e-mail enviado — ${pendApro.length} aprovação · ${semComp.length} sem comprovante`, "cron");
  } catch (e: any) {
    log(`CRON Comprovantes: erro: ${e.message}`, "cron");
  }
}

export { sendVencimentosDoDiaEmail } from "./email-vencimentos";

// (implementação extraída para ./email-vencimentos.ts pra permitir testes
// isolados sem subir o servidor inteiro). O bloco abaixo é mantido apenas
// como referência morta — não é exportado.
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

const DIRETORIA_EMAIL_DEFAULT = "diretoria@torresseguranca.com.br";
function getDiretoriaRecipients(): string[] {
  const raw = process.env.DIRETORIA_EMAIL || DIRETORIA_EMAIL_DEFAULT;
  return raw.split(/[,;]+/).map(s => s.trim()).filter(s => /.+@.+\..+/.test(s));
}

// Resolve destinatários do fluxo de aprovação: Simone (admin) + Mickael (diretoria)
// via tabela users; faz fallback para getDiretoriaRecipients() se nada encontrado.
async function getAprovacaoRecipients(): Promise<string[]> {
  // Destinatários OBRIGATÓRIOS (Simone administrativa + Mickael diretoria).
  // Podem ser sobrescritos por env APROVACAO_EMAILS=email1,email2.
  const REQUIRED = (process.env.APROVACAO_EMAILS_REQUIRED ||
    "simone@torresseguranca.com.br,mickael@torresseguranca.com.br")
    .split(",").map(s => s.trim()).filter(e => /.+@.+\..+/.test(e));
  const collected = new Set<string>(REQUIRED);
  try {
    const { data } = await supabaseAdmin
      .from("users")
      .select("name, email, role")
      .or("role.eq.diretoria,name.ilike.%simone%,name.ilike.%mickael%");
    for (const u of (data || [])) {
      const e = String((u as any)?.email || "").trim();
      if (/.+@.+\..+/.test(e)) collected.add(e);
    }
  } catch (e) { /* mantém apenas os obrigatórios */ }
  return Array.from(collected);
}


function fmtBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBRTDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pctBarColor(pct: number): string {
  if (pct >= 100) return "#16a34a";
  if (pct >= 70) return "#2563eb";
  if (pct >= 40) return "#a16207";
  return "#dc2626";
}

function statusBadgeHtml(status: string): string {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    em_andamento: { bg: "#dbeafe", color: "#1d4ed8", label: "Em Andamento" },
    concluida: { bg: "#dcfce7", color: "#15803d", label: "Concluída" },
    "concluída": { bg: "#dcfce7", color: "#15803d", label: "Concluída" },
    agendada: { bg: "#fef3c7", color: "#a16207", label: "Agendada" },
    aberta: { bg: "#e0e7ff", color: "#4338ca", label: "Aberta" },
    cancelada: { bg: "#fee2e2", color: "#b91c1c", label: "Cancelada" },
    recusada: { bg: "#fee2e2", color: "#b91c1c", label: "Recusada" },
  };
  const s = map[status] || { bg: "#f1f5f9", color: "#475569", label: status };
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;">${s.label}</span>`;
}

function metaBlockHtml(label: string, periodo: string, fat: number, meta: number, pct: number): string {
  const color = pctBarColor(pct);
  const barPct = Math.max(2, Math.min(100, pct));
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${label}</td>
          <td style="text-align:right;font-size:12px;color:#64748b;">${periodo}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:6px;">
            <span style="font-size:18px;font-weight:700;color:#1e293b;">R$ ${fmtBR(fat)}</span>
            <span style="font-size:12px;color:#64748b;"> / R$ ${fmtBR(meta)}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:8px;">
            <div style="background:#f1f5f9;border-radius:6px;height:8px;overflow:hidden;">
              <div style="background:${color};height:8px;width:${barPct}%;"></div>
            </div>
            <div style="text-align:right;font-size:12px;font-weight:700;color:${color};margin-top:4px;">${pct.toFixed(1)}% da meta</div>
          </td>
        </tr>
      </table>
    </div>`;
}

export async function sendDailySummaryEmail(targetDate?: string): Promise<{ success: boolean; message: string }> {
  const transporter = getCronMailTransporter();
  if (!transporter) {
    return { success: false, message: "SMTP não configurado" };
  }

  try {
    const snap = await getDiretoriaSnapshot(targetDate);

    const osCards = snap.ordens.slice(0, 30).map(o => {
      const fatDisplay = o.isLive ? `R$ ${fmtBR(o.fatLive)} <span style="font-size:10px;color:#2563eb;font-weight:600;">(ao vivo)</span>` : `R$ ${fmtBR(o.fat)}`;
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr><td style="padding:10px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;font-weight:700;color:#1e293b;">${o.osNumber}</td>
              <td style="text-align:right;">${statusBadgeHtml(o.status)}</td>
            </tr>
            <tr><td colspan="2" style="padding-top:6px;font-size:13px;color:#475569;line-height:1.35;">${o.clientName}</td></tr>
            <tr>
              <td style="padding-top:8px;font-size:12px;color:#64748b;">Faturamento<br><span style="font-size:14px;font-weight:700;color:#16a34a;">${fatDisplay}</span></td>
              <td style="padding-top:8px;text-align:right;font-size:12px;color:#64748b;">Custo<br><span style="font-size:14px;font-weight:700;color:#dc2626;">R$ ${fmtBR(o.custo)}</span></td>
            </tr>
          </table>
        </td></tr>
      </table>`;
    }).join("");

    const margemColor = snap.dia.margem >= 30 ? "#16a34a" : snap.dia.margem >= 15 ? "#ca8a04" : "#dc2626";

    const asaasHtml = snap.asaas.connected
      ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#047857;font-weight:600;">Saldo Total — Asaas</div>
          <div style="font-size:24px;font-weight:700;color:#059669;margin-top:4px;">R$ ${fmtBR(Number(snap.asaas.balance) || 0)}</div>
          <div style="font-size:11px;color:#047857;margin-top:6px;line-height:1.5;">
            Saldo atual: <strong>R$ ${fmtBR(Number(snap.asaas.saldoAtual) || 0)}</strong>
            &nbsp;·&nbsp; A receber: <strong>R$ ${fmtBR(Number(snap.asaas.saldoAReceber) || 0)}</strong>
          </div>
        </div>`
      : `<div style="background:#fef3c7;border:1px solid #fde68a;border-left:4px solid #ca8a04;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#92400e;font-weight:600;">Saldo Asaas</div>
          <div style="font-size:13px;color:#92400e;margin-top:4px;">${snap.asaas.message || "Indisponível"}</div>
        </div>`;

    const fmtPeriodo = (a: string, b: string) => {
      const f = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      return `${f(a)} → ${f(b)}`;
    };

    const fatLiveBadge = snap.dia.fatExtraLive > 0
      ? `<div style="font-size:11px;color:#2563eb;margin-top:4px;font-weight:600;">+ R$ ${fmtBR(snap.dia.fatExtraLive)} ao vivo (HE em andamento)</div>`
      : "";

    const gastosCatRows = snap.gastosMes.porCategoria.slice(0, 8).map(g => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;">${g.categoria}</td>
        <td style="padding:8px 0;font-size:13px;font-weight:700;text-align:right;color:#dc2626;border-bottom:1px solid #f1f5f9;white-space:nowrap;">R$ ${fmtBR(g.valor)}</td>
        <td style="padding:8px 0 8px 8px;font-size:11px;color:#64748b;text-align:right;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${g.pct.toFixed(1)}%</td>
      </tr>`).join("");

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px){
      .container{width:100% !important;border-radius:0 !important;}
      .pad{padding:16px !important;}
      .kpi-cell{display:block !important;width:100% !important;margin-bottom:10px !important;}
      .kpi-value{font-size:26px !important;}
      .hero-title{font-size:20px !important;}
    }
  </style>
</head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f3f4f6;margin:0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:12px 0;">
    <tr><td align="center">
      <table role="presentation" class="container" width="650" cellpadding="0" cellspacing="0" style="max-width:650px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr><td class="pad" style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 30px;color:#fff;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:0.7;">Torres Vigilância Patrimonial</div>
          <div class="hero-title" style="font-size:24px;font-weight:700;margin-top:4px;">Resumo Financeiro — Diretoria</div>
          <div style="font-size:14px;opacity:0.85;margin-top:4px;">${snap.diaSemana}, ${snap.dataLabel}</div>
          <div style="font-size:11px;opacity:0.6;margin-top:6px;">Gerado em ${fmtBRTDateTime(snap.generatedAt)} (BRT)</div>
        </td></tr>

        <tr><td class="pad" style="padding:20px 24px;">

          ${asaasHtml}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td class="kpi-cell" valign="top" width="33%" style="padding-right:6px;">
                <div style="background:#f0fdf4;border-radius:8px;padding:14px;border-left:4px solid #16a34a;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Faturamento Hoje</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:#16a34a;margin-top:4px;">R$ ${fmtBR(snap.dia.fatLive)}</div>
                  ${fatLiveBadge}
                </div>
              </td>
              <td class="kpi-cell" valign="top" width="33%" style="padding:0 3px;">
                <div style="background:#fef2f2;border-radius:8px;padding:14px;border-left:4px solid #dc2626;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Custos Hoje</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:#dc2626;margin-top:4px;">R$ ${fmtBR(snap.dia.custoTotal)}</div>
                </div>
              </td>
              <td class="kpi-cell" valign="top" width="33%" style="padding-left:6px;">
                <div style="background:#eff6ff;border-radius:8px;padding:14px;border-left:4px solid #2563eb;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Resultado</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:${snap.dia.resultado >= 0 ? "#2563eb" : "#dc2626"};margin-top:4px;">R$ ${fmtBR(snap.dia.resultado)}</div>
                </div>
              </td>
            </tr>
          </table>

          <div style="font-size:14px;font-weight:700;color:#1e293b;margin:8px 0 10px;text-transform:uppercase;letter-spacing:0.5px;">Faturamento × Meta</div>
          ${metaBlockHtml("Hoje", snap.dataLabel, snap.dia.fatLive, snap.meta.diaria, snap.dia.pctMeta)}
          ${metaBlockHtml("Semana", fmtPeriodo(snap.semana.inicio, snap.semana.fim), snap.semana.fat, snap.semana.meta, snap.semana.pct)}
          ${metaBlockHtml("Mês", fmtPeriodo(snap.mes.inicio, snap.mes.fim), snap.mes.fat, snap.mes.meta, snap.mes.pct)}
          <div style="font-size:11px;color:#64748b;margin:-4px 0 16px;">Meta: R$ ${fmtBR(snap.meta.diariaPorViatura)} por viatura/dia × ${snap.meta.viaturasAtivas} ativa(s)</div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Margem de Lucro</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:${margemColor};">${fmtBR(snap.dia.margem)}%</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">KM Total Rodados</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">${fmtBR(snap.dia.kmTotal)} km</td>
            </tr>
            ${snap.dia.despPedagio > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Pedágio (Escoltas)</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR(snap.dia.despPedagio)}</td>
            </tr>` : ""}
            ${snap.dia.despCombustivel > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Combustível (Escoltas)</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR(snap.dia.despCombustivel)}</td>
            </tr>` : ""}
            ${snap.dia.receitasAvulsas > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Receitas Avulsas</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#16a34a;">R$ ${fmtBR(snap.dia.receitasAvulsas)}</td>
            </tr>` : ""}
            ${snap.dia.despesasAvulsas > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Despesas Avulsas</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR(snap.dia.despesasAvulsas)}</td>
            </tr>` : ""}
          </table>

          <div style="background:${snap.analiseCustoKm.status.bg};border-radius:8px;padding:14px 16px;margin-bottom:20px;border-left:4px solid ${snap.analiseCustoKm.status.color};">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;font-weight:600;">Análise de Custo por KM</div>
            <div style="font-size:16px;font-weight:700;color:${snap.analiseCustoKm.status.color};margin-top:4px;">${snap.analiseCustoKm.status.label}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
              <tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Hoje (custo/km)</td><td style="font-size:13px;font-weight:700;text-align:right;color:#1e293b;padding:4px 0;">R$ ${fmtBR(snap.analiseCustoKm.custoPorKmHoje)}/km</td></tr>
              <tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Média 30 dias</td><td style="font-size:13px;font-weight:700;text-align:right;color:#1e293b;padding:4px 0;">R$ ${fmtBR(snap.analiseCustoKm.custoPorKmHist)}/km</td></tr>
              ${snap.analiseCustoKm.custoPorKmHist > 0 && snap.analiseCustoKm.custoPorKmHoje > 0 ? `<tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Variação</td><td style="font-size:13px;font-weight:700;text-align:right;color:${snap.analiseCustoKm.status.color};padding:4px 0;">${snap.analiseCustoKm.variacaoPct >= 0 ? "+" : ""}${snap.analiseCustoKm.variacaoPct.toFixed(1)}%</td></tr>` : ""}
            </table>
            <div style="font-size:12px;color:#475569;margin-top:8px;line-height:1.4;">${snap.analiseCustoKm.status.msg}</div>
          </div>

          ${snap.gastosMes.total > 0 ? `
          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
              <div style="font-size:14px;font-weight:700;color:#334155;">Gastos do Mês por Categoria</div>
              <div style="font-size:13px;font-weight:700;color:#dc2626;">R$ ${fmtBR(snap.gastosMes.total)}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              ${gastosCatRows}
            </table>
          </div>
          ` : ""}

          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:#334155;">Operações do Dia</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Total de OS</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.totalOS}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Escoltas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.escoltas}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Concluídas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#16a34a;">${snap.ops.concluidas}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Em Andamento</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#2563eb;">${snap.ops.emAndamento}</td></tr>
              ${snap.ops.canceladas > 0 ? `<tr><td style="padding:6px 0;font-size:13px;color:#666;">Canceladas/Recusadas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#dc2626;">${snap.ops.canceladas}</td></tr>` : ""}
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Efetivo Ativo</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.agentesAtivos} agentes</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Viaturas Ativas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.meta.viaturasAtivas}</td></tr>
            </table>
          </div>

          ${snap.ordens.length > 0 ? `
          <div style="margin-bottom:20px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px;color:#334155;">Detalhamento por OS</div>
            ${osCards}
          </div>
          ` : ""}

        </td></tr>

        <tr><td class="pad" style="background:#f8fafc;padding:16px 24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
          Torres Vigilância Patrimonial — CNPJ 36.982.392/0001-89
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const from = `"Torres Vigilância - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;

    const recipients = getDiretoriaRecipients();
    if (recipients.length === 0) {
      const msg = "Nenhum destinatário válido configurado (defina DIRETORIA_EMAIL com lista separada por vírgula)";
      log(`CRON ResumoDiario: ${msg}`, "cron");
      return { success: false, message: msg };
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: recipients.join(", "),
        subject: `📊 Resumo Diretoria — ${snap.dataLabel} | Fat. R$ ${fmtBR(snap.dia.fatLive)} | Resultado R$ ${fmtBR(snap.dia.resultado)}`,
        html,
      });
      log(`CRON ResumoDiario: E-mail enviado para [${recipients.join(", ")}] (msgId=${info.messageId}, accepted=${(info.accepted||[]).length}, rejected=${(info.rejected||[]).length}) — Fat. R$ ${fmtBR(snap.dia.fatLive)} | Resultado R$ ${fmtBR(snap.dia.resultado)}`, "cron");
      return { success: true, message: `E-mail enviado para ${recipients.join(", ")}` };
    } catch (sendErr: any) {
      log(`CRON ResumoDiario: Falha SMTP ao enviar para [${recipients.join(", ")}]: ${sendErr.message} (code=${sendErr.code || "?"}, response=${sendErr.response || "?"})`, "cron");
      return { success: false, message: `Falha SMTP: ${sendErr.message}` };
    }
  } catch (err: any) {
    log(`CRON ResumoDiario: Erro: ${err.message}`, "cron");
    return { success: false, message: err.message };
  }
}

async function sendOverdueReminders() {
  const transporter = getCronMailTransporter();
  if (!transporter) {
    log("CRON CobrançaVencidos: SMTP não configurado — lembretes não enviados", "cron");
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: overdueInvoices, error } = await supabaseAdmin
    .from("invoices")
    .select("id, client_id, client_name, client_cpf_cnpj, value, due_date, description, invoice_url, bank_slip_url, pix_copia_e_cola, billing_type, status, nfse_status, reminder_count, last_reminder_sent_at")
    .lt("due_date", today)
    .not("status", "in", '("RECEIVED","CONFIRMED","RECEIVED_IN_CASH","CANCELLED","CANCELED")');

  if (error) {
    log(`CRON CobrançaVencidos: Erro ao buscar faturas vencidas: ${error.message}`, "cron");
    return;
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    log("CRON CobrançaVencidos: Nenhuma fatura vencida encontrada", "cron");
    return;
  }

  const validOverdue = overdueInvoices.filter((inv: any) => {
    const nfStatus = String(inv.nfse_status || "").toUpperCase();
    if (nfStatus.includes("CANCEL")) return false;
    const lastSent = inv.last_reminder_sent_at ? new Date(inv.last_reminder_sent_at).toISOString().split("T")[0] : null;
    if (lastSent === today) return false;
    return true;
  });

  if (validOverdue.length === 0) {
    log("CRON CobrançaVencidos: Todas as faturas vencidas já receberam lembrete hoje", "cron");
    return;
  }

  let sent = 0;
  let skipped = 0;

  for (const inv of validOverdue) {
    try {
      const { data: clientData } = await supabaseAdmin
        .from("clients")
        .select("email, email_financeiro, name")
        .eq("id", inv.client_id)
        .single();

      const clientEmail = clientData?.email_financeiro || clientData?.email;
      if (!clientEmail) {
        log(`CRON CobrançaVencidos: Fatura #${inv.id} (${inv.client_name}) — cliente sem e-mail cadastrado`, "cron");
        skipped++;
        continue;
      }

      const dueDate = new Date(inv.due_date + "T12:00:00");
      const todayDate = new Date(today + "T12:00:00");
      const diffMs = todayDate.getTime() - dueDate.getTime();
      const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const dueDateFmt = dueDate.toLocaleDateString("pt-BR");
      const valueFmt = Number(inv.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const reminderNum = (inv.reminder_count || 0) + 1;

      const links: string[] = [];
      if (inv.invoice_url) {
        links.push(`<a href="${inv.invoice_url}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">📄 VER FATURA</a>`);
      }
      if (inv.bank_slip_url) {
        links.push(`<a href="${inv.bank_slip_url}" style="display:inline-block;background:#0066cc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">🏦 BOLETO BANCÁRIO</a>`);
      }

      let pixSection = "";
      if (inv.pix_copia_e_cola) {
        pixSection = `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="font-size:13px;font-weight:bold;color:#166534;margin:0 0 8px;">Pagamento via PIX</p>
          <p style="font-size:11px;color:#15803d;margin:0 0 8px;">Copie o código abaixo e cole no app do seu banco:</p>
          <div style="background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:10px;word-break:break-all;font-family:monospace;font-size:11px;color:#374151;">
            ${inv.pix_copia_e_cola}
          </div>
        </div>`;
      }

      const urgencyColor = diasAtraso > 15 ? "#dc2626" : diasAtraso > 7 ? "#ea580c" : "#d97706";
      const urgencyLabel = diasAtraso > 15 ? "URGENTE" : diasAtraso > 7 ? "IMPORTANTE" : "LEMBRETE";

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">Torres Vigilância Patrimonial</h1>
    <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Cobrança — ${urgencyLabel}</p>
  </div>
  <div style="background:${urgencyColor};padding:12px 24px;text-align:center;">
    <p style="color:#fff;font-size:14px;font-weight:bold;margin:0;">⚠️ Fatura vencida há ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px;">
      Prezado(a) <strong>${clientData?.name || inv.client_name}</strong>,
    </p>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 16px;">
      Identificamos que a fatura abaixo encontra-se <strong style="color:${urgencyColor};">vencida há ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}</strong>. 
      Solicitamos a gentileza de providenciar o pagamento o mais breve possível para evitar encargos adicionais.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:0 0 20px;">
      <table style="width:100%;font-size:13px;color:#333;">
        <tr><td style="padding:4px 0;color:#666;">Descrição:</td><td style="padding:4px 0;font-weight:bold;text-align:right;">${inv.description || "Serviço de Escolta Armada"}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Valor:</td><td style="padding:4px 0;font-weight:bold;font-size:16px;color:#dc2626;text-align:right;">${valueFmt}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Vencimento:</td><td style="padding:4px 0;font-weight:bold;color:#dc2626;text-align:right;">${dueDateFmt}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Dias em atraso:</td><td style="padding:4px 0;font-weight:bold;color:${urgencyColor};text-align:right;">${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Lembrete nº:</td><td style="padding:4px 0;text-align:right;">${reminderNum}</td></tr>
      </table>
    </div>
    ${links.length > 0 ? `<div style="text-align:center;margin:20px 0;">${links.join("\n")}</div>` : ""}
    ${pixSection}
    <p style="font-size:12px;color:#666;line-height:1.5;margin:20px 0 0;">
      Caso o pagamento já tenha sido efetuado, por favor desconsidere este aviso e nos envie o comprovante para registro.
    </p>
    <p style="font-size:12px;color:#888;line-height:1.5;margin:12px 0 0;">
      Em caso de dúvidas, entre em contato conosco pelo e-mail 
      <a href="mailto:financeiro@torresseguranca.com.br" style="color:#1a1a2e;">financeiro@torresseguranca.com.br</a> 
      ou pelo telefone (11) 96369-6699.
    </p>
  </div>
  <div style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #eee;">
    <p style="color:#888;font-size:11px;margin:2px 0;"><strong>Torres Vigilância Patrimonial</strong></p>
    <p style="color:#999;font-size:10px;margin:2px 0;">CNPJ 36.982.392/0001-89</p>
    <p style="color:#999;font-size:10px;margin:2px 0;">📞 (11) 96369-6699 | ✉️ financeiro@torresseguranca.com.br</p>
  </div>
</div>
</body></html>`;

      const from = `"Torres Vigilância - Financeiro" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;

      await transporter.sendMail({
        from,
        to: clientEmail,
        bcc: ["thiago@grupotmseg.com.br", "financeiro@torresseguranca.com.br"],
        subject: `⚠️ ${urgencyLabel}: Fatura vencida há ${diasAtraso} dias — ${valueFmt} — Torres Segurança`,
        html,
      });

      await supabaseAdmin.from("invoices").update({
        last_reminder_sent_at: new Date().toISOString(),
        reminder_count: reminderNum,
      }).eq("id", inv.id);

      log(`CRON CobrançaVencidos: ✓ Lembrete #${reminderNum} enviado — Fatura #${inv.id} (${inv.client_name}) ${valueFmt} vencida há ${diasAtraso}d → ${clientEmail}`, "cron");
      sent++;

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err: any) {
      log(`CRON CobrançaVencidos: ✗ Erro fatura #${inv.id}: ${err.message}`, "cron");
    }
  }

  log(`CRON CobrançaVencidos: Concluído — ${sent} lembrete(s) enviado(s), ${skipped} sem e-mail`, "cron");

  if (sent > 0) {
    await supabaseAdmin.from("audit_logs").insert({
      user_name: "SISTEMA", user_role: "system",
      action: "CRON_COBRANCA_VENCIDOS",
      details: `${sent} lembrete(s) de cobrança enviado(s) para faturas vencidas. ${skipped} sem e-mail.`,
    });
  }
}
