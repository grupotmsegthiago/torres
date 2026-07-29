import { supabaseAdmin } from "../supabase";
import {
  CCT_CONFIG_SETTING_KEY,
  CCT_PRESET_SIEMACO,
  CCT_PRESET_VIGILANCIA,
  DEFAULT_CCT_CONFIG,
  DEFAULT_SIEMACO_PRESET,
  DEFAULT_VIGILANCIA_PRESET,
  cctConfigSchema,
  resolvePresetKeyForCargo,
  type CctConfig,
  type CctPreset,
} from "@shared/cct-config";

// Cache simples em memória (TTL curto). Invalidação manual via invalidateCctConfigCache().
let cache: { presets: Record<string, CctPreset>; loadedAt: number } | null = null;
const TTL_MS = 30_000;

/** Default antigo do código (pré 29/07/2026) — seed gravou isso no banco. */
const LEGACY_HE_DIURNA_DEFAULT = 22.99;

/**
 * Vigilância Torres: HE diurna R$ 16 e noturna R$ 16,50.
 * Corrige na leitura:
 *  - legado 22,99 → 16
 *  - diurna ausente/0/NaN → 16  (senão calcularFolha cai em salário×1,6 ≈ R$ 24,26/h)
 *  - noturna ausente/0 → 16,50
 */
export function normalizeVigilanciaHeRates(cfg: CctConfig): CctConfig {
  let horaExtraValor = Number(cfg.horaExtraValor);
  let horaExtraNoturnaValor = Number(cfg.horaExtraNoturnaValor);
  if (
    !Number.isFinite(horaExtraValor) ||
    horaExtraValor <= 0 ||
    Math.abs(horaExtraValor - LEGACY_HE_DIURNA_DEFAULT) < 0.011
  ) {
    horaExtraValor = 16;
  }
  if (!Number.isFinite(horaExtraNoturnaValor) || horaExtraNoturnaValor <= 0) {
    horaExtraNoturnaValor = 16.5;
  }
  if (
    horaExtraValor === cfg.horaExtraValor &&
    horaExtraNoturnaValor === cfg.horaExtraNoturnaValor
  ) {
    return cfg;
  }
  return { ...cfg, horaExtraValor, horaExtraNoturnaValor };
}

function parseCctConfig(raw: unknown, presetKey?: string): CctConfig {
  const cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...((raw as object) || {}) });
  if (presetKey === CCT_PRESET_VIGILANCIA || !presetKey) {
    return normalizeVigilanciaHeRates(cfg);
  }
  return cfg;
}

async function loadAllPresetsRaw(): Promise<Record<string, CctPreset>> {
  const out: Record<string, CctPreset> = {};

  // 1) Lê tudo de cct_presets (tabela nova).
  try {
    const { data } = await supabaseAdmin
      .from("cct_presets")
      .select("key, label, sindicato, cargos, config");
    for (const row of data || []) {
      try {
        const key = (row as any).key as string;
        const cfg = parseCctConfig((row as any).config || {}, key);
        out[key] = {
          key,
          label: (row as any).label || cfg.label,
          sindicato: (row as any).sindicato || cfg.sindicato || "",
          cargos: (row as any).cargos || [],
          config: cfg,
        };
      } catch (e) {
        console.error("[cct-config] preset inválido em cct_presets, ignorando:", (row as any).key, e);
      }
    }
  } catch (e) {
    console.error("[cct-config] erro ao ler cct_presets:", e);
  }

  // 2) Backcompat: se preset 'vigilancia' não existe, herda do system_settings legado.
  if (!out[CCT_PRESET_VIGILANCIA]) {
    try {
      const { data } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", CCT_CONFIG_SETTING_KEY)
        .limit(1);
      if (data && data.length > 0) {
        const parsed = JSON.parse((data[0] as any).value);
        const cfg = parseCctConfig(parsed, CCT_PRESET_VIGILANCIA);
        out[CCT_PRESET_VIGILANCIA] = {
          ...DEFAULT_VIGILANCIA_PRESET,
          config: cfg,
        };
      }
    } catch (e) {
      console.error("[cct-config] erro ao ler cct_sp_config legado:", e);
    }
  }

  // 3) Fallbacks finais (defaults do código).
  if (!out[CCT_PRESET_VIGILANCIA]) out[CCT_PRESET_VIGILANCIA] = DEFAULT_VIGILANCIA_PRESET;
  if (!out[CCT_PRESET_SIEMACO]) out[CCT_PRESET_SIEMACO] = DEFAULT_SIEMACO_PRESET;

  return out;
}

async function loadPresets(): Promise<Record<string, CctPreset>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.presets;
  const presets = await loadAllPresetsRaw();
  cache = { presets, loadedAt: Date.now() };
  return presets;
}

export async function listCctPresets(): Promise<CctPreset[]> {
  const presets = await loadPresets();
  return Object.values(presets).sort((a, b) => a.key.localeCompare(b.key));
}

export async function getCctPreset(key: string): Promise<CctPreset> {
  const presets = await loadPresets();
  return presets[key] || presets[CCT_PRESET_VIGILANCIA] || DEFAULT_VIGILANCIA_PRESET;
}

export async function getCctPresetByCargo(cargo: string | null | undefined): Promise<CctPreset> {
  const key = resolvePresetKeyForCargo(cargo);
  return getCctPreset(key);
}

// Backcompat: getCctConfig() sempre retorna o preset 'vigilancia'.
export async function getCctConfig(): Promise<CctConfig> {
  const p = await getCctPreset(CCT_PRESET_VIGILANCIA);
  return p.config;
}

export async function getCctConfigByCargo(cargo: string | null | undefined): Promise<CctConfig> {
  const p = await getCctPresetByCargo(cargo);
  return p.config;
}

export async function savePreset(input: Partial<CctPreset> & { key: string }): Promise<CctPreset> {
  const cfg = parseCctConfig(input.config || {}, input.key);
  const payload = {
    key: input.key,
    label: input.label || cfg.label,
    sindicato: input.sindicato || cfg.sindicato || "",
    cargos: input.cargos || [],
    config: cfg,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabaseAdmin
    .from("cct_presets")
    .select("id")
    .eq("key", input.key)
    .limit(1);
  if (!existing || existing.length === 0) {
    await supabaseAdmin.from("cct_presets").insert(payload);
  } else {
    await supabaseAdmin.from("cct_presets").update(payload).eq("key", input.key);
  }
  // Backcompat: mantém system_settings sincronizado pro preset vigilancia
  // (caminhos legados ainda leem de lá enquanto não migrarem).
  if (input.key === CCT_PRESET_VIGILANCIA) {
    await syncLegacyCctSettings(cfg).catch(() => {});
  }
  invalidateCctConfigCache();
  return { key: payload.key, label: payload.label, sindicato: payload.sindicato, cargos: payload.cargos, config: cfg };
}

async function syncLegacyCctSettings(cfg: CctConfig) {
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
}

// Backcompat: saveCctConfig salva o preset vigilancia.
export async function saveCctConfig(input: unknown): Promise<CctConfig> {
  const cfg = parseCctConfig(input, CCT_PRESET_VIGILANCIA);
  const preset = await savePreset({
    key: CCT_PRESET_VIGILANCIA,
    label: cfg.label,
    sindicato: cfg.sindicato || "SINDESP-SP",
    cargos: ["Vigilante", "Escolta", "Operador", "Operacional"],
    config: cfg,
  });
  return preset.config;
}

// Seed: garante que os presets canônicos existem na tabela ao boot.
export async function ensureDefaultPresets(): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("cct_presets")
      .select("key");
    const existing = new Set((data || []).map((r: any) => r.key));

    // SIEMACO: cria se ainda não existe (não sobrescreve customizações).
    if (!existing.has(CCT_PRESET_SIEMACO)) {
      await supabaseAdmin.from("cct_presets").insert({
        key: DEFAULT_SIEMACO_PRESET.key,
        label: DEFAULT_SIEMACO_PRESET.label,
        sindicato: DEFAULT_SIEMACO_PRESET.sindicato,
        cargos: DEFAULT_SIEMACO_PRESET.cargos,
        config: DEFAULT_SIEMACO_PRESET.config,
      });
      console.log("[cct-config] preset SIEMACO criado (default)");
    }

    // Vigilancia: cria se não existe (ou se só existe no system_settings legado, herda).
    if (!existing.has(CCT_PRESET_VIGILANCIA)) {
      // Tenta herdar do system_settings primeiro.
      let cfg: CctConfig = DEFAULT_VIGILANCIA_PRESET.config;
      try {
        const { data: legacy } = await supabaseAdmin
          .from("system_settings")
          .select("value")
          .eq("key", CCT_CONFIG_SETTING_KEY)
          .limit(1);
        if (legacy && legacy.length > 0) {
          const parsed = JSON.parse((legacy[0] as any).value);
          cfg = parseCctConfig(parsed, CCT_PRESET_VIGILANCIA);
        }
      } catch {}
      await supabaseAdmin.from("cct_presets").insert({
        key: DEFAULT_VIGILANCIA_PRESET.key,
        label: cfg.label || DEFAULT_VIGILANCIA_PRESET.label,
        sindicato: cfg.sindicato || DEFAULT_VIGILANCIA_PRESET.sindicato,
        cargos: DEFAULT_VIGILANCIA_PRESET.cargos,
        config: cfg,
      });
      console.log("[cct-config] preset Vigilância criado (herdado do system_settings ou default)");
    } else {
      // Migra HE legado 22,99 → 16 / noturna 16,50 se o preset já existir no banco.
      try {
        const { data: vig } = await supabaseAdmin
          .from("cct_presets")
          .select("key, label, sindicato, cargos, config")
          .eq("key", CCT_PRESET_VIGILANCIA)
          .limit(1);
        if (vig && vig.length > 0) {
          const raw = (vig[0] as any).config || {};
          const before = Number(raw.horaExtraValor);
          const beforeN = Number(raw.horaExtraNoturnaValor);
          const needsHe =
            !Number.isFinite(before) ||
            before <= 0 ||
            Math.abs(before - LEGACY_HE_DIURNA_DEFAULT) < 0.011 ||
            !Number.isFinite(beforeN) ||
            beforeN <= 0;
          if (needsHe) {
            const cfg = parseCctConfig(raw, CCT_PRESET_VIGILANCIA);
            await supabaseAdmin
              .from("cct_presets")
              .update({ config: cfg, updated_at: new Date().toISOString() })
              .eq("key", CCT_PRESET_VIGILANCIA);
            await syncLegacyCctSettings(cfg).catch(() => {});
            invalidateCctConfigCache();
            console.log("[cct-config] HE vigilância migrada para 16 / 16,50");
          }
        }
      } catch (e) {
        console.error("[cct-config] migração HE vigilância falhou:", e);
      }
    }
  } catch (e) {
    console.error("[cct-config] ensureDefaultPresets falhou:", e);
  }
}

export function invalidateCctConfigCache() {
  cache = null;
}
