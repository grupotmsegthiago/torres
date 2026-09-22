/**
 * Precificação patrimonial (planilha VIGILANTES 2026).
 * Módulo próprio. Não lê a tabela comercial de escolta.
 */

export const PATRIMONIAL_SCALES = {
  "12 x 36": { days: 15.5, weekdays: "Seg a Dom", employeesPerPost: 2 },
  "6 x 1": { days: 26, weekdays: "Seg a Sáb", employeesPerPost: 1 },
  "5 x 1": { days: 26, weekdays: "Seg a Dom", employeesPerPost: 1 },
  "5 x 2": { days: 23, weekdays: "Seg a Sex", employeesPerPost: 1 },
} as const;

export type PatrimonialScale = keyof typeof PATRIMONIAL_SCALES;

export type RateItem = { name: string; percent: number };

export type PatrimonialPricingParams = {
  periculosidadeRate: number;
  nightHours: number;
  nightRate: number;
  dsrRate: number;
  he60Rate: number;
  he100Rate: number;
  holidayRate: number;
  hourDivisor: number;
  vrDaily: number;
  vrDiscountRate: number;
  convenio: number;
  vaComplement: number;
  lifeInsurance: number;
  vtDaily: number;
  vtDiscountRate: number;
  uniformUnarmed: number;
  uniformArmed: number;
  analiseRisco: number;
  reciclagem: number;
  rh: number;
  ppra: number;
  ajudaCusto: number;
  ppr: number;
  issRate: number;
  pisRate: number;
  cofinsRate: number;
  taxaAdmRate: number;
  lucroRate: number;
  chargeItems: RateItem[];
  provisionItems: RateItem[];
};

export type PatrimonialPostInput = {
  salary: number;
  gratificationRate: number;
  armed: boolean;
  night: boolean;
  scale: PatrimonialScale;
  posts: number;
  intervalIndenizado: boolean;
  he60Hours: number;
  he100Hours: number;
  holidayHours: number;
  /** A planilha deixa o DSR do feriado em branco na linha de exemplo. */
  holidayDsr: boolean;
};

export type PatrimonialPostResult = {
  employees: number;
  days: number;
  weekdays: string;
  salary: number;
  gratification: number;
  periculosidade: number;
  nightAdditional: number;
  dsrNight: number;
  heValue: number;
  dsrHe: number;
  holidayProvision: number;
  dsrHoliday: number;
  overtime: number;
  interval: number;
  ppr: number;
  vr: number;
  va: number;
  lifeInsurance: number;
  convenio: number;
  benefits: number;
  transport: number;
  indirect: number;
  charges: number;
  provision: number;
  ajudaCusto: number;
  costPerEmployee: number;
  pricePerEmployee: number;
  pricePerPost: number;
  lineCost: number;
  lineTax: number;
  lineMargin: number;
  lineTotal: number;
  taxRate: number;
  marginRate: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumRates(items: RateItem[]): number {
  return items.reduce((acc, item) => acc + (Number(item.percent) || 0), 0) / 100;
}

export function calcPatrimonialPost(
  input: PatrimonialPostInput,
  params: PatrimonialPricingParams,
): PatrimonialPostResult {
  const scale = PATRIMONIAL_SCALES[input.scale];
  const days = scale.days;
  const posts = Math.max(0, input.posts);
  const employeesPerPost = scale.employeesPerPost;
  const employees = posts * employeesPerPost;
  const divisor = params.hourDivisor || 220;

  const salary = input.salary;
  const gratification = salary * input.gratificationRate;
  const periculosidade = salary * params.periculosidadeRate;
  const nightAdditional = input.night
    ? ((salary + gratification + periculosidade) / divisor) * params.nightRate * (params.nightHours * days)
    : 0;
  const dsrNight = nightAdditional * params.dsrRate;
  const hourBase = (salary + gratification + periculosidade + nightAdditional + dsrNight) / divisor;

  const he60 = hourBase * params.he60Rate * input.he60Hours;
  const dsrHe60 = he60 * params.dsrRate;
  const he100 = hourBase * params.he100Rate * input.he100Hours;
  const dsrHe100 = he100 * params.dsrRate;
  const holiday = hourBase * params.holidayRate * input.holidayHours;
  const dsrHoliday = input.holidayDsr ? holiday * params.dsrRate : 0;
  const overtime = he60 + dsrHe60 + he100 + dsrHe100 + holiday + dsrHoliday;

  const interval = input.intervalIndenizado
    ? hourBase * params.he60Rate * days * 1.2
    : 0;

  const vr = params.vrDaily * days * (1 - params.vrDiscountRate);
  const benefits = params.convenio + params.vaComplement + params.lifeInsurance;
  const transport = (params.vtDaily * 2 * days) - (salary * params.vtDiscountRate);
  const uniform = input.armed ? params.uniformArmed : params.uniformUnarmed;
  const indirect = uniform + params.analiseRisco + params.reciclagem + params.rh + params.ppra;

  const chargeBase = salary + gratification + he60 + dsrHe60 + nightAdditional + dsrNight
    + interval + periculosidade + he100 + dsrHe100 + holiday + dsrHoliday;
  const chargeRate = sumRates(params.chargeItems);
  const provisionRate = sumRates(params.provisionItems);
  const charges = chargeBase * chargeRate;
  const provision = chargeBase * provisionRate;

  const costPerEmployee = salary + gratification + he60 + dsrHe60 + nightAdditional + dsrNight
    + interval + periculosidade + params.ppr + vr + benefits + transport + indirect
    + charges + provision + he100 + dsrHe100 + holiday + dsrHoliday + params.ajudaCusto;

  const taxRate = params.issRate + params.pisRate + params.cofinsRate;
  const marginRate = params.taxaAdmRate + params.lucroRate;
  const denominator = 1 - marginRate - taxRate;
  const pricePerEmployee = denominator > 0 ? costPerEmployee / denominator : 0;
  const pricePerPost = pricePerEmployee * employeesPerPost;

  const lineCost = costPerEmployee * employees;
  const lineTotal = pricePerEmployee * employees;
  const lineTax = lineTotal * taxRate;
  const lineMargin = lineTotal * marginRate;

  return {
    employees,
    days,
    weekdays: scale.weekdays,
    salary: roundMoney(salary),
    gratification: roundMoney(gratification),
    periculosidade: roundMoney(periculosidade),
    nightAdditional: roundMoney(nightAdditional),
    dsrNight: roundMoney(dsrNight),
    heValue: roundMoney(he60 + he100),
    dsrHe: roundMoney(dsrHe60 + dsrHe100),
    holidayProvision: roundMoney(holiday),
    dsrHoliday: roundMoney(dsrHoliday),
    overtime: roundMoney(overtime),
    interval: roundMoney(interval),
    ppr: roundMoney(params.ppr),
    vr: roundMoney(vr),
    va: roundMoney(params.vaComplement),
    lifeInsurance: roundMoney(params.lifeInsurance),
    convenio: roundMoney(params.convenio),
    benefits: roundMoney(benefits),
    transport: roundMoney(transport),
    indirect: roundMoney(indirect),
    charges: roundMoney(charges),
    provision: roundMoney(provision),
    ajudaCusto: roundMoney(params.ajudaCusto),
    costPerEmployee: roundMoney(costPerEmployee),
    pricePerEmployee: roundMoney(pricePerEmployee),
    pricePerPost: roundMoney(pricePerPost),
    lineCost: roundMoney(lineCost),
    lineTax: roundMoney(lineTax),
    lineMargin: roundMoney(lineMargin),
    lineTotal: roundMoney(lineTotal),
    taxRate,
    marginRate,
  };
}

export type PatrimonialMarginLevel = "bloqueado" | "atencao" | "ok" | "otimo";
export type PatrimonialReleaseMode = "bloqueado" | "diretoria" | "automatica";

export function patrimonialMarginLevel(percent: number): PatrimonialMarginLevel {
  const value = Math.round((Number(percent) || 0) * 10) / 10;
  if (value < 5) return "bloqueado";
  if (value < 10) return "atencao";
  if (value <= 10) return "ok";
  return "otimo";
}

/** De 5% a 10% a diretoria autoriza. Acima de 10% libera sozinha. Abaixo de 5% não segue. */
export function patrimonialReleaseMode(percent: number): PatrimonialReleaseMode {
  const value = Math.round((Number(percent) || 0) * 10) / 10;
  if (value < 5) return "bloqueado";
  if (value <= 10) return "diretoria";
  return "automatica";
}

export function patrimonialNegotiatedMargin(input: {
  totalCost: number;
  negotiatedPrice: number;
  taxRate: number;
  taxaAdmRate: number;
}): { lucroValue: number; taxaAdmValue: number; taxValue: number; lucroPercent: number } {
  const price = roundMoney(input.negotiatedPrice);
  const cost = roundMoney(input.totalCost);
  const taxValue = roundMoney(price * (Number(input.taxRate) || 0));
  const taxaAdmValue = roundMoney(price * (Number(input.taxaAdmRate) || 0));
  const lucroValue = roundMoney(price - cost - taxValue - taxaAdmValue);
  const lucroPercent = price > 0 ? Math.round((lucroValue / price) * 1000) / 10 : 0;
  return { lucroValue, taxaAdmValue, taxValue, lucroPercent };
}

export function scaleProposalLineTotals(lineTotals: number[], negotiatedPrice: number): number[] {
  const list = roundMoney(lineTotals.reduce((acc, value) => acc + (Number(value) || 0), 0));
  const target = roundMoney(negotiatedPrice);
  if (lineTotals.length === 0) return [];
  if (list <= 0) return lineTotals.map(() => 0);
  if (Math.abs(target - list) < 0.005) return lineTotals.map((value) => roundMoney(value));
  const factor = target / list;
  const scaled = lineTotals.map((value) => roundMoney((Number(value) || 0) * factor));
  const drift = roundMoney(target - scaled.reduce((acc, value) => acc + value, 0));
  scaled[scaled.length - 1] = roundMoney(scaled[scaled.length - 1] + drift);
  return scaled;
}

export function sumPatrimonialLines(lines: PatrimonialPostResult[]) {
  const totalCost = roundMoney(lines.reduce((acc, line) => acc + line.lineCost, 0));
  const totalTax = roundMoney(lines.reduce((acc, line) => acc + line.lineTax, 0));
  const totalMargin = roundMoney(lines.reduce((acc, line) => acc + line.lineMargin, 0));
  const totalPrice = roundMoney(lines.reduce((acc, line) => acc + line.lineTotal, 0));
  return { totalCost, totalTax, totalMargin, totalPrice };
}

export const DEFAULT_CHARGE_ITEMS: RateItem[] = [
  { name: "INSS patronal", percent: 22 },
  { name: "FGTS", percent: 12 },
];

export const DEFAULT_PROVISION_ITEMS: RateItem[] = [
  { name: "FGTS rescisão", percent: 5 },
  { name: "Férias + 1/3", percent: 11.11 },
  { name: "INSS férias", percent: 2.87 },
  { name: "FGTS férias", percent: 1.33 },
  { name: "SAT férias", percent: 0.33 },
  { name: "13º", percent: 8.33 },
  { name: "INSS 13º", percent: 2.15 },
  { name: "SAT 13º", percent: 0.25 },
  { name: "FGTS 13º", percent: 1 },
];

export const DEFAULT_ROLES = [
  { name: "SUPERVISOR", salary: 3969.05 },
  { name: "VIGILANTE", salary: 2271.74 },
  { name: "INSPETOR", salary: 3287.45 },
  { name: "OPERADOR DE MONITORAMENTO", salary: 2271.74 },
] as const;

/** Funções da composição da planilha, para adicionar na proposta. */
export const FUNCTION_TEMPLATES = [
  { label: "Vigilante diurno", role: "VIGILANTE", scale: "6 x 1" as PatrimonialScale, night: false, armed: false, gratificationPercent: 0, intervalIndenizado: true, he100Hours: 8, holidayHours: 8 },
  { label: "Vigilante noturno", role: "VIGILANTE", scale: "12 x 36" as PatrimonialScale, night: true, armed: false, gratificationPercent: 0, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Vigilante condutor diurno", role: "VIGILANTE", scale: "5 x 2" as PatrimonialScale, night: false, armed: false, gratificationPercent: 10, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Vigilante condutor noturno", role: "VIGILANTE", scale: "6 x 1" as PatrimonialScale, night: true, armed: false, gratificationPercent: 10, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Vigilante líder diurno", role: "VIGILANTE", scale: "12 x 36" as PatrimonialScale, night: false, armed: false, gratificationPercent: 12, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Vigilante líder noturno", role: "VIGILANTE", scale: "12 x 36" as PatrimonialScale, night: true, armed: false, gratificationPercent: 12, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Operador de monitoramento diurno", role: "OPERADOR DE MONITORAMENTO", scale: "12 x 36" as PatrimonialScale, night: false, armed: false, gratificationPercent: 11.77, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Operador de monitoramento noturno", role: "OPERADOR DE MONITORAMENTO", scale: "12 x 36" as PatrimonialScale, night: true, armed: false, gratificationPercent: 11.77, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Supervisor diurno", role: "SUPERVISOR", scale: "5 x 2" as PatrimonialScale, night: false, armed: false, gratificationPercent: 20, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Supervisor noturno", role: "SUPERVISOR", scale: "12 x 36" as PatrimonialScale, night: true, armed: false, gratificationPercent: 0, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
  { label: "Inspetor diurno", role: "INSPETOR", scale: "5 x 2" as PatrimonialScale, night: false, armed: false, gratificationPercent: 0, intervalIndenizado: false, he100Hours: 0, holidayHours: 0 },
] as const;
