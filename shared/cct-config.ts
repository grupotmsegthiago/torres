import { z } from "zod";

export const cctConfigSchema = z.object({
  label: z.string().min(1).default("CCT SP 2025/2026"),
  salarioBase: z.number().nonnegative().default(2432.5),
  periculosidadePct: z.number().nonnegative().default(30),
  valeRefeicaoDia: z.number().nonnegative().default(43.0),
  cestaBasica: z.number().nonnegative().default(208.45),
  diasUteisMes: z.number().int().positive().default(22),
  encargosSociaisPct: z.number().nonnegative().default(80),
  horaExtraValor: z.number().nonnegative().default(22.99),
  pagamentoDiaUtil: z.number().int().positive().default(5),
});

export type CctConfig = z.infer<typeof cctConfigSchema>;

export const DEFAULT_CCT_CONFIG: CctConfig = cctConfigSchema.parse({});

export const CCT_CONFIG_SETTING_KEY = "cct_sp_config";

export function deriveCctTotals(cfg: CctConfig) {
  const periculosidade = +(cfg.salarioBase * (cfg.periculosidadePct / 100)).toFixed(2);
  const valeRefeicaoMes = +(cfg.valeRefeicaoDia * cfg.diasUteisMes).toFixed(2);
  const totalBruto = +(cfg.salarioBase + periculosidade + valeRefeicaoMes + cfg.cestaBasica).toFixed(2);
  return { periculosidade, valeRefeicaoMes, totalBruto };
}
