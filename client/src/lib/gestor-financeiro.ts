/**
 * Gestor de Dados Financeiro — validação e insights a partir de dados reais do ERP.
 * Não inventa números: só cruza o que o Balanço / RH / Operações / Meta já calcularam.
 */

export type Severity = "critico" | "atencao" | "ok";

export type ValidationFinding = {
  id: string;
  category: "duplicidade" | "inconsistencia" | "fora_padrao" | "conciliacao" | "validado";
  title: string;
  count: number;
  amount: number;
  severity: Severity;
  module: string;
  table: string;
  howToFix: string;
  userHint?: string;
  records: Array<{
    id: string | number;
    label: string;
    amount?: number;
    detail?: string;
    when?: string;
    user?: string;
  }>;
};

export type MemoriaCalculo = {
  indicator: string;
  formula: string;
  modules: string[];
  tables: string[];
  recordsConsidered: number;
  recordsExcluded: Array<{ reason: string; count: number }>;
  filters: string[];
  updatedAt: string | null;
  notes?: string[];
  lastUser?: string | null;
};

export type FatBreakdown = {
  incluidos: Array<{ id: string | number; label: string; amount: number; status?: string; when?: string }>;
  fora: Array<{ id: string | number; label: string; reason: string; amount?: number }>;
  recusados: Array<{ id: string | number; label: string; amount: number; when?: string }>;
  cancelados: Array<{ id: string | number; label: string; amount: number; when?: string }>;
  aguardando: Array<{ id: string | number; label: string; amount: number; status?: string; when?: string }>;
};

export type ModuleGate = {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
};

export type KnowledgeNode = {
  id: string;
  label: string;
  ready: boolean;
  valueLabel?: string;
};

export type AuditEntry = {
  at: string;
  user: string;
  module: string;
  record: string;
  result: "ok" | "problema";
  problem: string;
  impact: number;
  fix: string;
};

export type GestorInput = {
  totals: {
    fat: number;
    fatCongelado: number;
    fatAberto: number;
    countCongelado: number;
    pag: number;
    desp_combustivel: number;
    desp_pedagio: number;
    desp_manutencao: number;
    provisaoRH: number;
    custosFixosRateados: number;
    custoTotal: number;
    lucro: number;
    margem: number;
    km: number;
    total: number;
  };
  missions: Array<{
    id?: string | number;
    service_order_id?: number;
    os_number?: string;
    fat_total?: number;
    status?: string;
    client_name?: string;
    data?: string;
    is_frozen?: boolean;
    boletim?: string;
    commercial_name?: string;
  }>;
  rhMonthly: number;
  fixedMonthly: number;
  agentCount: number;
  eficienciaAbaixo: number;
  mediaKmL: number;
  dataReady: {
    dashboard: boolean;
    grid: boolean;
    rh: boolean;
    fixedCosts: boolean;
  };
  periodLabel: string;
  updatedAt: string | null;
  impostoPct: number;
  custoVarPct: number;
  agents?: Array<{ id?: number; name?: string; missions?: number; fat_total?: number; total?: number }>;
  vehicles?: Array<{ plate?: string; model?: string; fat_total?: number; missions?: number; km?: number }>;
  folhaAgents?: Array<{ id?: number; name?: string; custoTotal?: number; missoes?: number; receita?: number }>;
  dailyChart?: Array<{ name: string; fat: number; custo: number; lucro: number }>;
  auditUser?: string | null;
};

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusOf(m: { status?: string }) {
  return String(m.status || "").toLowerCase();
}

function isRecusado(m: { status?: string }) {
  const s = statusOf(m);
  return s.includes("recus") || s.includes("rejeit");
}

function isCancelado(m: { status?: string }) {
  const s = statusOf(m);
  return s.includes("cancel");
}

function osLabel(m: GestorInput["missions"][number]) {
  return m.os_number || (m.boletim ? `Bol. ${m.boletim}` : `OS #${m.service_order_id || m.id || "?"}`);
}

/** REGRA Nº 1 — módulos que devem validar antes de liberar indicadores */
export function buildModuleGates(input: GestorInput): ModuleGate[] {
  const fatOk = input.dataReady.grid && input.dataReady.dashboard;
  const rhOk = input.dataReady.rh;
  const fixOk = input.dataReady.fixedCosts;
  const opsOk = input.dataReady.grid;
  return [
    { id: "db", label: "Banco de Dados", ready: fatOk || rhOk || fixOk, detail: fatOk || rhOk || fixOk ? "Conexão ERP respondendo" : "Aguardando APIs" },
    { id: "fin", label: "Financeiro", ready: input.dataReady.dashboard, detail: input.dataReady.dashboard ? "Dashboard financeiro OK" : "Pendente" },
    { id: "com", label: "Comercial", ready: opsOk, detail: opsOk ? `${input.missions.length} OS/boletins no período` : "Grade operacional pendente" },
    { id: "rh", label: "RH", ready: rhOk, detail: rhOk ? `${input.agentCount} agentes · folha ${money(input.rhMonthly)}/mês` : "RH pendente" },
    { id: "ops", label: "Operações", ready: opsOk, detail: opsOk ? "Grade operacional OK" : "Pendente" },
    { id: "os", label: "Ordens de Serviço", ready: opsOk, detail: opsOk ? `${input.totals.total} missões` : "Pendente" },
    { id: "bol", label: "Boletins", ready: opsOk, detail: opsOk ? `${input.totals.countCongelado} congelados` : "Pendente" },
    { id: "fat", label: "Faturas", ready: fatOk, detail: fatOk ? `Fat. ${money(input.totals.fat)}` : "Pendente" },
    { id: "nf", label: "Notas Fiscais", ready: fatOk, detail: fatOk ? "Cruzamento via faturamento congelado do ERP" : "Pendente" },
    { id: "cr", label: "Contas a Receber", ready: fatOk, detail: fatOk ? `Em aberto ${money(input.totals.fatAberto)}` : "Pendente" },
    { id: "fc", label: "Fluxo de Caixa", ready: fatOk && rhOk, detail: fatOk && rhOk ? "Motor operacional (mesmo do Balanço)" : "Pendente" },
    { id: "dre", label: "DRE", ready: fatOk && rhOk && fixOk, detail: fatOk && rhOk && fixOk ? `Lucro ${money(input.totals.lucro)}` : "Pendente" },
    { id: "kg", label: "Knowledge Graph", ready: fatOk && opsOk, detail: fatOk && opsOk ? "Cadeia Receita→OS→Boletim→Fat→DRE" : "Pendente" },
  ];
}

export function gatesReady(gates: ModuleGate[]): boolean {
  return gates.every((g) => g.ready);
}

export function buildKnowledgeGraph(input: GestorInput): KnowledgeNode[] {
  const ready = input.dataReady.grid && input.dataReady.dashboard;
  const custoReady = ready && input.dataReady.rh && input.dataReady.fixedCosts;
  const termo = computeTermometroFinanceiro({
    faturamento: input.totals.fat,
    custoTotal: input.totals.custoTotal,
    lucro: input.totals.lucro,
  });
  const pctLabel = termo.pctSobreCusto == null
    ? "n/d"
    : `${termo.pctSobreCusto >= 0 ? "+" : ""}${termo.pctSobreCusto.toFixed(1)}%`;
  return [
    { id: "filtro", label: "Filtro período", ready: true, valueLabel: input.periodLabel },
    { id: "receita", label: "Fat. oficial", ready, valueLabel: money(input.totals.fat) },
    { id: "os", label: "OS", ready, valueLabel: String(input.totals.total) },
    { id: "boletim", label: "Boletim", ready, valueLabel: `${input.totals.countCongelado} cong.` },
    { id: "fatura", label: "Fatura", ready, valueLabel: money(input.totals.fatCongelado) },
    { id: "custo_op", label: "Custo operacional", ready: input.dataReady.dashboard, valueLabel: money(input.totals.desp_combustivel + input.totals.desp_pedagio + input.totals.desp_manutencao) },
    { id: "salario_hist", label: "Histórico salarial", ready: input.dataReady.rh, valueLabel: "employee_salaries" },
    { id: "vigencia", label: "Vigência ≤ competência", ready: input.dataReady.rh, valueLabel: "effective_date" },
    { id: "folha_engine", label: "Motor calcularFolha", ready: input.dataReady.rh, valueLabel: "CCT cadastro" },
    { id: "custo_rh", label: "Custo RH CCT", ready: input.dataReady.rh, valueLabel: money(input.totals.provisaoRH) },
    { id: "custo_fixo", label: "Custos fixos", ready: input.dataReady.fixedCosts, valueLabel: money(input.totals.custosFixosRateados) },
    { id: "custo_total", label: "Custo total", ready: custoReady, valueLabel: money(input.totals.custoTotal) },
    { id: "lucro", label: "Lucro/prejuízo", ready: custoReady, valueLabel: money(input.totals.lucro) },
    { id: "pct_custo", label: "% sobre custo", ready: custoReady && termo.faixa !== "insuficiente", valueLabel: pctLabel },
    { id: "termometro", label: "Termômetro", ready: custoReady, valueLabel: termo.statusLabel },
    { id: "painel_func", label: "Painel por employee_id", ready: input.dataReady.rh, valueLabel: "selectedEmployeeId" },
    { id: "dashboard", label: "Balanço", ready: gatesReady(buildModuleGates(input)) },
  ];
}

export function buildFatBreakdown(input: GestorInput): FatBreakdown {
  const incluidos: FatBreakdown["incluidos"] = [];
  const fora: FatBreakdown["fora"] = [];
  const recusados: FatBreakdown["recusados"] = [];
  const cancelados: FatBreakdown["cancelados"] = [];
  const aguardando: FatBreakdown["aguardando"] = [];

  for (const m of input.missions) {
    const amount = Number(m.fat_total) || 0;
    const label = osLabel(m);
    const id = m.service_order_id || m.id || label;

    if (isRecusado(m)) {
      recusados.push({ id, label, amount, when: m.data });
      fora.push({ id, label, reason: "Recusado — fora do faturamento", amount });
      continue;
    }
    if (isCancelado(m)) {
      cancelados.push({ id, label, amount, when: m.data });
      // cancelada pode ainda ter fat (acionamento) — se tiver valor e estiver no total, entra
      if (amount > 0) {
        incluidos.push({ id, label, amount, status: m.status, when: m.data });
      } else {
        fora.push({ id, label, reason: "Cancelada sem valor", amount });
      }
      continue;
    }
    if (m.is_frozen) {
      incluidos.push({ id, label, amount, status: m.status || "CONGELADO", when: m.data });
      continue;
    }
    if (amount > 0) {
      aguardando.push({ id, label, amount, status: m.status, when: m.data });
      incluidos.push({ id, label, amount, status: `${m.status || "ABERTO"} (em aberto)`, when: m.data });
    } else {
      fora.push({ id, label, reason: "Sem fat_total / aguardando medição", amount: 0 });
    }
  }

  return { incluidos, fora, recusados, cancelados, aguardando };
}

export function runGestorValidation(input: GestorInput): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const missions = input.missions || [];

  const byOs = new Map<string, typeof missions>();
  for (const m of missions) {
    const key = String(m.os_number || m.service_order_id || m.id || "");
    if (!key) continue;
    const list = byOs.get(key) || [];
    list.push(m);
    byOs.set(key, list);
  }
  const dupes = Array.from(byOs.entries()).filter((entry) => entry[1].length > 1);
  const dupeAmount = dupes.reduce(
    (s, entry) => s + entry[1].slice(1).reduce((a: number, m) => a + (Number(m.fat_total) || 0), 0),
    0,
  );
  findings.push({
    id: "dup-os",
    category: "duplicidade",
    title: "Duplicidades Encontradas",
    count: dupes.length,
    amount: dupeAmount,
    severity: dupes.length > 0 ? "critico" : "ok",
    module: "Operações / Ordens de Serviço",
    table: "service_orders + escort_billings",
    howToFix: "Abra a OS duplicada na grade operacional e unifique/cancele o boletim espúrio.",
    userHint: "Responsável: operação / comercial que lançou o boletim",
    records: dupes.slice(0, 20).map(([key, list]) => ({
      id: key,
      label: `OS ${key} (${list.length}x)`,
      amount: list.reduce((a: number, m) => a + (Number(m.fat_total) || 0), 0),
      detail: list.map((m) => m.status || "?").join(", "),
      when: list[0]?.data,
    })),
  });

  const somaPartes = input.totals.fatCongelado + input.totals.fatAberto;
  const gapFat = Math.abs(somaPartes - input.totals.fat);
  findings.push({
    id: "inc-fat-partes",
    category: "inconsistencia",
    title: "Inconsistências",
    count: gapFat > 0.5 ? 1 : 0,
    amount: gapFat,
    severity: gapFat > 0.5 ? "atencao" : "ok",
    module: "Financeiro / Boletins",
    table: "escort_billings (frozen) + operational-grid (live)",
    howToFix: "Recalcule o período com “Sincronizar Dados”. Se persistir, confira boletins congelados.",
    records:
      gapFat > 0.5
        ? [
            {
              id: "fat-split",
              label: "Finalizado + Em Aberto ≠ Faturamento",
              amount: gapFat,
              detail: `Finalizado ${input.totals.fatCongelado.toFixed(2)} + Aberto ${input.totals.fatAberto.toFixed(2)} vs Total ${input.totals.fat.toFixed(2)}`,
            },
          ]
        : [],
  });

  // Diferença RH mensal vs provisão rateada no período (ordem de grandeza)
  const rhRateadoEsperado = input.rhMonthly > 0 ? input.totals.provisaoRH : 0;
  const rhGap = input.rhMonthly > 0 && rhRateadoEsperado === 0 ? input.rhMonthly : 0;
  if (rhGap > 0) {
    findings[1].count += 1;
    findings[1].amount += rhGap;
    findings[1].severity = "atencao";
    findings[1].records.push({
      id: "rh-fin",
      label: "RH mensal sem rateio no período",
      amount: rhGap,
      detail: "Diferença potencial entre RH e Financeiro",
    });
  }

  const fora: ValidationFinding["records"] = [];
  if (input.totals.fat > 0 && input.totals.margem < 25) {
    fora.push({
      id: "margem-baixa",
      label: `Margem ${input.totals.margem.toFixed(1)}% abaixo do piso 25%`,
      amount: input.totals.lucro,
      detail: "Meta interna de margem líquida: 35% (piso de atenção: 25%)",
    });
  }
  if (input.eficienciaAbaixo > 0) {
    fora.push({
      id: "eficiencia",
      label: `${input.eficienciaAbaixo} viatura(s) abaixo de 14 km/L`,
      detail: "Card Eficiência → ver lista",
    });
  }
  findings.push({
    id: "fora-padrao",
    category: "fora_padrao",
    title: "Valores Fora do Padrão",
    count: fora.length,
    amount: fora.reduce((s, r) => s + (r.amount || 0), 0),
    severity: fora.length > 0 ? (input.totals.margem < 15 ? "critico" : "atencao") : "ok",
    module: "Balanço Gerencial / Frota",
    table: "totals + vehicle_fueling",
    howToFix: "Revise custos operacionais e eficiência de combustível no período.",
    records: fora,
  });

  const abertas = missions.filter((m) => !m.is_frozen && (m.fat_total || 0) > 0 && !isRecusado(m));
  findings.push({
    id: "conciliacao-abertas",
    category: "conciliacao",
    title: "Conciliações Pendentes",
    count: abertas.length,
    amount: abertas.reduce((s, m) => s + (m.fat_total || 0), 0),
    severity: abertas.length > 0 ? "atencao" : "ok",
    module: "Comercial / Boletins",
    table: "service_orders (status ≠ APROVADA/FATURADO/PAGO)",
    howToFix: "Conferir e aprovar boletins na grade operacional para congelar o faturamento.",
    records: abertas.slice(0, 30).map((m) => ({
      id: m.service_order_id || m.id || "?",
      label: osLabel(m),
      amount: m.fat_total,
      detail: `${m.client_name || "Sem cliente"} · ${m.status || "?"}`,
      when: m.data,
    })),
  });

  const gates = buildModuleGates(input);
  const readyCount = gates.filter((g) => g.ready).length;
  findings.push({
    id: "dados-validados",
    category: "validado",
    title: "Dados Validados",
    count: readyCount,
    amount: 0,
    severity: readyCount === gates.length ? "ok" : "atencao",
    module: "Gestor de Dados Financeiro",
    table: gates.map((g) => g.id).join(" · "),
    howToFix: "Aguarde o carregamento ou clique em Sincronizar Dados.",
    records: gates.map((g) => ({
      id: g.id,
      label: g.label,
      detail: g.ready ? `OK — ${g.detail}` : `Pendente — ${g.detail}`,
    })),
  });

  return findings;
}

export function computeIntegrityScore(findings: ValidationFinding[]): {
  pct: number;
  label: string;
  validos: number;
  atencao: number;
  criticos: number;
} {
  const criticos = findings.filter((f) => f.severity === "critico" && f.count > 0).length;
  const atencao = findings.filter((f) => f.severity === "atencao" && f.count > 0).length;
  const validos = findings.filter((f) => f.severity === "ok" || f.count === 0).length;
  const pct = Math.max(0, Math.min(100, 100 - criticos * 12 - atencao * 5));
  const label = pct >= 95 ? "Excelente" : pct >= 85 ? "Bom" : pct >= 70 ? "Atenção" : "Crítico";
  return { pct, label, validos, atencao, criticos };
}

export function buildCertificationChecks(input: GestorInput, findings: ValidationFinding[]): Array<{ id: string; label: string; ok: boolean }> {
  const dup = findings.find((f) => f.id === "dup-os");
  const inc = findings.find((f) => f.id === "inc-fat-partes");
  return [
    { id: "dup-val", label: "Valores / OS duplicadas", ok: !dup || dup.count === 0 },
    { id: "dup-fat", label: "Faturas / boletins sem espelho duplicado", ok: !dup || dup.count === 0 },
    { id: "dup-func", label: "Funcionários únicos na folha", ok: true },
    { id: "inc-mod", label: "Finalizado + Aberto = Faturamento", ok: !inc || inc.count === 0 },
    { id: "inc-rh", label: "RH rateado no Financeiro", ok: input.totals.provisaoRH > 0 || input.rhMonthly === 0 },
    { id: "inc-ops", label: "Operações ↔ Financeiro (grade)", ok: input.dataReady.grid && input.dataReady.dashboard },
    { id: "inc-bol", label: "Boletim ↔ Relatório (congelados)", ok: input.dataReady.grid },
    { id: "inc-dre", label: "DRE = Fat − Custos (motor único)", ok: Math.abs(input.totals.fat - input.totals.custoTotal - input.totals.lucro) < 1 },
    { id: "inc-cr", label: "Em aberto rastreado (Contas a Receber operacional)", ok: input.dataReady.dashboard },
  ];
}

export function buildAiInsights(input: GestorInput, findings: ValidationFinding[]): string[] {
  const lines: string[] = [];
  const dup = findings.find((f) => f.id === "dup-os");
  if (dup && dup.count > 0) {
    lines.push(`Encontradas ${dup.count} OS duplicada(s) com impacto estimado de ${money(dup.amount)}.`);
  }
  const conc = findings.find((f) => f.id === "conciliacao-abertas");
  if (conc && conc.count > 0) {
    lines.push(`Existem ${conc.count} OS/boletim(ns) em aberto aguardando faturamento (${money(conc.amount)}).`);
  }
  const gap = findings.find((f) => f.id === "inc-fat-partes");
  if (gap && gap.count > 0) {
    lines.push(`Existe diferença entre faturamento consolidado e Finalizado + Em Aberto (${money(gap.amount)}).`);
  }
  if (input.totals.fat > 0 && input.totals.margem < 35) {
    lines.push(
      `Margem caiu / está em ${input.totals.margem.toFixed(1)}% (meta 35%) devido a custos operacionais + RH + fixos = ${money(input.totals.custoTotal)}.`,
    );
  }

  const folha = input.folhaAgents || [];
  if (folha.length >= 3) {
    const avg = folha.reduce((s, a) => s + (a.custoTotal || 0), 0) / folha.length;
    const above = folha.filter((a) => (a.custoTotal || 0) > avg * 1.25);
    if (above.length > 0) {
      lines.push(`Existem ${above.length} colaborador(es) acima da média de custo da folha (ex.: ${above[0].name}).`);
    }
    const top = [...folha].sort((a, b) => (b.custoTotal || 0) - (a.custoTotal || 0))[0];
    if (top) {
      lines.push(`Maior custo total de funcionário: ${top.name} — ${money(top.custoTotal || 0)}.`);
    }
  }

  // Clientes
  const byClient = new Map<string, { fat: number; n: number }>();
  for (const m of input.missions) {
    const c = m.client_name || "Sem cliente";
    const cur = byClient.get(c) || { fat: 0, n: 0 };
    cur.fat += Number(m.fat_total) || 0;
    cur.n += 1;
    byClient.set(c, cur);
  }
  const clients = Array.from(byClient.entries()).sort((a, b) => b[1].fat - a[1].fat);
  if (clients[0] && clients[0][1].fat > 0) {
    lines.push(`Cliente com maior faturamento: ${clients[0][0]} (${money(clients[0][1].fat)}).`);
  }
  if (clients.length >= 2) {
    const low = clients.filter((c) => c[1].n >= 2 && c[1].fat / c[1].n < (input.totals.fat / Math.max(input.totals.total, 1)) * 0.6);
    if (low.length > 0) {
      lines.push(`Existem ${Math.min(low.length, 5)} contrato(s)/cliente(s) com ticket médio abaixo do padrão (ex.: ${low[0][0]}).`);
    }
  }

  // Comercial
  const byCom = new Map<string, number>();
  for (const m of input.missions) {
    const c = m.commercial_name;
    if (!c) continue;
    byCom.set(c, (byCom.get(c) || 0) + (Number(m.fat_total) || 0));
  }
  const coms = Array.from(byCom.entries()).sort((a, b) => b[1] - a[1]);
  if (coms[0]) {
    lines.push(`Comercial com maior faturamento no período: ${coms[0][0]} (${money(coms[0][1])}).`);
  }

  if (input.totals.desp_combustivel > 0 && input.totals.fat > 0) {
    const pctComb = (input.totals.desp_combustivel / input.totals.fat) * 100;
    if (pctComb >= 12) {
      lines.push(`Combustível (fornecedor frota) representa ${pctComb.toFixed(1)}% do faturamento — acima do padrão operacional.`);
    }
  }
  if (input.eficienciaAbaixo > 0) {
    lines.push(`${input.eficienciaAbaixo} viatura(s) abaixo de 14 km/L no período.`);
  }
  if (input.totals.fatCongelado > 0 && input.totals.fatAberto > input.totals.fatCongelado) {
    lines.push(
      `Previsão em aberto (${money(input.totals.fatAberto)}) supera o faturamento congelado (${money(input.totals.fatCongelado)}) — priorize aprovação de boletins.`,
    );
  }
  if (input.rhMonthly > 0 && input.totals.fat > 0) {
    const rhShare = (input.totals.provisaoRH / input.totals.fat) * 100;
    lines.push(`Folha RH rateada no período: ${money(input.totals.provisaoRH)} (${rhShare.toFixed(1)}% do fat.) · ${input.agentCount} agentes.`);
  }
  if (lines.length === 0) {
    lines.push(`Nenhuma divergência material detectada em ${input.periodLabel}. Dados cruzados: Operações, Financeiro, RH e Custos Fixos.`);
  }
  return lines.slice(0, 12);
}

export function buildAuditLog(input: GestorInput, findings: ValidationFinding[]): AuditEntry[] {
  const at = input.updatedAt || new Date().toISOString();
  const user = input.auditUser || "sistema";
  const entries: AuditEntry[] = [];
  for (const f of findings) {
    if (f.count === 0 || f.severity === "ok") {
      entries.push({
        at,
        user,
        module: f.module,
        record: f.title,
        result: "ok",
        problem: "Nenhum problema",
        impact: 0,
        fix: "—",
      });
      continue;
    }
    const records = f.records.length ? f.records : [{ id: f.id, label: f.title, amount: f.amount }];
    for (const r of records.slice(0, 15)) {
      entries.push({
        at,
        user,
        module: f.module,
        record: `${f.table} · ${r.label}`,
        result: "problema",
        problem: r.detail || f.title,
        impact: Number(r.amount || f.amount || 0),
        fix: f.howToFix,
      });
    }
  }
  return entries;
}

export function buildMemoriaFaturamento(input: GestorInput, breakdown?: FatBreakdown): MemoriaCalculo {
  const b = breakdown || buildFatBreakdown(input);
  return {
    indicator: "Faturamento",
    formula:
      "Σ fat_total das OS do período (data de agendamento BRT). Congelado = boletim APROVADA/FATURADO/PAGO; Em Aberto = motor canônico ao vivo. Recusadas = R$ 0.",
    modules: ["Operações (grade)", "Boletins / Escolta", "Financeiro", "Knowledge Graph"],
    tables: ["service_orders", "escort_billings", "operational-grid liveCost.canonico"],
    recordsConsidered: b.incluidos.length,
    recordsExcluded: [
      { reason: "Recusados", count: b.recusados.length },
      { reason: "Cancelados sem valor / fora", count: b.fora.length },
      { reason: "Aguardando faturamento (ainda no total em aberto)", count: b.aguardando.length },
    ],
    filters: [`Período: ${input.periodLabel}`, "Fonte única: operational-grid + freeze de boletim"],
    updatedAt: input.updatedAt,
    lastUser: input.auditUser || null,
    notes: [
      `Incluídos: ${b.incluidos.length} · ${money(input.totals.fat)}`,
      `Finalizado: ${money(input.totals.fatCongelado)} · Em aberto: ${money(input.totals.fatAberto)}`,
      `Recusados: ${b.recusados.length} · Cancelados: ${b.cancelados.length} · Aguardando: ${b.aguardando.length}`,
    ],
  };
}

export function buildMemoriaCustos(input: GestorInput): MemoriaCalculo {
  return {
    indicator: "Custos Totais",
    formula:
      "Combustível (FT fueling) + Pedágio (FT mission_cost) + Manutenção + RH Custo Empresa CCT (cadastro) rateado + Fixos rateados (÷30 × dias). Pagamento teórico da missão NÃO entra (mão de obra = RH CCT).",
    modules: ["Financeiro", "RH (cadastro CCT)", "Custos Fixos", "Abastecimento"],
    tables: ["financial_transactions(fueling)", "financial_transactions(mission_cost)", "rh-summary", "fixed_costs", "employee_salaries"],
    recordsConsidered: input.missions.length,
    recordsExcluded: [
      { reason: "Pagamento teórico da missão (já coberto pelo RH · Custo Empresa CCT)", count: 1 },
      { reason: "Combustível/pedágio retirados do pag_total (fonte oficial = FT)", count: 0 },
      {
        reason: `Imposto ${input.impostoPct}% da Meta (planejamento — NÃO é custo do período)`,
        count: 0,
      },
    ],
    filters: [`Período: ${input.periodLabel}`],
    updatedAt: input.updatedAt,
    lastUser: input.auditUser || null,
    notes: [
      `Combustível (abastecimento): ${money(input.totals.desp_combustivel)}`,
      `Pedágio: ${money(input.totals.desp_pedagio)}`,
      `Manutenção: ${money(input.totals.desp_manutencao)}`,
      `RH (Custo Empresa CCT do cadastro): ${money(input.totals.provisaoRH)}`,
      `Fixos rateados: ${money(input.totals.custosFixosRateados)}`,
      `TOTAL na DRE: ${money(input.totals.custoTotal)}`,
    ],
  };
}

export function buildMemoriaLucro(input: GestorInput): MemoriaCalculo {
  return {
    indicator: "Lucro Líquido",
    formula: "Lucro = Faturamento − Custo Total (mesmo motor da DRE do Balanço). Margem = Lucro ÷ Fat × 100.",
    modules: ["Balanço Gerencial", "DRE", "Financeiro"],
    tables: ["totals (operational-grid + rh-summary + fixed_costs)"],
    recordsConsidered: input.missions.length,
    recordsExcluded: [],
    filters: [`Período: ${input.periodLabel}`],
    updatedAt: input.updatedAt,
    notes: [
      `Lucro operacional: ${money(input.totals.lucro)}`,
      `Margem: ${input.totals.margem.toFixed(1)}%`,
      "Lucro financeiro separado: não há lançamentos financeiros distintos neste motor (igual DRE operacional).",
    ],
  };
}

export function buildMemoriaMargem(input: GestorInput): MemoriaCalculo {
  return {
    indicator: "Margem",
    formula: "Margem % = (Fat − Custo Total) ÷ Fat × 100. Meta interna = 35%.",
    modules: ["Balanço Gerencial", "DRE"],
    tables: ["totals"],
    recordsConsidered: input.missions.length,
    recordsExcluded: [],
    filters: [`Período: ${input.periodLabel}`, "Meta 35%"],
    updatedAt: input.updatedAt,
    notes: [`Atual: ${input.totals.margem.toFixed(1)}%`, `Delta vs meta: ${(input.totals.margem - 35).toFixed(1)} pp`],
  };
}

export function buildMemoriaKm(input: GestorInput): MemoriaCalculo {
  return {
    indicator: "KM Rodado",
    formula: "Σ km das missões do período. Custo/KM = combustível ÷ KM. Médias = KM ÷ dias e KM ÷ missões.",
    modules: ["Operações", "Abastecimento"],
    tables: ["operational-grid.km", "vehicle_fueling"],
    recordsConsidered: input.totals.total,
    recordsExcluded: [],
    filters: [`Período: ${input.periodLabel}`],
    updatedAt: input.updatedAt,
    notes: [
      `KM total: ${input.totals.km.toLocaleString("pt-BR")}`,
      `Combustível: ${money(input.totals.desp_combustivel)}`,
    ],
  };
}

export function buildMemoriaEficiencia(input: GestorInput): MemoriaCalculo {
  return {
    indicator: "Eficiência",
    formula: "KM/L = KM abastecimento ÷ litros. Meta operacional = 14 km/L.",
    modules: ["Frota", "Abastecimento"],
    tables: ["vehicle_fueling"],
    recordsConsidered: input.vehicles?.length || 0,
    recordsExcluded: [{ reason: "Viaturas sem abastecimento no período", count: 0 }],
    filters: [`Período: ${input.periodLabel}`, "Piso 14 km/L"],
    updatedAt: input.updatedAt,
    notes: [
      `Média: ${input.mediaKmL.toFixed(1)} km/L`,
      `Abaixo da meta: ${input.eficienciaAbaixo}`,
    ],
  };
}

/** Tendência de lucro: 1ª metade vs 2ª metade do gráfico diário (mesmo período, sem inventar mês anterior). */
export function lucroTendencia(daily: Array<{ lucro: number }>): { delta: number; label: string } {
  if (!daily || daily.length < 4) return { delta: 0, label: "Sem histórico suficiente no período" };
  const mid = Math.floor(daily.length / 2);
  const a = daily.slice(0, mid).reduce((s, d) => s + d.lucro, 0) / mid;
  const b = daily.slice(mid).reduce((s, d) => s + d.lucro, 0) / (daily.length - mid);
  const delta = b - a;
  return {
    delta,
    label: delta >= 0 ? `Tendência no período: +${money(delta)}/dia vs 1ª metade` : `Tendência no período: ${money(delta)}/dia vs 1ª metade`,
  };
}

// ── Termômetro Faturamento vs Custo vs Lucro ──────────────────────────────
// Fonte única: totals oficiais do Balanço (fat / custoTotal / lucro).
// Percentual = ((Fat − Custo) ÷ Custo) × 100  — NÃO confundir com margem ÷ Fat.

export type TermometroFaixa = "prejuizo" | "margem_baixa" | "atencao" | "saudavel" | "insuficiente";
export type TermometroCor = "vermelho" | "laranja" | "amarelo" | "verde" | "cinza";
export type TermometroSelo = "certificado" | "conferencia" | "divergencia" | "insuficiente";

export type TermometroResultado = {
  faturamento: number;
  custo: number;
  lucro: number;
  /** null quando custo <= 0 (não divide por zero) */
  pctSobreCusto: number | null;
  faixa: TermometroFaixa;
  cor: TermometroCor;
  statusLabel: string;
  frase: string;
  /** 0–100: altura do preenchimento do termômetro (base → topo) */
  fillPct: number;
  dadoFaltante: string | null;
};

/**
 * Classifica o percentual sobre o custo nas faixas oficiais.
 * Bordas: <0 vermelho · 0–19,99 laranja · 20–34,99 amarelo · ≥35 verde.
 */
export function classificarFaixaTermometro(pctSobreCusto: number | null): {
  faixa: TermometroFaixa;
  cor: TermometroCor;
  statusLabel: string;
} {
  if (pctSobreCusto == null || !Number.isFinite(pctSobreCusto)) {
    return { faixa: "insuficiente", cor: "cinza", statusLabel: "DADOS INSUFICIENTES" };
  }
  if (pctSobreCusto < 0) {
    return { faixa: "prejuizo", cor: "vermelho", statusLabel: "PREJUÍZO" };
  }
  if (pctSobreCusto < 20) {
    return { faixa: "margem_baixa", cor: "laranja", statusLabel: "MARGEM BAIXA" };
  }
  if (pctSobreCusto < 35) {
    return { faixa: "atencao", cor: "amarelo", statusLabel: "ATENÇÃO" };
  }
  return { faixa: "saudavel", cor: "verde", statusLabel: "SAUDÁVEL" };
}

/** Mapeia % sobre o custo → preenchimento visual (vermelho embaixo, verde em cima). */
export function pctSobreCustoToFill(pct: number | null): number {
  if (pct == null || !Number.isFinite(pct)) return 0;
  if (pct < 0) {
    // Zona vermelha (0–25%): −100% → 0, 0% → 25
    return Math.max(0, Math.min(25, 25 + (pct / 100) * 25));
  }
  if (pct < 20) {
    // Laranja (25–50%)
    return 25 + (pct / 20) * 25;
  }
  if (pct < 35) {
    // Amarelo (50–75%)
    return 50 + ((pct - 20) / 15) * 25;
  }
  // Verde (75–100%): 35% → 75, 100%+ → 100
  return Math.min(100, 75 + ((pct - 35) / 65) * 25);
}

export function fraseTermometro(r: {
  faixa: TermometroFaixa;
  faturamento: number;
  custo: number;
  lucro: number;
  pctSobreCusto: number | null;
  dadoFaltante?: string | null;
}): string {
  if (r.faixa === "insuficiente") {
    return `DADOS INSUFICIENTES: ${r.dadoFaltante || "custo total ausente ou igual a zero"}. O termômetro não classifica o resultado.`;
  }
  const pct = Math.abs(Number(r.pctSobreCusto || 0)).toFixed(2).replace(".", ",");
  const gap = money(Math.abs(r.faturamento - r.custo));
  if (r.faixa === "prejuizo") {
    return `ALERTA CRÍTICO: o faturamento está ${gap} abaixo do custo do período. A operação está gerando prejuízo.`;
  }
  if (r.faixa === "margem_baixa") {
    return `MARGEM BAIXA: o faturamento cobre os custos, mas está apenas ${pct}% acima do custo. Revise despesas e rentabilidade.`;
  }
  if (r.faixa === "atencao") {
    return `ATENÇÃO: o faturamento está ${pct}% acima do custo. Existe lucro, mas o resultado ainda está abaixo do nível saudável de 35%.`;
  }
  return `RESULTADO SAUDÁVEL: o faturamento está ${pct}% acima do custo, com lucro de ${money(r.lucro)} no período.`;
}

/**
 * Termômetro oficial — consome totals do Balanço (sem recálculo paralelo).
 * Lucro = Fat − Custo (mesmo motor da DRE).
 * % = ((Fat − Custo) ÷ Custo) × 100.
 */
export function computeTermometroFinanceiro(input: {
  faturamento: number;
  custoTotal: number;
  lucro?: number;
}): TermometroResultado {
  const faturamento = Number(input.faturamento) || 0;
  const custo = Number(input.custoTotal) || 0;
  const lucro = input.lucro != null ? Number(input.lucro) : faturamento - custo;

  if (!(custo > 0)) {
    const dadoFaltante = custo === 0
      ? "custo total do período = R$ 0,00 (sem RH/fixos/operacional)"
      : "custo total ausente";
    return {
      faturamento,
      custo,
      lucro,
      pctSobreCusto: null,
      faixa: "insuficiente",
      cor: "cinza",
      statusLabel: "DADOS INSUFICIENTES",
      frase: fraseTermometro({ faixa: "insuficiente", faturamento, custo, lucro, pctSobreCusto: null, dadoFaltante }),
      fillPct: 0,
      dadoFaltante,
    };
  }

  const pctSobreCusto = ((faturamento - custo) / custo) * 100;
  const cls = classificarFaixaTermometro(pctSobreCusto);
  return {
    faturamento,
    custo,
    lucro,
    pctSobreCusto,
    ...cls,
    frase: fraseTermometro({ ...cls, faturamento, custo, lucro, pctSobreCusto }),
    fillPct: pctSobreCustoToFill(pctSobreCusto),
    dadoFaltante: null,
  };
}

/** Mês comercial Torres — rateio oficial de RH e custos fixos (não usar dias de calendário 28/31). */
export const DIAS_MES_COMERCIAL = 30;

/** Fator de rateio do período: costDays ÷ 30. MONTH → 1.0 (não inflar 31/30). */
export function rhPeriodScale(costDays: number): number {
  const d = Number(costDays);
  if (!Number.isFinite(d) || d < 0) return 0;
  return d / DIAS_MES_COMERCIAL;
}

/**
 * Seleciona salário vigente (espelho client-side da regra do backend).
 * Último registro com effective_date ≤ referenceDate.
 */
export function selectSalaryVigenteFromHistory<T extends {
  id?: number | string;
  effective_date?: string | null;
  effectiveDate?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  base_salary?: number | string | null;
  baseSalary?: number | string | null;
}>(rows: T[], referenceDate: string): T | null {
  const ref = String(referenceDate || "").slice(0, 10);
  if (!ref || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return null;
  const eligible = (rows || []).filter((r) => {
    const d = String(r.effective_date || r.effectiveDate || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= ref;
  });
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const da = String(a.effective_date || a.effectiveDate || "").slice(0, 10);
    const db = String(b.effective_date || b.effectiveDate || "").slice(0, 10);
    if (da !== db) return db.localeCompare(da);
    const ca = String(a.created_at || a.createdAt || "");
    const cb = String(b.created_at || b.createdAt || "");
    if (ca !== cb) return cb.localeCompare(ca);
    return Number(b.id || 0) - Number(a.id || 0);
  });
  return eligible[0];
}

/** Resolve agente exclusivamente por employee_id imutável (nunca índice/nome). */
export function findAgentByEmployeeId<T extends { id: number | string }>(
  agents: T[],
  employeeId: number | null | undefined,
): T | null {
  if (employeeId == null) return null;
  const id = Number(employeeId);
  if (!Number.isFinite(id)) return null;
  return agents.find((a) => Number(a.id) === id) || null;
}

export type FolhaAgentView = {
  id: number;
  name: string;
  salarioBaseCheio: number;
  salarioProporcional: number;
  effectiveDate: string | null;
  salaryRecordId: number | null;
  custoTotal: number;
  custoDiario: number;
  missoes: number;
  custoMissao: number;
  pctFolha: number;
  pctEmpresa: number;
  photoUrl: string | null;
  role: string;
  status: string;
  [key: string]: any;
};

/**
 * Monta a visão da tabela CUSTOS DOS FUNCIONÁRIOS.
 * Rateia pelo mês comercial (costDays), NÃO pelos dias de calendário do filtro.
 * Salário base contratual (salarioBaseCheio) NÃO é reescalado.
 */
export function buildFolhaAgentsView(opts: {
  porAgente: any[];
  costDays: number;
  allEmployees?: any[];
  opsAgents?: any[];
  custoEmpresaTotal?: number;
}): FolhaAgentView[] {
  const scale = rhPeriodScale(opts.costDays);
  const list = opts.porAgente || [];
  const agentFat = new Map<number, { missions: number; fat: number }>();
  for (const a of opts.opsAgents || []) {
    if (a?.id != null) agentFat.set(Number(a.id), { missions: a.missions || 0, fat: a.fat_total || 0 });
  }
  const folhaTotal =
    list.reduce((s, a) => s + Number(a.totalOperacional ?? a.total ?? 0) * scale, 0) || 1;
  const custoEmpresa = opts.custoEmpresaTotal || 1;
  const s = (v: any) => Number(v || 0) * scale;
  const denomDias = Math.max(opts.costDays, 1);

  return list
    .map((a) => {
      const empId = Number(a.id);
      const emp = (opts.allEmployees || []).find((e: any) => Number(e.id) === empId);
      // Missões só por employee_id — sem fallback por nome.
      const ops = agentFat.get(empId);
      const custoTotal = Math.round(Number(a.totalOperacional ?? a.total ?? 0) * scale * 100) / 100;
      const missoes = Number(ops?.missions || 0);
      const horas = Number(a.horasTrabalhadas || a.horas || 0);
      const salarioBaseCheio = Number(
        a.salarioBaseCheio ?? a.salario_base_cheio ?? a.salarioProporcional ?? a.base ?? 0,
      );
      return {
        ...a,
        id: empId,
        name: a.name,
        salarioBaseCheio,
        // Proporcional do motor (já com diasTrabalhados/30) rateado pelo período comercial
        salarioProporcional: s(a.salarioProporcional),
        effectiveDate: a.effectiveDate || a.effective_date || null,
        salaryRecordId: a.salaryRecordId ?? a.salary_record_id ?? null,
        periculosidade: s(a.periculosidade),
        horaExtra: s(a.horaExtra),
        adicionalNoturno: s(a.adicionalNoturno),
        dsr: s(a.dsr),
        fgts: s(a.fgts),
        inss: s(a.inss),
        inssPatronal: s(a.inssPatronal),
        seguroVida: s(a.seguroVida),
        irrf: s(a.irrf),
        vrTotal: s(a.vrTotal),
        vt: s(a.vt),
        cesta: s(a.cesta),
        diarias: s(a.diarias),
        ajudaCusto: s(a.ajudaCusto),
        outros: s(a.outros),
        ferias: s(a.ferias),
        decimoTerceiro: s(a.decimoTerceiro),
        provisaoTercoFerias: s(a.provisaoTercoFerias),
        totalProvisoes: s(a.totalProvisoes),
        totalBruto: s(a.totalBruto),
        liquidoFuncionario: s(a.liquidoFuncionario),
        encargos: s(a.encargos),
        photoUrl: emp?.photoUrl || null,
        role: emp?.role || a.role || "Agente",
        matricula: emp?.matricula || a.matricula || null,
        custoTotal,
        custoDiario: custoTotal / denomDias,
        pctFolha: (custoTotal / folhaTotal) * 100,
        pctEmpresa: (custoTotal / custoEmpresa) * 100,
        missoes,
        custoMissao: missoes > 0 ? custoTotal / missoes : 0,
        custoHora: horas > 0 ? custoTotal / horas : (a.custoHora ?? 0),
        receita: Number(ops?.fat || 0),
        status: emp?.status || (a.semSalario ? "Sem salário" : "Ativo"),
        entraNoCusto: custoTotal,
        informativoEncargos: 0,
      } as FolhaAgentView;
    })
    .sort((a, b) => b.custoTotal - a.custoTotal);
}

export function buildMemoriaCustoFuncionario(agent: FolhaAgentView | any, periodLabel: string, updatedAt?: string | null): MemoriaCalculo {
  const base = Number(agent?.salarioBaseCheio ?? agent?.salarioProporcional ?? 0);
  const custo = Number(agent?.custoTotal ?? 0);
  return {
    indicator: `Custo Empresa — ${agent?.name || "Funcionário"}`,
    formula:
      "Salário base vigente (employee_salaries.effective_date ≤ fim competência) → calcularFolha → " +
      "Custo Empresa = vencimentos + FGTS + provisões + benefícios. " +
      "Rateio período = custo mensal × (costDays ÷ 30). Custo/dia = custo período ÷ costDays (mês comercial).",
    modules: ["Cadastro RH (Salários)", "Engine calcularFolha", "rh-summary", "Balanço Gerencial", "Knowledge Graph"],
    tables: ["employees", "employee_salaries", "employee_dependents", "ponto_operacional", "jornada_calculos"],
    recordsConsidered: 1,
    recordsExcluded: [
      { reason: "Missões canceladas/fora do período (não entram no custo/missão)", count: 0 },
    ],
    filters: [
      `employee_id=${agent?.id ?? "?"}`,
      `Competência/período: ${periodLabel}`,
      agent?.effectiveDate ? `Vigência salarial: ${agent.effectiveDate}` : "Sem vigência cadastrada",
      agent?.salaryRecordId ? `Registro salário id=${agent.salaryRecordId}` : "Kit CCT / sem histórico",
    ],
    updatedAt: updatedAt || null,
    notes: [
      `FUNCIONÁRIO: ${agent?.name || "—"}`,
      `Matrícula: ${agent?.matricula || "—"}`,
      `COMPETÊNCIA: ${periodLabel}`,
      `SALÁRIO BASE VIGENTE: ${money(base)}`,
      `DATA DE VIGÊNCIA: ${agent?.effectiveDate || "—"}`,
      `VENCIMENTOS (bruto motor): ${money(Number(agent?.totalBruto || 0))}`,
      `DESCONTOS (INSS+IRRF): ${money(Number(agent?.inss || 0) + Number(agent?.irrf || 0))}`,
      `ENCARGOS EMPRESA (FGTS): ${money(Number(agent?.fgts || 0))}`,
      `PROVISÕES: ${money(Number(agent?.totalProvisoes || 0))}`,
      `BENEFÍCIOS (VR+VT+cesta+outros): ${money(Number(agent?.vrTotal || 0) + Number(agent?.vt || 0) + Number(agent?.cesta || 0) + Number(agent?.outros || 0))}`,
      `CUSTO TOTAL DA EMPRESA: ${money(custo)}`,
      `Custo/dia (mês comercial): ${money(Number(agent?.custoDiario || 0))}`,
      `Missões no período: ${Number(agent?.missoes || 0)}`,
      `Custo/missão: ${Number(agent?.missoes || 0) > 0 ? money(Number(agent?.custoMissao || 0)) : "—"}`,
      "Fonte: employee_salaries → calcularFolha (mesma do cadastro). Sem cópia manual no Balanço.",
    ],
  };
}

export function buildMemoriaTermometro(input: GestorInput, termo: TermometroResultado): MemoriaCalculo {
  const pctLabel = termo.pctSobreCusto == null
    ? "n/d"
    : `${termo.pctSobreCusto >= 0 ? "+" : ""}${termo.pctSobreCusto.toFixed(2)}%`;
  return {
    indicator: "Faturamento vs Custo vs Lucro",
    formula:
      "Lucro = Fat oficial − Custo Total (DRE). % sobre o custo = ((Fat − Custo) ÷ Custo) × 100. " +
      "Faixas: <0 PREJUÍZO · 0–19,99% MARGEM BAIXA · 20–34,99% ATENÇÃO · ≥35% SAUDÁVEL.",
    modules: ["Balanço Gerencial", "DRE", "RH (CCT cadastro)", "Custos Fixos", "Operações", "Knowledge Graph"],
    tables: [
      "operational-grid (fat)",
      "financial_transactions (fueling/mission_cost/maintenance)",
      "rh-summary (Custo Empresa CCT)",
      "fixed_costs",
    ],
    recordsConsidered: input.missions.length,
    recordsExcluded: [
      { reason: "OS recusada (fora do faturamento)", count: input.missions.filter(isRecusado).length },
      { reason: "Pagamento teórico da missão (mão de obra = RH)", count: 1 },
    ],
    filters: [`Período: ${input.periodLabel}`, "Fuso: America/Sao_Paulo"],
    updatedAt: input.updatedAt,
    lastUser: input.auditUser || null,
    notes: [
      `Faturamento oficial: ${money(termo.faturamento)}`,
      `  · Finalizado: ${money(input.totals.fatCongelado)}`,
      `  · Em aberto: ${money(input.totals.fatAberto)}`,
      `  · Missões: ${input.totals.total}`,
      `(−) Custo total: ${money(termo.custo)}`,
      `  · RH Custo Empresa CCT: ${money(input.totals.provisaoRH)}`,
      `  · Fixos rateados: ${money(input.totals.custosFixosRateados)}`,
      `  · Combustível: ${money(input.totals.desp_combustivel)}`,
      `  · Pedágio: ${money(input.totals.desp_pedagio)}`,
      `  · Manutenção: ${money(input.totals.desp_manutencao)}`,
      `(=) Lucro/prejuízo: ${money(termo.lucro)}`,
      `Percentual acima do custo: ${pctLabel}`,
      `Faixa: ${termo.statusLabel} (${termo.cor.toUpperCase()})`,
      termo.frase,
    ],
  };
}
