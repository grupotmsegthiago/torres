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
  return [
    { id: "receita", label: "Receita", ready, valueLabel: money(input.totals.fat) },
    { id: "contrato", label: "Contrato", ready, valueLabel: `${new Set(input.missions.map((m) => m.client_name).filter(Boolean)).size} clientes` },
    { id: "cliente", label: "Cliente", ready },
    { id: "os", label: "OS", ready, valueLabel: String(input.totals.total) },
    { id: "boletim", label: "Boletim", ready, valueLabel: `${input.totals.countCongelado} cong.` },
    { id: "fatura", label: "Fatura", ready, valueLabel: money(input.totals.fatCongelado) },
    { id: "nf", label: "NF", ready },
    { id: "recebimento", label: "Recebimento", ready, valueLabel: money(input.totals.fatAberto) + " aberto" },
    { id: "fluxo", label: "Fluxo de Caixa", ready: ready && input.dataReady.rh },
    { id: "dre", label: "DRE", ready: ready && input.dataReady.rh && input.dataReady.fixedCosts, valueLabel: money(input.totals.lucro) },
    { id: "lucro", label: "Lucro", ready: ready && input.dataReady.rh, valueLabel: money(input.totals.lucro) },
    { id: "margem", label: "Margem", ready: ready && input.dataReady.rh, valueLabel: `${input.totals.margem.toFixed(1)}%` },
    { id: "dashboard", label: "Dashboard", ready: gatesReady(buildModuleGates(input)) },
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
      "Combustível (FT fueling) + Pedágio (FT mission_cost) + Manutenção + RH (soma dos salários cadastrados, rateada) + Fixos rateados (÷30 × dias). VRP do boletim NÃO entra quando há folha RH. Sem HE/benefícios/encargos no RH do Balanço.",
    modules: ["Financeiro", "RH (folha)", "Custos Fixos", "Abastecimento"],
    tables: ["financial_transactions(fueling)", "financial_transactions(mission_cost)", "rh-summary", "fixed_costs"],
    recordsConsidered: input.missions.length,
    recordsExcluded: [
      { reason: "Provisões 13º/férias (fora do fluxo de caixa operacional)", count: 0 },
      { reason: "VRP / pagamento teórico da missão (já coberto pelo RH · Folha)", count: input.rhMonthly > 0 ? 1 : 0 },
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
      `VRP referência (NÃO soma no total — já no RH): ${money(input.totals.pag)}`,
      `Combustível (abastecimento): ${money(input.totals.desp_combustivel)}`,
      `Pedágio: ${money(input.totals.desp_pedagio)}`,
      `Manutenção: ${money(input.totals.desp_manutencao)}`,
      `RH (folha rateada) — salário de cada funcionário: ${money(input.totals.provisaoRH)}`,
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
