/**
 * Engine de Folha de Pagamento — Brasil 2025
 *
 * Implementa cálculo em cascata seguindo a legislação vigente e validado
 * contra planilha contábil de referência (caso EDIVANDO):
 *   Bruto R$ 7.359,26 / Deduções R$ 1.817,39 / Provisões R$ 576,13
 *
 * MODELO TORRES (planilha do dono — aprovado 26/06/2026; aplica em TUDO):
 *   IMPORTANTE: o cadastro guarda `base_salary` SEM periculosidade (ex.: 2.565,31).
 *   A periculosidade (30%) É somada e é justamente o que chega no "Salário" da
 *   planilha (2.565,31 × 1,30 = 3.334,90). A "salário" da planilha = base × 1,30.
 *
 *   1) Salário proporcional (base ÷ 30 × dias_trabalhados).
 *   2) Periculosidade somada (salarioProporcional × peric%) → compõe o "Salário"
 *      da planilha. A hora-base (valorHora) TAMBÉM inclui peric (Súmula 132 TST):
 *      valorHora = base × (1 + peric%) ÷ horasMensais.
 *   3) Horas Extras (valorHora × 1,60 × horas_extras)
 *   4) Hora Noturna (valorHora × 1,80 × horas_noturnas — hora cheia + 60% HE + 20% not).
 *   5) DSR: NÃO aplicado → aplicarDsr=false.
 *   6) Total tributável (INSS/FGTS) = Salário(c/ peric) + HE + Noturno (sem DSR).
 *   7) INSS = 12% fixo sobre o total tributável (inssModo="flat", inssFlatPct=12).
 *   8) IRRF mensal (decisão dono 29/07/2026 — ver memória payroll-irrf-flat):
 *      base = só salário + periculosidade (HE/noturno são pagos à parte);
 *      se base ≤ R$ 5.000 → IRRF = 0; senão 22% flat sobre essa base.
 *   9) FGTS 8% sobre o total tributável.
 *   10) Total bruto (quadro Remuneração) = base tributável (sem VR/ajuda —
 *      benefícios ficam no quadro à parte). Decisão dono 29/07/2026.
 *   11) Líquido = baseTributavel − IRRF − INSS − VT (FGTS NÃO desconta do líquido).
 *   12) Custo empresa = bruto + VR + ajuda + FGTS (SEM provisões — decisão
 *       dono 29/07/2026: 13º/férias/1/3 são só informativos).
 *   13) Provisões (informativo): 13º, Férias, 1/3, FGTS/INSS s/ provisões.
 *
 * Regra travada revertida pelo dono: adicional noturno passou de 20% (só prêmio)
 * para hora cheia 1,80× — ver memória payroll-night-additional.
 */

// ===== TABELAS OFICIAIS 2025 =====

/** INSS — Tabela vigente 2025 (Portaria MPS) */
export const INSS_2025 = {
  faixas: [
    { ate: 1518.0, aliquota: 0.075 },
    { ate: 2793.88, aliquota: 0.09 },
    { ate: 4190.83, aliquota: 0.12 },
    { ate: 8157.41, aliquota: 0.14 }, // teto
  ],
  teto: 8157.41,
};

/** IRRF — Tabela vigente desde maio/2024 (Lei 14.848/2024) */
export const IRRF_2024 = {
  faixas: [
    { ate: 2259.20, aliquota: 0, deducao: 0 },
    { ate: 2826.65, aliquota: 0.075, deducao: 169.44 },
    { ate: 3751.05, aliquota: 0.15, deducao: 381.44 },
    { ate: 4664.68, aliquota: 0.225, deducao: 662.77 },
    { ate: Infinity, aliquota: 0.275, deducao: 896.0 },
  ],
  deducaoDependente: 189.59,
};

export const FGTS_ALIQUOTA = 0.08;
export const PERICULOSIDADE_PADRAO = 0.30;
export const INSS_PROVISAO_FERIAS_13 = 0.075; // alíquota efetiva validada vs contábil
/** Isenção IRRF na folha mensal (modelo Torres — decisão 29/07/2026). */
export const IRRF_ISENTO_ATE = 5000;
/** Dias úteis CCT para VR mensal fixo (43 × 22 = 946). */
export const VR_DIAS_UTEIS_CCT = 22;
/** Valores do kit vigilância que no cadastro legado iam para "cesta" mas são ajuda de custo. */
const CESTA_KIT_LEGADO = new Set([200, 208.45]);

/**
 * Modelo Torres: R$ 200 do kit é ajuda de custo (indenizatória), não cesta básica.
 * Remapeia cadastros legados com cesta=200/208.45 e ajuda=0.
 * SIEMACO (cesta II por assiduidade) não usa esses valores de kit — não é afetado.
 */
export function resolveCestaAjudaTorres(cestaBasica: number, ajudaCustoMensal: number): {
  cesta: number;
  ajudaCusto: number;
} {
  const cesta = Number(cestaBasica) || 0;
  const ajuda = Number(ajudaCustoMensal) || 0;
  if (ajuda === 0 && CESTA_KIT_LEGADO.has(r2(cesta))) {
    return { cesta: 0, ajudaCusto: r2(cesta) };
  }
  return { cesta: r2(cesta), ajudaCusto: r2(ajuda) };
}

// ===== HELPERS =====

/** Arredonda para 2 casas decimais (modo bancário simples). */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Converte HH:MM para decimal com 4 casas de precisão.
 * Ex.: "09:16" → 9.2667 (16 ÷ 60 = 0.2667)
 */
export function hhmmToDecimal(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h)) return 0;
  return Math.round((h + (m || 0) / 60) * 10000) / 10000;
}

/** Calcula INSS progressivo respeitando o teto. */
export function calcularINSS(baseTributavel: number, tabela = INSS_2025): number {
  const base = Math.min(baseTributavel, tabela.teto);
  let inss = 0;
  let anterior = 0;
  for (const f of tabela.faixas) {
    if (base <= anterior) break;
    const faixaTopo = Math.min(base, f.ate);
    inss += (faixaTopo - anterior) * f.aliquota;
    anterior = f.ate;
    if (base <= f.ate) break;
  }
  return r2(inss);
}

/** Calcula IRRF progressivo (modelo dedução por faixa). */
export function calcularIRRF(
  baseTributavelBruta: number,
  inssDescontado: number,
  numeroDependentes: number = 0,
  tabela = IRRF_2024
): number {
  const baseIRRF = baseTributavelBruta - inssDescontado - numeroDependentes * tabela.deducaoDependente;
  if (baseIRRF <= 0) return 0;
  for (const f of tabela.faixas) {
    if (baseIRRF <= f.ate) {
      return r2(Math.max(0, baseIRRF * f.aliquota - f.deducao));
    }
  }
  return 0;
}

// ===== ENGINE DE FOLHA =====

export interface PayrollInput {
  /** Salário base cheio mensal (R$). */
  salarioBaseCheio: number;
  /** Dias trabalhados no mês (default 30 = mês cheio). */
  diasTrabalhados?: number;
  /** Horas mensais contratuais (default 220). */
  horasMensais?: number;
  /** Periculosidade (decimal, ex.: 0.30 = 30%). Default 30% (vigilantes). */
  periculosidadePct?: number;
  /** Total de horas extras no mês (decimal). */
  horasExtras?: number;
  /** Total de horas noturnas no mês (decimal). */
  horasNoturnas?: number;
  /** Multiplicador HE (default 1.60 = 60% adicional). */
  multiplicadorHE?: number;
  /** Multiplicador da hora noturna (default 1.80 = hora cheia + 60% HE + 20% noturno,
   * modelo da planilha do dono). Antes era 0.20 (só o prêmio). */
  multiplicadorAdicNot?: number;
  /** Aplicar periculosidade separada? Default `false` — no modelo Torres o salário
   * já inclui a periculosidade, então não se soma 30% por cima. */
  aplicarPericulosidade?: boolean;
  /** Aplicar DSR sobre HE/Noturno? Default `false` no modelo Torres. */
  aplicarDsr?: boolean;
  /** Modo de cálculo do INSS. Default "flat" (12% fixo, modelo Torres).
   * "progressivo" usa a tabela oficial 2025 com teto. */
  inssModo?: "flat" | "progressivo";
  /** Alíquota fixa de INSS quando inssModo="flat" (default 12 = 12%). */
  inssFlatPct?: number;
  /** Modo de cálculo do IRRF. Default "flat" (modelo Torres: base = salário+peric,
   * isento até IRRF_ISENTO_ATE; acima disso alíquota flat).
   * "progressivo" usa a tabela oficial 2024 (base = total − INSS − dependentes). */
  irrfModo?: "flat" | "progressivo";
  /** Alíquota fixa de IRRF quando irrfModo="flat" e base mensal > IRRF_ISENTO_ATE
   * (default 22%). HE/noturno não entram na base (pagos à parte). */
  irrfFlatPct?: number;
  /** Teto de isenção da base mensal de IRRF (default IRRF_ISENTO_ATE = 5000). */
  irrfIsentoAte?: number;
  /** Descontar o FGTS do líquido do funcionário? Default `false` — o FGTS é
   * depósito do empregador e não desconta do salário (decisão do dono 26/06/2026). */
  fgtsNoLiquido?: boolean;
  /** Valor de VT descontado do líquido (R$). Default 0. */
  vtDesconto?: number;
  /** Dias úteis para refeição (seg-sex, exclui feriados). Default 0. */
  diasUteis?: number;
  /**
   * Dias úteis para DSR (CLT: inclui sábado como dia útil de descanso).
   * Default = 25 (5 domingos × mês comum). Em mês com feriado em dia útil, usa 24.
   */
  diasUteisDSR?: number;
  /** Dias de descanso remunerado (domingos + feriados). Default = 30 - diasUteisDSR. */
  diasDescanso?: number;
  /** Vale refeição (R$ por dia útil). */
  refeicaoDiaria?: number;
  /** Ajuda de custo (R$ fixo mensal). */
  ajudaCustoMensal?: number;
  /** Quantidade de dependentes para IRRF. */
  dependentesIR?: number;
  /**
   * Regime de contratação. Default `true` (CLT — calcula INSS/IRRF/FGTS
   * e todas as provisões). Quando `false` (PJ):
   *   - zera impostos/provisões (INSS, IRRF, FGTS, 13º, férias)
   *   - zera variáveis e HE (horas extras, noturno, DSR, VR por dia)
   *   - zera periculosidade automática (o valor fixo já é o acordado)
   *   - permanece: salário proporcional (valor fixo) + ajuda de custo fixa
   * `salarioBaseCheio` no PJ = valor mensal cheio (ex.: 4000), sem somar 30%.
   */
  isClt?: boolean;
}

export interface PayrollBreakdown {
  // Vencimentos
  salarioProporcional: number;
  periculosidade: number;
  horasExtrasValor: number;
  adicionalNoturnoValor: number;
  dsr: number;
  refeicao: number;
  ajudaCusto: number;
  /** Remuneração (salário+peric+HE+noturno+DSR) — sem VR/ajuda. */
  totalBruto: number;
  baseTributavel: number; // exclui refeição e ajuda de custo (não compõem base prev/IR)
  /** Base só de IRRF mensal (= salário + peric; sem HE/noturno). */
  baseIrrfMensal: number;

  // Deduções (descontos do funcionário)
  inss: number;
  irrf: number;
  fgts: number; // depósito do empregador, mas mostrado junto
  totalDeducoes: number; // INSS + IRRF (descontos do funcionário)

  // Provisões mensais (custo da empresa)
  provisaoDecimoTerceiro: number;
  provisaoFerias: number;
  provisaoTercoFerias: number;
  provisaoFGTSsobreFerias13: number;
  provisaoINSSsobreFerias13: number;
  totalProvisoes: number;

  // Custo total para a empresa = Bruto + FGTS + Provisões
  custoTotalEmpresa: number;
  // Líquido a receber = Bruto - INSS - IRRF
  liquidoFuncionario: number;
}

export function calcularFolha(input: PayrollInput): PayrollBreakdown {
  const {
    salarioBaseCheio,
    diasTrabalhados = 30,
    horasMensais = 220,
    periculosidadePct = PERICULOSIDADE_PADRAO,
    multiplicadorHE = 1.6,
    multiplicadorAdicNot = 1.8,
    aplicarPericulosidade = true,
    aplicarDsr = false,
    inssModo = "flat",
    inssFlatPct = 12,
    irrfModo = "flat",
    irrfFlatPct = 22,
    irrfIsentoAte = IRRF_ISENTO_ATE,
    fgtsNoLiquido = false,
    diasUteisDSR = 25,
    ajudaCustoMensal = 0,
    dependentesIR = 0,
    isClt = true,
  } = input;

  // PJ: valor fixo mensal — sem HE, noturno, VR, DSR nem periculosidade automática.
  const horasExtras = isClt ? (input.horasExtras ?? 0) : 0;
  const horasNoturnas = isClt ? (input.horasNoturnas ?? 0) : 0;
  const diasUteis = isClt ? (input.diasUteis ?? 0) : 0;
  const refeicaoDiaria = isClt ? (input.refeicaoDiaria ?? 0) : 0;
  const vtDesconto = isClt ? (input.vtDesconto ?? 0) : 0;
  const aplicarDsrEfetivo = isClt && aplicarDsr;
  const aplicarPericulosidadeEfetivo = isClt && aplicarPericulosidade;
  const pericPctEfetivo = aplicarPericulosidadeEfetivo ? periculosidadePct : 0;

  const diasDescanso = input.diasDescanso ?? Math.max(0, 30 - diasUteisDSR);

  // 1) Vencimentos
  const salarioProporcional = r2((salarioBaseCheio / 30) * diasTrabalhados);
  // Periculosidade somada (CLT: base do cadastro é SEM peric). PJ: nunca soma — o
  // valor fixo cadastrado já é o total acordado (ex.: R$ 4.000).
  const periculosidade = aplicarPericulosidadeEfetivo ? r2(salarioProporcional * pericPctEfetivo) : 0;

  // Hora cheia baseada no salário CHEIO COM periculosidade (Súmula 132 TST): a peric
  // integra a base de cálculo de HE e adicional noturno. valorHora = base × (1+peric) ÷ horas.
  const fatorPeric = aplicarPericulosidadeEfetivo ? 1 + pericPctEfetivo : 1;
  const valorHoraNormal = horasMensais > 0 ? (salarioBaseCheio * fatorPeric) / horasMensais : 0;
  const horasExtrasValor = r2(valorHoraNormal * multiplicadorHE * horasExtras);
  const adicionalNoturnoValor = r2(valorHoraNormal * multiplicadorAdicNot * horasNoturnas);

  // DSR sobre HE + Adicional Noturno — desligado no modelo Torres (e sempre off em PJ).
  const dsr = (aplicarDsrEfetivo && diasUteisDSR > 0)
    ? r2((horasExtrasValor + adicionalNoturnoValor) * (diasDescanso / diasUteisDSR))
    : 0;

  const refeicao = r2(refeicaoDiaria * diasUteis);
  const ajudaCusto = r2(ajudaCustoMensal);

  // Base tributável (INSS/FGTS) — exclui benefícios indenizatórios (VR/ajuda).
  // HE/noturno entram aqui quando lançados na folha do período.
  const baseTributavel = r2(
    salarioProporcional + periculosidade + horasExtrasValor + adicionalNoturnoValor + dsr
  );
  // Quadro Remuneração: só vencimentos (sem VR/ajuda — esses vão em Benefícios).
  const totalBruto = baseTributavel;
  // Base IRRF mensal: HE/noturno pagos à parte → fora da base (29/07/2026).
  const baseIrrfMensal = r2(salarioProporcional + periculosidade);

  // 2) Deduções — só CLT tem INSS/IRRF/FGTS. Não-CLT (PJ, fixo) zera tudo.
  // INSS: modelo Torres usa 12% fixo; "progressivo" mantém a tabela oficial com teto.
  const inss = isClt
    ? (inssModo === "flat" ? r2(baseTributavel * (inssFlatPct / 100)) : calcularINSS(baseTributavel))
    : 0;
  // IRRF flat: isento se salário+peric ≤ 5k; senão 22% sobre essa base (sem HE).
  const irrf = isClt
    ? (irrfModo === "flat"
        ? (baseIrrfMensal <= irrfIsentoAte ? 0 : r2(baseIrrfMensal * (irrfFlatPct / 100)))
        : calcularIRRF(baseTributavel, inss, dependentesIR))
    : 0;
  const fgts = isClt ? r2(baseTributavel * FGTS_ALIQUOTA) : 0;
  const totalDeducoes = r2(inss + irrf);

  // 3) Provisões mensais (sobre salário cheio — convenção contábil).
  // Não-CLT não acumula férias / 13º / encargos sobre provisões.
  const provisaoDecimoTerceiro = isClt ? r2(salarioBaseCheio / 12) : 0;
  const provisaoFerias = isClt ? r2(salarioBaseCheio / 12) : 0;
  const provisaoTercoFerias = isClt ? r2(provisaoFerias / 3) : 0;
  const baseProvisoes = provisaoDecimoTerceiro + provisaoFerias + provisaoTercoFerias;
  const provisaoFGTSsobreFerias13 = isClt ? r2(baseProvisoes * FGTS_ALIQUOTA) : 0;
  const provisaoINSSsobreFerias13 = isClt ? r2(baseProvisoes * INSS_PROVISAO_FERIAS_13) : 0;
  const totalProvisoes = r2(
    provisaoDecimoTerceiro + provisaoFerias + provisaoTercoFerias +
    provisaoFGTSsobreFerias13 + provisaoINSSsobreFerias13
  );

  // Custo da empresa: remuneração + benefícios (VR/ajuda) + FGTS.
  // Provisões (13º/férias/1/3) NÃO entram — só informativas (decisão 29/07/2026).
  // Não-CLT = remuneração (+ ajuda se houver), sem encargos.
  const custoTotalEmpresa = r2(totalBruto + refeicao + ajudaCusto + fgts);
  // Líquido modelo Torres: Total tributável − INSS − IRRF − VT.
  // (FGTS NÃO desconta do líquido — é depósito do empregador, decisão do dono
  // 26/06/2026; fica fgtsNoLiquido=false. Benefícios indenizatórios como VR/ajuda
  // ficam numa tabela separada e não entram no líquido salarial.)
  const liquidoFuncionario = r2(
    baseTributavel - inss - irrf - (fgtsNoLiquido ? fgts : 0) - vtDesconto
  );

  return {
    salarioProporcional,
    periculosidade,
    horasExtrasValor,
    adicionalNoturnoValor,
    dsr,
    refeicao,
    ajudaCusto,
    totalBruto,
    baseTributavel,
    baseIrrfMensal,
    inss,
    irrf,
    fgts,
    totalDeducoes,
    provisaoDecimoTerceiro,
    provisaoFerias,
    provisaoTercoFerias,
    provisaoFGTSsobreFerias13,
    provisaoINSSsobreFerias13,
    totalProvisoes,
    custoTotalEmpresa,
    liquidoFuncionario,
  };
}

/**
 * Seleciona o salário vigente na data de referência:
 * último registro com effective_date <= referenceDate (YYYY-MM-DD).
 * Desempate: effective_date DESC, created_at DESC, id DESC.
 * Fonte canônica compartilhada entre cadastro (salary-summary) e Balanço (rh-summary).
 */
export function selectSalaryVigenteFromHistory<T extends {
  id?: number | string;
  effective_date?: string | null;
  effectiveDate?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
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

/** Último dia do mês civil (YYYY-MM-DD) a partir de year/month 1–12. */
export function endOfMonthYmd(year: number, month: number): string {
  const y = Number(year);
  const m = Number(month);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
