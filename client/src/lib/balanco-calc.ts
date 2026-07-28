// =============================================================================
// NÚCLEO DE CÁLCULO DO BALANÇO GERENCIAL — fonte única dos KPIs da diretoria.
// Extraído de balanco-gerencial.tsx para ser COMPARTILHADO com o Gestor de
// Dados Financeiro: os dois painéis PRECISAM mostrar exatamente o mesmo número.
// Qualquer mudança de regra aqui muda nas duas telas ao mesmo tempo (proposital).
// =============================================================================

// Boletins nesses status foram conferidos e CONGELADOS por uma pessoa (aprovador/diretoria).
// O valor travado é a verdade — o recálculo ao vivo NÃO pode sobrescrevê-lo.
export const FROZEN_BILLING_STATUSES = new Set(["APROVADA", "FATURADO", "FATURADA", "PAGO"]);

// Critério ÚNICO de "OS em aberto" (dono 20/07/2026: card e modal têm que bater).
export const isOsAberta = (m: any) =>
  !m.is_frozen &&
  !FROZEN_BILLING_STATUSES.has(m.bill_status) &&
  m.bill_status !== "CANCELADO";

const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface RangeLike { start: Date; end: Date }

/**
 * Monta as missões do período (RECEITA ao vivo do operational-grid + custos do
 * billing), as despesas oficiais e os agrupamentos por viatura/agente.
 * Movido VERBATIM do useMemo `filtered` do Balanço Gerencial.
 */
export function buildMissoesPeriodo(data: any, gridData: any[], range: RangeLike) {
  if (!data) return {
    missions: [] as any[], vehicles: [] as any[], agents: [] as any[], missionDetails: [] as any[],
    expenses: { fueling: 0, mission_cost: 0, maintenance: 0, payroll: 0, fixed: 0, other: 0, total: 0, otherByCategory: {} as Record<string, number> },
    expensesByVehicle: {} as Record<string, { fueling: number; mission_cost: number; maintenance: number; total: number }>,
    periodExpenses: [] as any[],
  };

  const startStr = dateStr(range.start);
  const endStr = dateStr(range.end);

  // RECEITA ao vivo vinda do operational-grid (mesma fonte do Relatório de OS). O grid já
  // filtra o período no servidor (por scheduledDate). Só a RECEITA (fat/km) muda de fonte;
  // o pagamento/despesa por OS continua vindo do billing (custos intactos).
  const billingByOs = new Map<number, any>();
  (data.byMission || []).forEach((m: any) => {
    const sid = Number(m.service_order_id || 0);
    if (sid) billingByOs.set(sid, m);
  });

  const toDateStr = (iso: string | null | undefined): string => {
    if (!iso) return "";
    const raw = String(iso);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return "";
    const b = new Date(dt.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    return `${b.getFullYear()}-${pad(b.getMonth() + 1)}-${pad(b.getDate())}`;
  };

  const missions = (gridData || [])
    .filter((o: any) => (o.status || "").toLowerCase() !== "recusada")
    .map((o: any) => {
      const sid = Number(o.id);
      const bill = billingByOs.get(sid);
      const lc = o.liveCost || {};
      const lcCanon = lc.canonico || null;
      // Dono (ordem 29/06/2026, reconciliada): RECEITA = recálculo real ao vivo via motor CANÔNICO
      // (calcularEscolta) — MAS só para boletins NÃO aprovados (A_VERIFICAR).
      // EXCEÇÕES que mantêm o BOLETIM congelado: OS cancelada (§8.1b) e boletim
      // APROVADA/FATURADO/PAGO (valor conferido e travado por uma pessoa).
      const liveFat = Number(lcCanon?.faturamento ?? lc.faturamento_live ?? lc.faturamento) || 0;
      const isCancelada = (o.status || "").toLowerCase() === "cancelada";
      const billFrozen = !!bill && FROZEN_BILLING_STATUSES.has(String(bill.status || "").toUpperCase());
      const useBoletim = (isCancelada || billFrozen) && !!bill && Number(bill.fat_total_boletim) > 0;
      const fat = useBoletim ? (Number(bill.fat_total_boletim) || 0) : liveFat;
      const km = bill ? (Number(bill.km_total) || Number(lc.km_total) || 0) : (Number(lc.km_total) || 0);
      // VRP (agentes) SEM reembolsos (ordem do dono, 20/07/2026): pag_reembolsos é
      // combustível/pedágio da missão, que JÁ entra nas linhas oficiais.
      const pag = bill ? Math.max(0, Number(bill.pag_total || 0) - Number(bill.pag_reembolsos || 0)) : 0;
      const desp = bill ? Number(bill.despesas || 0) : 0;
      const startIso = o.scheduledDate || o.missionStartedAt || o.completedDate || o.createdAt || null;
      return {
        id: bill?.id ?? sid,
        service_order_id: sid,
        os_number: o.osNumber || bill?.os_number || null,
        data: toDateStr(startIso) || String(startIso || ""),
        data_agendamento: toDateStr(o.scheduledDate) || "",
        origem: o.origin || bill?.origem || "",
        destino: o.destination || bill?.destino || "",
        placa_viatura: o.vehicle?.plate || bill?.placa_viatura || "SEM PLACA",
        vigilante: o.employee1?.fullName || o.employee1?.name || bill?.vigilante || "SEM AGENTE",
        vigilante_id: Number(o.employee1?.id || bill?.vigilante_id || 0),
        vigilante2: o.employee2?.fullName || o.employee2?.name || bill?.vigilante2 || null,
        vigilante2_id: o.employee2?.id || bill?.vigilante2_id || null,
        fat_total: fat,
        fat_acionamento: Number(useBoletim ? bill.fat_acionamento : lcCanon?.fat_acionamento) || 0,
        fat_km: Number(useBoletim ? bill.fat_km : lcCanon?.fat_km) || 0,
        fat_km_carregado: Number(useBoletim ? 0 : lcCanon?.fat_km_carregado) || 0,
        fat_km_vazio: Number(useBoletim ? 0 : lcCanon?.fat_km_vazio) || 0,
        fat_hora_extra: Number(useBoletim ? bill.fat_hora_extra : lcCanon?.fat_hora_extra) || 0,
        fat_adicional_noturno: Number(useBoletim ? bill.fat_adicional_noturno : lcCanon?.fat_adicional_noturno) || 0,
        fat_estadia: Number(useBoletim ? bill.fat_estadia : lcCanon?.fat_estadia) || 0,
        fat_pernoite: Number(useBoletim ? bill.fat_pernoite : lcCanon?.fat_pernoite) || 0,
        fat_pedagio: Number(useBoletim ? bill.despesas_pedagio : lcCanon?.pedagio) || 0,
        receitas_os: Number(useBoletim ? bill.receitas_os : lcCanon?.receitas_os) || 0,
        km_franquia: Number(useBoletim ? bill.km_franquia : lcCanon?.km_franquia) || 0,
        km_excedente: Number(useBoletim ? bill.km_excedente : lcCanon?.km_excedente) || 0,
        horas_missao: Number(useBoletim ? bill.horas_trabalhadas : lcCanon?.horas_trabalhadas) || Number(lc.horas_missao) || 0,
        pag_total: pag,
        despesas: desp,
        lucro: fat - pag - desp,
        margem: fat > 0 ? ((fat - pag - desp) / fat) * 100 : 0,
        km_total: km,
        horas_trabalhadas: bill?.horas_trabalhadas || 0,
        boletim: bill?.boletim || "",
        status: o.status,
        is_frozen: useBoletim,
        bill_status: String(o.billingStatus || bill?.status || "").toUpperCase(),
        client_name: o.clientName || bill?.client_name || "",
      };
    });

  const periodExpenses = (data.expenseTransactions || []).filter((t: any) => {
    if (!t.date) return false;
    return t.date >= startStr && t.date <= endStr;
  });

  const expenseSums = { fueling: 0, mission_cost: 0, maintenance: 0, payroll: 0, fixed: 0, other: 0, total: 0, otherByCategory: {} as Record<string, number> };
  const expensesByVehicle: Record<string, { fueling: number; mission_cost: number; maintenance: number; total: number }> = {};

  // Categorias que JÁ são contabilizadas em outros lugares (RH provisão / Custos Fixos rateados).
  const RH_CATS = new Set(["folha de pagamento", "recursos humanos", "vale refeição", "vale refeicao", "vale alimentação", "vale alimentacao", "salário", "salario", "salarios", "salários"]);
  const FIXED_CATS = new Set(["aluguel", "frota (aluguel)", "infraestrutura/tecnologia", "infraestrutura", "tecnologia", "internet", "energia", "telefone", "softwares", "serviços", "servicos"]);
  // Lançamentos manuais Combustível/Pedágio/Manutenção sem origin_type oficial são duplicidade conhecida.
  const FUEL_CATS = new Set(["combustível", "combustivel", "abastecimento"]);
  const TOLL_CATS = new Set(["pedágio", "pedagio", "pedagios", "pedágios"]);
  const MAINT_CATS = new Set(["manutenção", "manutencao", "manutenção de viatura", "manutencao de viatura", "manutenção de viaturas", "manutencao de viaturas"]);

  periodExpenses.forEach((t: any) => {
    const amt = t.amount;
    const cat = (t.category_name || "").toLowerCase().trim();
    if (t.origin_type === "fueling") expenseSums.fueling += amt;
    else if (t.origin_type === "mission_cost") expenseSums.mission_cost += amt;
    else if (t.origin_type === "maintenance") expenseSums.maintenance += amt;
    else if (FUEL_CATS.has(cat) || TOLL_CATS.has(cat) || MAINT_CATS.has(cat)) { return; }
    else if (t.origin_type === "payroll" || RH_CATS.has(cat)) expenseSums.payroll += amt;
    else if (FIXED_CATS.has(cat)) expenseSums.fixed += amt;
    else {
      expenseSums.other += amt;
      const label = (t.category_name?.trim() || "Sem categoria");
      expenseSums.otherByCategory[label] = (expenseSums.otherByCategory[label] || 0) + amt;
    }
    expenseSums.total += amt;

    if (t.origin_type === "fueling" || t.origin_type === "mission_cost" || t.origin_type === "maintenance") {
      const plateMatch = t.entity_name?.match(/^([A-Z0-9]{7})/);
      const descPlate = t.description?.match(/(?:ABASTECIMENTO|MANUTENÇÃO|PEDÁGIO)\s+([A-Z0-9]{7})/i);
      const plate = plateMatch?.[1] || descPlate?.[1] || null;
      if (plate) {
        if (!expensesByVehicle[plate]) expensesByVehicle[plate] = { fueling: 0, mission_cost: 0, maintenance: 0, total: 0 };
        if (t.origin_type === "fueling") expensesByVehicle[plate].fueling += amt;
        else if (t.origin_type === "mission_cost") expensesByVehicle[plate].mission_cost += amt;
        else if (t.origin_type === "maintenance") expensesByVehicle[plate].maintenance += amt;
        expensesByVehicle[plate].total += amt;
      }
    }
  });

  const vehicleMap: Record<string, any> = {};
  missions.forEach((m: any) => {
    const plate = m.placa_viatura || "SEM PLACA";
    if (!vehicleMap[plate]) {
      const orig = (data.byVehicle || []).find((v: any) => v.plate === plate);
      const vExpenses = expensesByVehicle[plate];
      vehicleMap[plate] = {
        plate, model: orig?.model || "", fat_total: 0, pag_total: 0, missions: 0,
        despesas: vExpenses?.total || 0,
        desp_combustivel: vExpenses?.fueling || 0,
        desp_pedagio: vExpenses?.mission_cost || 0,
        desp_manutencao: vExpenses?.maintenance || 0,
      };
    }
    vehicleMap[plate].fat_total += m.fat_total;
    vehicleMap[plate].pag_total += m.pag_total;
    vehicleMap[plate].missions += 1;
  });

  const timesheetHoursInPeriod: Record<number, number> = {};
  (data.timesheetsByAgent || []).forEach((ts: any) => {
    if (!ts.date || !ts.employeeId) return;
    if (ts.date >= startStr && ts.date <= endStr) {
      timesheetHoursInPeriod[ts.employeeId] = (timesheetHoursInPeriod[ts.employeeId] || 0) + (ts.hoursWorked || 0);
    }
  });

  const agentMap: Record<string, { id: number; name: string; fat_total: number; pag_total: number; missions: number; horas_trabalhadas: number }> = {};
  missions.forEach((m: any) => {
    const name = m.vigilante || "SEM AGENTE";
    const agentKey = m.vigilante_id ? String(m.vigilante_id) : name;
    if (!agentMap[agentKey]) agentMap[agentKey] = { id: m.vigilante_id || 0, name, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
    agentMap[agentKey].fat_total += m.fat_total;
    agentMap[agentKey].pag_total += m.pag_total;
    agentMap[agentKey].missions += 1;

    if (m.vigilante2_id && m.vigilante2) {
      const key2 = String(m.vigilante2_id);
      if (!agentMap[key2]) agentMap[key2] = { id: m.vigilante2_id, name: m.vigilante2, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
      agentMap[key2].fat_total += m.fat_total;
      agentMap[key2].pag_total += m.pag_total;
      agentMap[key2].missions += 1;
    }
  });

  Object.values(agentMap).forEach((agent) => {
    agent.horas_trabalhadas = timesheetHoursInPeriod[agent.id] || 0;
  });

  return {
    missions,
    vehicles: Object.values(vehicleMap).sort((a: any, b: any) => b.fat_total - a.fat_total),
    agents: Object.values(agentMap).sort((a, b) => b.fat_total - a.fat_total),
    missionDetails: missions.sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime()),
    expenses: expenseSums,
    expensesByVehicle,
    periodExpenses,
  };
}

/**
 * Consolida os totais do período (fat, custoTotal, lucro, margem, km, horas...).
 * Movido VERBATIM do useMemo `totals` do Balanço Gerencial.
 */
export function buildTotaisBalanco(
  filtered: ReturnType<typeof buildMissoesPeriodo>,
  provisaoRH: number,
  custosFixosMensal: number,
  costDays: number,
) {
  const fat = filtered.missions.reduce((a: number, m: any) => a + m.fat_total, 0);
  const pag = filtered.missions.reduce((a: number, m: any) => a + m.pag_total, 0);
  const despFin = filtered.expenses;
  const despReais = despFin.total;
  // RH/estrutura/manuais sem categoria NÃO entram no operacional (evita dupla
  // contagem com a Provisão de RH e os Custos Fixos rateados).
  const despReaisOperacional = despReais - despFin.payroll - despFin.fixed - despFin.other;
  const custosFixosRateados = (custosFixosMensal / 30) * costDays;
  const custoTotal = pag + despReaisOperacional + provisaoRH + custosFixosRateados;
  const lucro = fat - custoTotal;
  const margem = fat > 0 ? (lucro / fat) * 100 : 0;
  const km = filtered.missions.reduce((a: number, m: any) => a + m.km_total, 0);
  const horas = filtered.agents.reduce((a: number, ag: any) => a + (ag.horas_trabalhadas || 0), 0);
  const fatAberto = filtered.missions.reduce((a: number, m: any) => a + (isOsAberta(m) ? m.fat_total : 0), 0);
  const fatCongelado = fat - fatAberto;
  const countCongelado = filtered.missions.filter((m: any) => !isOsAberta(m)).length;
  return {
    fat, pag, desp: despReais, lucro, margem, km, horas, total: filtered.missions.length,
    fatCongelado, fatAberto, countCongelado,
    desp_combustivel: despFin.fueling,
    desp_pedagio: despFin.mission_cost,
    desp_manutencao: despFin.maintenance,
    desp_folha: despFin.payroll,
    desp_outras: despFin.other,
    desp_outras_por_categoria: despFin.otherByCategory || {},
    provisaoRH,
    custosFixosMensal,
    custosFixosRateados,
    custoTotal,
  };
}

/**
 * Eficiência km/L da frota (método tanque-a-tanque com checagens de sanidade).
 * Movido VERBATIM do useMemo `eficiencia` do Balanço Gerencial.
 */
export function buildEficiencia(data: any, allVehicles: any[] | undefined, range: RangeLike) {
  if (!data) return { mediaKmL: 0, totalKm: 0, totalLiters: 0, perVehicle: [] as { plate: string; model: string; km: number; liters: number; kmL: number }[], abaixo: [] as { plate: string; model: string; km: number; liters: number; kmL: number }[] };

  const startStr = dateStr(range.start);
  const endStr = dateStr(range.end);

  const idToPlate: Record<number, string> = {};
  const plateToModel: Record<string, string> = {};
  (allVehicles || []).forEach((v: any) => {
    if (v.id != null && v.plate) {
      idToPlate[v.id] = v.plate;
      plateToModel[v.plate] = v.model || "";
    }
  });

  // Agrupa TODOS os abastecimentos (sem filtro de data) — o anterior ao período
  // é necessário pro km rodado entre tanques cuja recarga caiu dentro do período.
  const byVehicle = new Map<number, { date: string; km: number; liters: number }[]>();
  (data.fuelingByAgent || []).forEach((f: any) => {
    if (!f.vehicleId || !f.date) return;
    if (!byVehicle.has(f.vehicleId)) byVehicle.set(f.vehicleId, []);
    byVehicle.get(f.vehicleId)!.push({
      date: String(f.date).slice(0, 10),
      km: Number(f.km) || 0,
      liters: Number(f.liters) || 0,
    });
  });

  const perVehicle: { plate: string; model: string; km: number; liters: number; kmL: number }[] = [];
  let totalKm = 0;
  let totalLiters = 0;

  byVehicle.forEach((list, vehicleId) => {
    const plate = idToPlate[vehicleId];
    if (!plate) return;
    const sorted = [...list].sort((a, b) => {
      if (a.km !== b.km) return a.km - b.km;
      return a.date.localeCompare(b.date);
    });
    let vKm = 0;
    let vLiters = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (cur.date < startStr || cur.date > endStr) continue;
      const kmGap = cur.km - prev.km;
      if (kmGap <= 0 || kmGap > 3000) continue;
      if (cur.liters <= 0 || cur.liters > 1000) continue;
      vKm += kmGap;
      vLiters += cur.liters;
    }
    if (vKm > 0 && vLiters > 0) {
      perVehicle.push({ plate, model: plateToModel[plate] || "", km: vKm, liters: vLiters, kmL: vKm / vLiters });
      totalKm += vKm;
      totalLiters += vLiters;
    }
  });

  perVehicle.sort((a, b) => a.kmL - b.kmL);
  const mediaKmL = totalKm > 0 && totalLiters > 0 ? totalKm / totalLiters : 0;
  const abaixo = perVehicle.filter((v) => v.kmL < 14);

  return { mediaKmL, totalKm, totalLiters, perVehicle, abaixo };
}
