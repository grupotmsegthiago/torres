/**
 * Engine de Folha de Pagamento — Brasil 2025
 *
 * Implementa cálculo em cascata seguindo a legislação vigente e validado
 * contra planilha contábil de referência (caso EDIVANDO):
 *   Bruto R$ 7.359,26 / Deduções R$ 1.817,39 / Provisões R$ 576,13
 *
 * Ordem de cálculo:
 *   1) Salário proporcional (base ÷ 30 × dias_trabalhados)
 *   2) Periculosidade (30% sobre salário proporcional)
 *   3) Horas Extras (sal_h × 1,60 × horas_extras)
 *   4) Adicional Noturno (sal_h × 1,20 × horas_noturnas)
 *   5) DSR sobre HE + AdicNot
 *   6) Total Bruto Tributável (1+2+3+4+5)
 *   7) INSS progressivo 2025 (com teto)
 *   8) IRRF progressivo 2024+ (base = bruto - INSS - dependentes)
 *   9) FGTS 8% sobre bruto tributável
 *   10) Provisões: 13º, Férias, 1/3, FGTS s/ provisões, INSS s/ provisões
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
  /** Multiplicador adicional noturno (default 1.20 = 20% adicional). */
  multiplicadorAdicNot?: number;
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
   * e todas as provisões). Quando `false` (PJ, autônomo, fixo sem encargos),
   * o bruto vira líquido: zera todos os descontos legais e provisões.
   * Vencimentos (salário, periculosidade, HE, adic. noturno, DSR, VR, ajuda)
   * continuam sendo calculados normalmente — só os encargos/descontos somem.
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
  totalBruto: number;
  baseTributavel: number; // exclui refeição e ajuda de custo (não compõem base prev/IR)

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
    horasExtras = 0,
    horasNoturnas = 0,
    multiplicadorHE = 1.6,
    multiplicadorAdicNot = 1.2,
    diasUteis = 0,
    diasUteisDSR = 25,
    refeicaoDiaria = 0,
    ajudaCustoMensal = 0,
    dependentesIR = 0,
    isClt = true,
  } = input;

  const diasDescanso = input.diasDescanso ?? Math.max(0, 30 - diasUteisDSR);

  // 1) Vencimentos
  const salarioProporcional = r2((salarioBaseCheio / 30) * diasTrabalhados);
  const periculosidade = r2(salarioProporcional * periculosidadePct);

  // Hora cheia baseada no salário CHEIO (sem proporcional, sem peric — convenção CCT)
  const valorHoraNormal = horasMensais > 0 ? salarioBaseCheio / horasMensais : 0;
  const horasExtrasValor = r2(valorHoraNormal * multiplicadorHE * horasExtras);
  const adicionalNoturnoValor = r2(valorHoraNormal * multiplicadorAdicNot * horasNoturnas);

  // DSR sobre HE + Adicional Noturno (fórmula CLT: descanso ÷ úteis_DSR)
  const dsr = diasUteisDSR > 0
    ? r2((horasExtrasValor + adicionalNoturnoValor) * (diasDescanso / diasUteisDSR))
    : 0;

  const refeicao = r2(refeicaoDiaria * diasUteis);
  const ajudaCusto = r2(ajudaCustoMensal);

  // Base tributável (INSS/IRRF/FGTS) — exclui benefícios indenizatórios
  const baseTributavel = r2(
    salarioProporcional + periculosidade + horasExtrasValor + adicionalNoturnoValor + dsr
  );
  const totalBruto = r2(baseTributavel + refeicao + ajudaCusto);

  // 2) Deduções — só CLT tem INSS/IRRF/FGTS. Não-CLT (PJ, fixo) zera tudo.
  const inss = isClt ? calcularINSS(baseTributavel) : 0;
  const irrf = isClt ? calcularIRRF(baseTributavel, inss, dependentesIR) : 0;
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

  // Custo da empresa: CLT = bruto + FGTS + provisões. Não-CLT = bruto apenas
  // (já é o desembolso total). Líquido pro funcionário: CLT desconta INSS/IRRF,
  // não-CLT recebe o bruto integral.
  const custoTotalEmpresa = r2(totalBruto + fgts + totalProvisoes);
  const liquidoFuncionario = r2(totalBruto - inss - irrf);

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
