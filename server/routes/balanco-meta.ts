/**
 * Meta de faturamento do Balanço Gerencial — valor mensal definido pela Diretoria.
 * Leitura: admin/diretoria. Escrita: somente role === "diretoria".
 */
import type { Express } from "express";
import { requireAuth, requireAdminRole, requireDiretoriaStrict } from "../auth";
import { supabaseAdmin } from "../supabase";
import { getActiveVehicleCount } from "./fixed-costs";

export const BALANCO_META_SETTING_KEY = "balanco_meta_faturamento_mensal";
/** Piso/meta automática por viatura (legado do painel gestor). */
export const META_DIARIA_VIATURA_DEFAULT = 2000;

export type BalancoMetaPayload = {
  mensal: number;
  fonte: "diretoria" | "automatica";
  updatedBy: string | null;
  updatedAt: string | null;
  automatica: {
    diariaViatura: number;
    viaturas: number;
    mensal: number;
  };
};

function parseStoredMeta(raw: string | null | undefined): { mensal: number; updatedBy: string | null; updatedAt: string | null } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const mensal = Number(j?.mensal);
    if (!Number.isFinite(mensal) || mensal <= 0) return null;
    return {
      mensal: Math.round(mensal * 100) / 100,
      updatedBy: j?.updatedBy ? String(j.updatedBy) : null,
      updatedAt: j?.updatedAt ? String(j.updatedAt) : null,
    };
  } catch {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return { mensal: n, updatedBy: null, updatedAt: null };
    return null;
  }
}

async function buildAutomaticaMeta(): Promise<BalancoMetaPayload["automatica"]> {
  const viaturas = await getActiveVehicleCount();
  const diariaViatura = META_DIARIA_VIATURA_DEFAULT;
  return {
    diariaViatura,
    viaturas,
    mensal: diariaViatura * 30 * Math.max(viaturas, 1),
  };
}

export async function resolveBalancoMetaFaturamento(): Promise<BalancoMetaPayload> {
  const automatica = await buildAutomaticaMeta();
  try {
    const { data: rows } = await supabaseAdmin
      .from("system_settings")
      .select("value, updated_at")
      .eq("key", BALANCO_META_SETTING_KEY)
      .limit(1);
    const row = rows?.[0];
    const parsed = parseStoredMeta(row?.value);
    if (parsed) {
      return {
        mensal: parsed.mensal,
        fonte: "diretoria",
        updatedBy: parsed.updatedBy,
        updatedAt: parsed.updatedAt || (row?.updated_at ? String(row.updated_at) : null),
        automatica,
      };
    }
  } catch {
    /* fallback automática */
  }
  return {
    mensal: automatica.mensal,
    fonte: "automatica",
    updatedBy: null,
    updatedAt: null,
    automatica,
  };
}

export function registerBalancoMetaRoutes(app: Express) {
  app.get("/api/balanco/meta-faturamento", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const payload = await resolveBalancoMetaFaturamento();
      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Erro ao carregar meta" });
    }
  });

  app.put("/api/balanco/meta-faturamento", requireAuth, requireDiretoriaStrict, async (req, res) => {
    try {
      const mensal = Number(req.body?.mensal);
      if (!Number.isFinite(mensal) || mensal <= 0) {
        return res.status(400).json({ message: "Informe um valor mensal maior que zero." });
      }
      const rounded = Math.round(mensal * 100) / 100;
      const value = JSON.stringify({
        mensal: rounded,
        updatedBy: req.user?.email || req.user?.name || "diretoria",
        updatedAt: new Date().toISOString(),
      });
      const { data: existing } = await supabaseAdmin
        .from("system_settings")
        .select("id")
        .eq("key", BALANCO_META_SETTING_KEY)
        .limit(1);
      if (!existing?.length) {
        await supabaseAdmin.from("system_settings").insert({ key: BALANCO_META_SETTING_KEY, value });
      } else {
        await supabaseAdmin
          .from("system_settings")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("key", BALANCO_META_SETTING_KEY);
      }
      const payload = await resolveBalancoMetaFaturamento();
      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Erro ao salvar meta" });
    }
  });

  app.delete("/api/balanco/meta-faturamento", requireAuth, requireDiretoriaStrict, async (_req, res) => {
    try {
      await supabaseAdmin.from("system_settings").delete().eq("key", BALANCO_META_SETTING_KEY);
      const payload = await resolveBalancoMetaFaturamento();
      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Erro ao restaurar meta automática" });
    }
  });
}
