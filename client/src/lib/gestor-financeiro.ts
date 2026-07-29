/**
 * Gestor de Dados Financeiro — validação e insights a partir de dados reais do ERP.
 * Não inventa números: só cruza o que o Balanço / RH / Operações já calcularam.
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
  records: Array<{
    id: string | number;
    label: string;
    amount?: number;
    detail?: string;
    when?: string;
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
  }>;
  rhMonthly: number;
  fixedMonthly: number;
  agentCount: number;
  eficienciaAbaixo: number;
  dataReady: {
    dashboard: boolean;
    grid: boolean;
    rh: boolean;
    fixedCosts: boolean;
  };
  periodLabel: string;
  updatedAt: string | null;
};

export function runGestorValidation(input: GestorInput): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const missions = input.missions || [];

  // Duplicidades de OS (mesmo os_number / service_order_id repetido)
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
    records: dupes.slice(0, 20).map(([key, list]) => ({
      id: key,
      label: `OS ${key} (${list.length}x)`,
      amount: list.reduce((a: number, m) => a + (Number(m.fat_total) || 0), 0),
      detail: list.map((m) => m.status || "?").join(", "),
      when: list[0]?.data,
    })),
  });

  // Inconsistência: Finalizado + Em Aberto ≠ Total
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

  // Fora do padrão: margem < 25% ou viaturas abaixo de 14 km/L
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

  // Conciliações: OSs em aberto aguardando boletim
  const abertas = missions.filter((m) => !m.is_frozen && (m.fat_total || 0) > 0);
  findings.push({
    id: "conciliacao-abertas",
    category: "conciliacao",
    title: "Conciliações Pendentes",
    count: abertas.length,
    amount: abertas.reduce((s, m) => s + (m.fat_total || 0), 0),
    severity: abertas.length > 10 ? "atencao" : abertas.length > 0 ? "atencao" : "ok",
    module: "Comercial / Boletins",
    table: "service_orders (status ≠ APROVADA/FATURADO/PAGO)",
    howToFix: "Conferir e aprovar boletins na grade operacional para congelar o faturamento.",
    records: abertas.slice(0, 30).map((m) => ({
      id: m.service_order_id || m.id || "?",
      label: m.os_number || `OS #${m.service_order_id || m.id}`,
      amount: m.fat_total,
      detail: `${m.client_name || "Sem cliente"} · ${m.status || "?"}`,
      when: m.data,
    })),
  });

  // Dados validados = módulos prontos
  const readyCount = Object.values(input.dataReady).filter(Boolean).length;
  const readyTotal = Object.keys(input.dataReady).length;
  findings.push({
    id: "dados-validados",
    category: "validado",
    title: "Dados Validados",
    count: readyCount,
    amount: 0,
    severity: readyCount === readyTotal ? "ok" : "atencao",
    module: "Gestor de Dados Financeiro",
    table: "dashboard · operational-grid · rh-summary · fixed-costs",
    howToFix: "Aguarde o carregamento ou clique em Sincronizar Dados.",
    records: [
      { id: "dashboard", label: "Financeiro / Dashboard", detail: input.dataReady.dashboard ? "OK" : "Pendente" },
      { id: "grid", label: "Operações / Grade", detail: input.dataReady.grid ? "OK" : "Pendente" },
      { id: "rh", label: "RH / Folha", detail: input.dataReady.rh ? "OK" : "Pendente" },
      { id: "fixos", label: "Custos Fixos", detail: input.dataReady.fixedCosts ? "OK" : "Pendente" },
    ],
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
  // Score: parte de 100, -12 por crítico, -5 por atenção
  const pct = Math.max(0, Math.min(100, 100 - criticos * 12 - atencao * 5));
  const label = pct >= 95 ? "Excelente" : pct >= 85 ? "Bom" : pct >= 70 ? "Atenção" : "Crítico";
  return { pct, label, validos, atencao, criticos };
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
  if (input.totals.fat > 0 && input.totals.margem < 35) {
    lines.push(
      `Margem líquida em ${input.totals.margem.toFixed(1)}% (meta 35%), impacto de custos operacionais + RH + fixos = ${money(input.totals.custoTotal)}.`,
    );
  }
  if (input.totals.desp_combustivel > 0 && input.totals.fat > 0) {
    const pctComb = (input.totals.desp_combustivel / input.totals.fat) * 100;
    if (pctComb >= 12) {
      lines.push(`Combustível representa ${pctComb.toFixed(1)}% do faturamento no período — acima do padrão operacional.`);
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
  return lines.slice(0, 8);
}

export function buildMemoriaFaturamento(input: GestorInput): MemoriaCalculo {
  const frozen = input.missions.filter((m) => m.is_frozen);
  const open = input.missions.filter((m) => !m.is_frozen);
  const cancel = input.missions.filter((m) => String(m.status || "").toLowerCase().includes("cancel"));
  return {
    indicator: "Faturamento",
    formula: "Σ fat_total das OS do período (data de agendamento BRT). Congelado = boletim APROVADA/FATURADO/PAGO; Em Aberto = motor canônico ao vivo.",
    modules: ["Operações (grade)", "Boletins / Escolta", "Financeiro"],
    tables: ["service_orders", "escort_billings", "operational-grid liveCost.canonico"],
    recordsConsidered: input.missions.length,
    recordsExcluded: [
      { reason: "Canceladas (ainda listadas se houver fat)", count: cancel.length },
      { reason: "Sem fat_total", count: input.missions.filter((m) => !(Number(m.fat_total) > 0)).length },
    ],
    filters: [`Período: ${input.periodLabel}`, "Fonte única: operational-grid + freeze de boletim"],
    updatedAt: input.updatedAt,
    notes: [
      `Finalizado: ${frozen.length} OS · ${money(input.totals.fatCongelado)}`,
      `Em aberto: ${open.length} OS · ${money(input.totals.fatAberto)}`,
      `Total: ${money(input.totals.fat)}`,
    ],
  };
}

export function buildMemoriaCustos(input: GestorInput): MemoriaCalculo {
  return {
    indicator: "Custos Totais",
    formula: "VRP (pag_total) + Combustível + Pedágio + Manutenção + RH operacional rateado + Custos Fixos rateados (÷30 × dias). Sem provisões 13º/férias.",
    modules: ["Financeiro", "RH (folha)", "Custos Fixos", "Abastecimento"],
    tables: ["escort_billings.pag", "vehicle_fueling", "mission_costs", "rh-summary", "fixed_costs"],
    recordsConsidered: input.missions.length,
    recordsExcluded: [
      { reason: "Lançamentos manuais de folha/estrutura (evita dupla contagem)", count: 0 },
    ],
    filters: [`Período: ${input.periodLabel}`],
    updatedAt: input.updatedAt,
    notes: [
      `Operacional (VRP+var): ${money(input.totals.pag + input.totals.desp_combustivel + input.totals.desp_pedagio + input.totals.desp_manutencao)}`,
      `RH: ${money(input.totals.provisaoRH)}`,
      `Fixos: ${money(input.totals.custosFixosRateados)}`,
      `Total: ${money(input.totals.custoTotal)}`,
    ],
  };
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
