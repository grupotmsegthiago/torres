import { useEffect, useState, useCallback } from "react";

/**
 * Configuração da Meta de Faturamento — persistida no localStorage e
 * compartilhada entre Custos Fixos e Balanço Gerencial.
 *
 * Defaults:
 *  - Lucro mínimo alvo: 35% (sobre faturamento)
 *  - Imposto sobre faturamento: 16% (Lucro Presumido típico para vigilância)
 *  - Custos variáveis: 15% do faturamento (combustível + pedágio + manutenção)
 *
 * Pode ser substituído via tela "Custos Fixos" → seção Meta.
 */
export interface MetaConfig {
  lucroPct: number;
  impostoPct: number;
  custoVarPct: number;
}

const STORAGE_KEYS = {
  lucro: "torres_margem_lucro_pct",
  imposto: "torres_imposto_pct",
  custoVar: "torres_custo_var_pct",
} as const;

export const META_DEFAULTS: MetaConfig = {
  lucroPct: 35,
  impostoPct: 16,
  custoVarPct: 15,
};

function readNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  const n = Number(stored);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : fallback;
}

export function loadMetaConfig(): MetaConfig {
  return {
    lucroPct: readNumber(STORAGE_KEYS.lucro, META_DEFAULTS.lucroPct),
    impostoPct: readNumber(STORAGE_KEYS.imposto, META_DEFAULTS.impostoPct),
    custoVarPct: readNumber(STORAGE_KEYS.custoVar, META_DEFAULTS.custoVarPct),
  };
}

export function saveMetaConfig(cfg: MetaConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.lucro, String(cfg.lucroPct));
  localStorage.setItem(STORAGE_KEYS.imposto, String(cfg.impostoPct));
  localStorage.setItem(STORAGE_KEYS.custoVar, String(cfg.custoVarPct));
  // Notifica outras abas/telas (storage event não dispara na MESMA aba)
  window.dispatchEvent(new CustomEvent("torres:meta-config-changed", { detail: cfg }));
}

/**
 * Hook reativo: carrega a configuração e mantém sincronizada com mudanças
 * em outras abas (storage event) e na MESMA aba (evento custom).
 */
export function useMetaConfig(): [MetaConfig, (cfg: Partial<MetaConfig>) => void] {
  const [cfg, setCfg] = useState<MetaConfig>(() => loadMetaConfig());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && Object.values(STORAGE_KEYS).includes(e.key as any)) {
        setCfg(loadMetaConfig());
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<MetaConfig>).detail;
      if (detail) setCfg(detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("torres:meta-config-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("torres:meta-config-changed", onCustom);
    };
  }, []);

  const update = useCallback((patch: Partial<MetaConfig>) => {
    setCfg((cur) => {
      const next = { ...cur, ...patch };
      saveMetaConfig(next);
      return next;
    });
  }, []);

  return [cfg, update];
}

export interface MetaResult {
  config: MetaConfig;
  custoFixoMensal: number;
  /** Meta REALISTA — cobre custos fixos, RH, custos variáveis E impostos */
  realista: {
    fator: number; // 1 - imposto - custVar - lucro
    valida: boolean;
    mensal: number;
    diaria: number;
    semanal: number;
    anual: number;
    decomposicao: {
      faturamento: number;
      impostos: number;
      custosVariaveis: number;
      custosFixos: number;
      lucro: number;
    };
  };
  /** Meta SIMPLIFICADA — cobre apenas custos fixos + RH (ignora impostos e variáveis) */
  simplificada: {
    fator: number; // 1 - lucro
    mensal: number;
    diaria: number;
    semanal: number;
    anual: number;
    lucro: number; // lucro nominal se bater a meta
  };
}

/**
 * Calcula a Meta de Faturamento a partir do custo fixo mensal (estrutura + RH)
 * e da configuração de margens/impostos/variáveis.
 *
 * Fórmula REALISTA (cobre TUDO):
 *   Faturamento × (1 − imposto% − custoVar%) − CustoFixo = lucro% × Faturamento
 *   ⇒ Faturamento = CustoFixo / (1 − imposto% − custoVar% − lucro%)
 *
 * Fórmula SIMPLIFICADA (a antiga — só cobre fixo, ignora imposto/variável):
 *   Faturamento = CustoFixo / (1 − lucro%)
 */
export function calcMeta(custoFixoMensal: number, cfg: MetaConfig): MetaResult {
  const lucro = cfg.lucroPct / 100;
  const imp = cfg.impostoPct / 100;
  const cv = cfg.custoVarPct / 100;

  const fatorReal = 1 - imp - cv - lucro;
  const validaReal = fatorReal > 0;
  const metaMensalReal = validaReal ? custoFixoMensal / fatorReal : 0;

  const fatorSimp = 1 - lucro;
  const metaMensalSimp = fatorSimp > 0 ? custoFixoMensal / fatorSimp : 0;

  return {
    config: cfg,
    custoFixoMensal,
    realista: {
      fator: fatorReal,
      valida: validaReal,
      mensal: metaMensalReal,
      diaria: metaMensalReal / 30,
      semanal: (metaMensalReal / 30) * 7,
      anual: metaMensalReal * 12,
      decomposicao: {
        faturamento: metaMensalReal,
        impostos: metaMensalReal * imp,
        custosVariaveis: metaMensalReal * cv,
        custosFixos: custoFixoMensal,
        lucro: metaMensalReal * lucro,
      },
    },
    simplificada: {
      fator: fatorSimp,
      mensal: metaMensalSimp,
      diaria: metaMensalSimp / 30,
      semanal: (metaMensalSimp / 30) * 7,
      anual: metaMensalSimp * 12,
      lucro: metaMensalSimp - custoFixoMensal,
    },
  };
}

export const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
