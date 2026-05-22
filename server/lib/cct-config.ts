import { supabaseAdmin } from "../supabase";
import {
  CCT_CONFIG_SETTING_KEY,
  DEFAULT_CCT_CONFIG,
  cctConfigSchema,
  type CctConfig,
} from "@shared/cct-config";

let cache: { cfg: CctConfig; loadedAt: number } | null = null;
const TTL_MS = 30_000;

export async function getCctConfig(): Promise<CctConfig> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.cfg;
  try {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", CCT_CONFIG_SETTING_KEY)
      .limit(1);
    if (data && data.length > 0) {
      const parsed = JSON.parse(data[0].value);
      const cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...parsed });
      cache = { cfg, loadedAt: Date.now() };
      return cfg;
    }
  } catch (e) {
    console.error("[cct-config] erro ao ler settings, usando default:", e);
  }
  cache = { cfg: DEFAULT_CCT_CONFIG, loadedAt: Date.now() };
  return DEFAULT_CCT_CONFIG;
}

export async function saveCctConfig(input: unknown): Promise<CctConfig> {
  const cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...(input as object) });
  const value = JSON.stringify(cfg);
  const { data: existing } = await supabaseAdmin
    .from("system_settings")
    .select("id")
    .eq("key", CCT_CONFIG_SETTING_KEY)
    .limit(1);
  if (!existing || existing.length === 0) {
    await supabaseAdmin.from("system_settings").insert({ key: CCT_CONFIG_SETTING_KEY, value });
  } else {
    await supabaseAdmin
      .from("system_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", CCT_CONFIG_SETTING_KEY);
  }
  cache = { cfg, loadedAt: Date.now() };
  return cfg;
}

export function invalidateCctConfigCache() {
  cache = null;
}
