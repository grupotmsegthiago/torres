import { z } from "zod";

// Faixas da Cesta Básica II por assiduidade (SIEMACO e similares):
// - Sem falta no mês: valor cheio
// - 1 atestado/justificada (>=3 dias): valor reduzido
// - 2 atestados: valor mais reduzido
// - 3+ atestados ou faltas não justificadas: zera
export const cestaBasicaIIFaixasSchema = z.object({
  semFalta: z.number().nonnegative().default(0),
  umAtestado: z.number().nonnegative().default(0),
  doisAtestados: z.number().nonnegative().default(0),
  tresOuMaisAtestados: z.number().nonnegative().default(0),
});
export type CestaBasicaIIFaixas = z.infer<typeof cestaBasicaIIFaixasSchema>;

export const cctConfigSchema = z.object({
  label: z.string().min(1).default("CCT SP 2025/2026"),
  sindicato: z.string().default(""),
  salarioBase: z.number().nonnegative().default(2432.5),
  periculosidadePct: z.number().nonnegative().default(30),
  valeRefeicaoDia: z.number().nonnegative().default(43.0),
  valeAlimentacaoDia: z.number().nonnegative().default(0),
  cestaBasica: z.number().nonnegative().default(208.45),
  cestaBasicaIIFaixas: cestaBasicaIIFaixasSchema.optional(),
  escala: z.string().default(""),
  jornada: z.string().default(""),
  diasUteisMes: z.number().int().positive().default(22),
  encargosSociaisPct: z.number().nonnegative().default(80),
  horaExtraValor: z.number().nonnegative().default(22.99),
  pagamentoDiaUtil: z.number().int().positive().default(5),
  fgtsPct: z.number().nonnegative().default(8),
  inssPatronalPct: z.number().nonnegative().default(20),
  seguroVidaMensal: z.number().nonnegative().default(0),
});

export type CctConfig = z.infer<typeof cctConfigSchema>;

export const DEFAULT_CCT_CONFIG: CctConfig = cctConfigSchema.parse({});

// Backcompat — chave do system_settings legada (CCT vigilância).
export const CCT_CONFIG_SETTING_KEY = "cct_sp_config";

// Presets canônicos do sistema.
// `cargos` é case-insensitive e usa substring match (ex: "vigilante" casa
// tanto "Vigilante" quanto "Vigilante Líder").
export const CCT_PRESET_VIGILANCIA = "vigilancia";
export const CCT_PRESET_SIEMACO = "siemaco";

export type CctPreset = {
  key: string;
  label: string;
  sindicato: string;
  cargos: string[];
  config: CctConfig;
};

// CCT base do SIEMACO (Auxiliar de Limpeza) — valores informados pelo dono em 26/05/2026.
export const DEFAULT_SIEMACO_PRESET: CctPreset = {
  key: CCT_PRESET_SIEMACO,
  label: "CCT SIEMACO 2025/2026",
  sindicato: "SIEMACO",
  cargos: ["Auxiliar de Limpeza"],
  config: {
    label: "CCT SIEMACO 2025/2026",
    sindicato: "SIEMACO",
    salarioBase: 1837.40,
    periculosidadePct: 0,
    valeRefeicaoDia: 21.80,
    valeAlimentacaoDia: 0, // VA é mensal (R$ 151,91), tratado fora da fórmula diária
    cestaBasica: 0, // SIEMACO usa Cesta Básica II por assiduidade (faixas abaixo)
    cestaBasicaIIFaixas: {
      semFalta: 315.00,
      umAtestado: 240.00,
      doisAtestados: 140.00,
      tresOuMaisAtestados: 0,
    },
    escala: "5x2 (segunda a sexta)",
    jornada: "Seg-Qui 07h-17h / Sex 07h-16h",
    diasUteisMes: 22,
    encargosSociaisPct: 80,
    horaExtraValor: 0,
    pagamentoDiaUtil: 5,
    fgtsPct: 8,
    inssPatronalPct: 20,
    seguroVidaMensal: 0,
  },
};

// CCT vigilância — valores default; o real fica em system_settings (preset vigilancia ou cct_sp_config legado).
export const DEFAULT_VIGILANCIA_PRESET: CctPreset = {
  key: CCT_PRESET_VIGILANCIA,
  label: "CCT SP Vigilância 2025/2026",
  sindicato: "SINDESP-SP",
  cargos: ["Vigilante", "Escolta", "Operador", "Operacional"],
  config: DEFAULT_CCT_CONFIG,
};

export function deriveCctTotals(cfg: CctConfig) {
  const periculosidade = +(cfg.salarioBase * (cfg.periculosidadePct / 100)).toFixed(2);
  const valeRefeicaoMes = +(cfg.valeRefeicaoDia * cfg.diasUteisMes).toFixed(2);
  const valeAlimentacaoMes = +((cfg.valeAlimentacaoDia || 0) * cfg.diasUteisMes).toFixed(2);
  const totalBruto = +(cfg.salarioBase + periculosidade + valeRefeicaoMes + valeAlimentacaoMes + cfg.cestaBasica).toFixed(2);
  return { periculosidade, valeRefeicaoMes, valeAlimentacaoMes, totalBruto };
}

// Resolve o preset CCT aplicável a um cargo. Match case-insensitive por substring.
export function resolvePresetKeyForCargo(cargo: string | null | undefined): string {
  const c = (cargo || "").toLowerCase();
  if (!c) return CCT_PRESET_VIGILANCIA;
  if (c.includes("limpeza")) return CCT_PRESET_SIEMACO;
  if (c.includes("vigilante") || c.includes("escolta") || c.includes("operador") || c.includes("operacional")) {
    return CCT_PRESET_VIGILANCIA;
  }
  // Adm/Gerente/Supervisor seguem CCT vigilância por enquanto (não foi pedido outro).
  return CCT_PRESET_VIGILANCIA;
}
