import { supabaseAdmin } from "./supabase";
import { storage } from "./storage";
import { getAsaasBalance } from "./asaas";
import { calcularFaturamentoLive, calcHorasElapsedLocal, extractKmFromText, haversineDistanceKm } from "./billing-calc";

const META_DIARIA_VIATURA = 1800;
const isActiveVehicle = (v: any) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);
const AUTO_ORIGINS = new Set(["mission_cost", "payroll", "fueling", "escort_billing"]);

const isCancelledStatus = (s: any) => s === "recusada" || s === "cancelada";

function brtToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function ymdAddDays(ymd: string, days: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(ymd: string): string {
  const d = new Date(ymd + "T12:00:00Z");
  const dow = d.getUTCDay();
  const diff = (dow === 0 ? -6 : 1 - dow);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(ymd: string): string {
  return ymd.slice(0, 7) + "-01";
}

function endOfMonth(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function daysInMonth(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function businessDaysInclusive(startYmd: string, endYmd: string): number {
  const start = new Date(startYmd + "T12:00:00Z");
  const end = new Date(endYmd + "T12:00:00Z");
  let count = 0;
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

function extractDateBRT(v: any): string | null {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try { return new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
  catch { return null; }
}

function billingFat(b: any): number {
  return Number(b?.fat_total) || 0;
}

function billingPag(b: any): number {
  return Number(b?.pag_total) || (Number(b?.pag_vrp) || 0) + (Number(b?.pag_periculosidade) || 0) + (Number(b?.pag_adicional_noturno) || 0) + (Number(b?.pag_reembolsos) || 0);
}

function billingDesp(b: any): number {
  return Number(b?.desp_total) || (Number(b?.desp_pedagio) || Number(b?.despesas_pedagio) || 0) + (Number(b?.desp_combustivel) || Number(b?.despesas_combustivel) || 0) + (Number(b?.desp_outras) || Number(b?.despesas_outras) || 0);
}

function dedupBillingsBySO(rows: any[]): any[] {
  const map = new Map<number, any>();
  for (const b of rows) {
    const id = Number(b.service_order_id);
    if (!id) continue;
    const ex = map.get(id);
    if (!ex || new Date(b.created_at || 0) > new Date(ex.created_at || 0)) map.set(id, b);
  }
  return Array.from(map.values());
}

function sumBillingsFat(rows: any[], orderById: Map<number, any>): number {
  let total = 0;
  for (const b of rows) {
    const so = orderById.get(Number(b.service_order_id));
    if (so && isCancelledStatus(so.status)) continue;
    total += billingFat(b);
  }
  return total;
}

export interface ResumoDiretoria {
  date: string;
  diaSemana: string;
  dataLabel: string;
  generatedAt: string;
  asaas: { connected: boolean; balance?: number; message?: string };
  meta: {
    diariaPorViatura: number;
    viaturasAtivas: number;
    diaria: number;
    semanal: number;
    mensal: number;
    diasNoMes: number;
  };
  dia: {
    fatBilling: number;
    fatLive: number;
    fatExtraLive: number;
    receitasAvulsas: number;
    despesasAvulsas: number;
    custoEscolta: number;
    custoTotal: number;
    resultado: number;
    margem: number;
    kmTotal: number;
    despPedagio: number;
    despCombustivel: number;
    metaDiaria: number;
    pctMeta: number;
  };
  semana: { inicio: string; fim: string; fat: number; meta: number; pct: number };
  mes: { inicio: string; fim: string; fat: number; meta: number; pct: number };
  gastosMes: { total: number; porCategoria: { categoria: string; valor: number; pct: number }[] };
  analiseCustoKm: {
    custoPorKmHoje: number;
    custoPorKmHist: number;
    variacaoPct: number;
    histKmTotal: number;
    histCustoTotal: number;
    status: { color: string; bg: string; label: string; msg: string };
  };
  ops: { totalOS: number; escoltas: number; concluidas: number; emAndamento: number; canceladas: number; agentesAtivos: number };
  ordens: { id: number; osNumber: string; clientName: string; status: string; fat: number; fatLive: number; custo: number; kmTotal: number; horasMissao: number; isLive: boolean }[];
}

export async function getDiretoriaSnapshot(targetDate?: string): Promise<ResumoDiretoria> {
  const todayBRT = targetDate || brtToday();
  const todayLabel = new Date(todayBRT + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const diaSemana = new Date(todayBRT + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });

  const todayStart = todayBRT + "T00:00:00";
  const todayEnd = todayBRT + "T23:59:59";

  const histStartYmd = ymdAddDays(todayBRT, -30);
  const histEndYmd = ymdAddDays(todayBRT, -1);

  const weekStartYmd = startOfWeekMonday(todayBRT);
  const weekEndYmd = ymdAddDays(weekStartYmd, 6);
  const monthStartYmd = startOfMonth(todayBRT);
  const monthEndYmd = endOfMonth(todayBRT);

  const [
    todayBillingsRes,
    weekBillingsRes,
    monthBillingsRes,
    histBillingsRes,
    transactionsRes,
    clientsRes,
    vehiclesRes,
    contractsRes,
    asaasBalance,
  ] = await Promise.all([
    supabaseAdmin.from("escort_billings").select("*").gte("data_missao", todayStart).lte("data_missao", todayEnd),
    supabaseAdmin.from("escort_billings").select("*").gte("data_missao", weekStartYmd + "T00:00:00").lte("data_missao", weekEndYmd + "T23:59:59"),
    supabaseAdmin.from("escort_billings").select("*").gte("data_missao", monthStartYmd + "T00:00:00").lte("data_missao", monthEndYmd + "T23:59:59"),
    supabaseAdmin.from("escort_billings").select("km_total,pag_total,pag_vrp,pag_periculosidade,pag_adicional_noturno,pag_reembolsos,desp_total,desp_pedagio,despesas_pedagio,desp_combustivel,despesas_combustivel,desp_outras,despesas_outras").gte("data_missao", histStartYmd + "T00:00:00").lte("data_missao", histEndYmd + "T23:59:59"),
    supabaseAdmin.from("financial_transactions").select("*").or(`and(due_date.gte.${monthStartYmd},due_date.lte.${monthEndYmd}),and(payment_date.gte.${monthStartYmd},payment_date.lte.${monthEndYmd}),and(created_at.gte.${monthStartYmd}T00:00:00,created_at.lte.${monthEndYmd}T23:59:59)`),
    supabaseAdmin.from("clients").select("id, name, company_name"),
    supabaseAdmin.from("vehicles").select("*"),
    supabaseAdmin.from("escort_contracts").select("*"),
    getAsaasBalance(),
  ]);

  const contractById = new Map<number, any>();
  const contractByClient = new Map<number, any>();
  for (const c of (contractsRes.data || [])) {
    contractById.set(c.id, c);
    if (c.status === "Ativo" && c.client_id) contractByClient.set(c.client_id, c);
  }
  const defaultContrato = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, valor_km_extra: 2.40, franquia_minima_km: 50, franquia_km: 50, franquia_horas: 3, valor_hora_estadia: 50, valor_hora_extra: 110, valor_acionamento: 0 };

  const allOrders = await storage.getServiceOrders();
  const employees = await storage.getEmployees();

  const clientMap = new Map<number, string>();
  for (const c of (clientsRes.data || [])) {
    clientMap.set(c.id, c.company_name || c.name || `Cliente #${c.id}`);
  }

  const todayOrders = allOrders.filter((so: any) => {
    const sd = extractDateBRT(so.scheduledDate);
    const cd = extractDateBRT(so.completedDate);
    const ms = so.missionStartedAt ? extractDateBRT(so.missionStartedAt) : null;
    return sd === todayBRT || cd === todayBRT || ms === todayBRT;
  });
  const escoltaOrders = todayOrders.filter((so: any) => so.type === "escolta");
  const concluidas = todayOrders.filter((so: any) => so.status === "concluida" || so.status === "concluída" || so.missionStatus === "encerrada");
  const emAndamento = todayOrders.filter((so: any) => so.status === "em_andamento");
  const canceladas = todayOrders.filter((so: any) => isCancelledStatus(so.status));

  const todayBillings = dedupBillingsBySO(todayBillingsRes.data || []);
  const billingBySO = new Map<number, any>();
  for (const b of todayBillings) billingBySO.set(Number(b.service_order_id), b);

  const orderById = new Map<number, any>();
  for (const so of todayOrders) orderById.set(so.id, so);

  let fatBilling = 0;
  let custoEscolta = 0;
  let kmTotal = 0;
  let despPedagio = 0;
  let despCombustivel = 0;

  for (const b of todayBillings) {
    const so = orderById.get(Number(b.service_order_id));
    if (so && isCancelledStatus(so.status)) continue;
    fatBilling += billingFat(b);
    custoEscolta += billingPag(b) + billingDesp(b);
    kmTotal += Number(b.km_total) || 0;
    despPedagio += Number(b.desp_pedagio) || Number(b.despesas_pedagio) || 0;
    despCombustivel += Number(b.desp_combustivel) || Number(b.despesas_combustivel) || 0;
  }

  for (const so of todayOrders) {
    if (billingBySO.has(so.id)) continue;
    if (isCancelledStatus(so.status)) continue;
    const soFat = Number((so as any).fat_calculado) || 0;
    const soCusto = Number((so as any).custo_total_alocado) || 0;
    if (soFat > 0) fatBilling += soFat;
    custoEscolta += soCusto;
    kmTotal += Number((so as any).km_total_calculado) || 0;
  }

  let fatExtraLive = 0;
  const ordensOut: ResumoDiretoria["ordens"] = [];

  for (const so of todayOrders) {
    const billing = billingBySO.get(so.id);
    let fat = billing ? billingFat(billing) : (Number((so as any).fat_calculado) || 0);
    let custo = Number((so as any).custo_total_alocado) || 0;
    if (billing) {
      const bPag = billingPag(billing);
      const bDesp = billingDesp(billing);
      if (bPag + bDesp > 0) custo = bPag + bDesp;
    }
    if (isCancelledStatus(so.status)) { fat = 0; custo = 0; }

    let horasMissao = 0;
    let fatLive = fat;
    let isLive = false;
    const isFinalized = so.status === "concluida" || so.status === "concluída" || so.missionStatus === "encerrada";
    if (!isCancelledStatus(so.status) && !isFinalized && (so as any).missionStartedAt) {
      horasMissao = calcHorasElapsedLocal((so as any).missionStartedAt, undefined);
      if (horasMissao > 0) {
        const contrato = (so as any).escortContractId && contractById.has((so as any).escortContractId)
          ? contractById.get((so as any).escortContractId)
          : ((so as any).clientId && contractByClient.has((so as any).clientId)
            ? contractByClient.get((so as any).clientId)
            : defaultContrato);

        const kmInicial = Number(billing?.km_inicial) || 0;
        const kmFinal = Number(billing?.km_final) || kmInicial;
        let kmRota: number | undefined = extractKmFromText((so as any).destination) || extractKmFromText((so as any).route) || undefined;
        if (!kmRota && (so as any).originLat && (so as any).originLng && (so as any).destinationLat && (so as any).destinationLng) {
          const haversineKm = haversineDistanceKm(
            Number((so as any).originLat), Number((so as any).originLng),
            Number((so as any).destinationLat), Number((so as any).destinationLng),
          );
          kmRota = Math.round(haversineKm * 1.4);
          if ((so as any).pedagioIdaVolta) kmRota *= 2;
        }

        const liveCalc = calcularFaturamentoLive({ horasMissao, kmInicial, kmFinal, contrato, kmRota });
        const baseFat = billing ? billingFat(billing) : 0;
        const delta = Math.max(0, liveCalc.fat_total - baseFat);
        if (delta > 0) {
          fatLive = fat + delta;
          fatExtraLive += delta;
          isLive = true;
        }
      }
    }

    ordensOut.push({
      id: so.id,
      osNumber: so.osNumber || "-",
      clientName: billing?.client_name || clientMap.get(so.clientId) || "-",
      status: so.status,
      fat,
      fatLive,
      custo,
      kmTotal: Number(billing?.km_total) || Number((so as any).km_total_calculado) || 0,
      horasMissao,
      isLive,
    });
  }

  const fatLiveTotal = fatBilling + fatExtraLive;

  const allTx = transactionsRes.data || [];
  const effectiveTxDate = (t: any): string | null => {
    if (t.payment_date) return String(t.payment_date).slice(0, 10);
    if (t.due_date) return String(t.due_date).slice(0, 10);
    return extractDateBRT(t.created_at);
  };
  const monthTx = allTx.filter((t: any) => {
    const eff = effectiveTxDate(t);
    return eff && eff >= monthStartYmd && eff <= monthEndYmd;
  });
  const todayTx = monthTx.filter((t: any) => effectiveTxDate(t) === todayBRT);

  let despesasAvulsas = 0;
  let receitasAvulsas = 0;
  for (const t of todayTx) {
    if (AUTO_ORIGINS.has(String(t.origin_type || ""))) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (t.type === "EXPENSE" || t.type === "despesa") despesasAvulsas += amt;
    else if (t.type === "INCOME" || t.type === "receita") receitasAvulsas += amt;
  }

  const custoTotal = custoEscolta + despesasAvulsas;
  const resultado = fatLiveTotal + receitasAvulsas - custoTotal;
  const denomMargem = fatLiveTotal + receitasAvulsas;
  const margem = denomMargem > 0 ? (resultado / denomMargem) * 100 : 0;

  let histKmTotal = 0;
  let histCustoTotal = 0;
  for (const b of (histBillingsRes.data || [])) {
    const km = Number(b.km_total) || 0;
    if (km <= 0) continue;
    histKmTotal += km;
    histCustoTotal += billingPag(b) + billingDesp(b);
  }
  const custoPorKmHist = histKmTotal > 0 ? histCustoTotal / histKmTotal : 0;
  const custoPorKmHoje = kmTotal > 0 ? custoEscolta / kmTotal : 0;
  const variacaoPct = custoPorKmHist > 0 && custoPorKmHoje > 0 ? ((custoPorKmHoje - custoPorKmHist) / custoPorKmHist) * 100 : 0;

  let analiseStatus: { color: string; bg: string; label: string; msg: string };
  if (kmTotal <= 0 || custoPorKmHist <= 0) {
    analiseStatus = { color: "#475569", bg: "#f1f5f9", label: "Sem base de comparação", msg: "Ainda não há histórico suficiente para avaliar." };
  } else if (variacaoPct <= 10) {
    analiseStatus = { color: "#15803d", bg: "#dcfce7", label: "Dentro do esperado", msg: "Custo por km está alinhado com a média dos últimos 30 dias." };
  } else if (variacaoPct <= 25) {
    analiseStatus = { color: "#a16207", bg: "#fef3c7", label: "Atenção", msg: `Custo por km ${variacaoPct.toFixed(1)}% acima da média histórica. Revisar combustível, pedágio e horas extras.` };
  } else {
    analiseStatus = { color: "#b91c1c", bg: "#fee2e2", label: "Acima do padrão", msg: `Custo por km ${variacaoPct.toFixed(1)}% acima da média histórica. Operação cara — investigar despesas e roteirização.` };
  }

  const activeVehicles = (vehiclesRes.data || []).filter((v: any) => isActiveVehicle({ status: v.status, trackerId: v.tracker_id, truckscontrolIdentifier: v.truckscontrol_identifier }));
  const activeCount = activeVehicles.length;
  const dim = daysInMonth(todayBRT);
  const metaDiaria = META_DIARIA_VIATURA * activeCount;
  const metaSemanal = metaDiaria * businessDaysInclusive(weekStartYmd, weekEndYmd);
  const metaMensal = metaDiaria * businessDaysInclusive(monthStartYmd, monthEndYmd);

  const todayInWeek = todayBRT >= weekStartYmd && todayBRT <= weekEndYmd;
  const todayInMonth = todayBRT >= monthStartYmd && todayBRT <= monthEndYmd;

  const weekDeduped = dedupBillingsBySO(weekBillingsRes.data || []);
  const monthDeduped = dedupBillingsBySO(monthBillingsRes.data || []);
  const fatSemana = sumBillingsFat(weekDeduped, orderById) + (todayInWeek ? fatExtraLive : 0);
  const fatMes = sumBillingsFat(monthDeduped, orderById) + (todayInMonth ? fatExtraLive : 0);

  const pctMeta = metaDiaria > 0 ? (fatLiveTotal / metaDiaria) * 100 : 0;
  const pctSemana = metaSemanal > 0 ? (fatSemana / metaSemanal) * 100 : 0;
  const pctMes = metaMensal > 0 ? (fatMes / metaMensal) * 100 : 0;

  const catMap = new Map<string, number>();
  for (const t of monthTx) {
    if (t.type !== "EXPENSE" && t.type !== "despesa") continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (amt <= 0) continue;
    const cat = String(t.category_name || t.category || "Outros").trim() || "Outros";
    catMap.set(cat, (catMap.get(cat) || 0) + amt);
  }
  const totalGastosMes = Array.from(catMap.values()).reduce((a, b) => a + b, 0);
  const porCategoria = Array.from(catMap.entries())
    .map(([categoria, valor]) => ({ categoria, valor, pct: totalGastosMes > 0 ? (valor / totalGastosMes) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);

  const agentesAtivos = employees.filter((e: any) => e.status === "ativo").length;

  return {
    date: todayBRT,
    diaSemana,
    dataLabel: todayLabel,
    generatedAt: new Date().toISOString(),
    asaas: asaasBalance,
    meta: {
      diariaPorViatura: META_DIARIA_VIATURA,
      viaturasAtivas: activeCount,
      diaria: metaDiaria,
      semanal: metaSemanal,
      mensal: metaMensal,
      diasNoMes: dim,
    },
    dia: {
      fatBilling,
      fatLive: fatLiveTotal,
      fatExtraLive,
      receitasAvulsas,
      despesasAvulsas,
      custoEscolta,
      custoTotal,
      resultado,
      margem,
      kmTotal,
      despPedagio,
      despCombustivel,
      metaDiaria,
      pctMeta,
    },
    semana: { inicio: weekStartYmd, fim: weekEndYmd, fat: fatSemana, meta: metaSemanal, pct: pctSemana },
    mes: { inicio: monthStartYmd, fim: monthEndYmd, fat: fatMes, meta: metaMensal, pct: pctMes },
    gastosMes: { total: totalGastosMes, porCategoria },
    analiseCustoKm: {
      custoPorKmHoje, custoPorKmHist, variacaoPct, histKmTotal, histCustoTotal, status: analiseStatus,
    },
    ops: {
      totalOS: todayOrders.length,
      escoltas: escoltaOrders.length,
      concluidas: concluidas.length,
      emAndamento: emAndamento.length,
      canceladas: canceladas.length,
      agentesAtivos,
    },
    ordens: ordensOut,
  };
}
