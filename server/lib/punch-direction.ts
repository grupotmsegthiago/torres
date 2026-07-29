/**
 * Direção de batidas (in/out/unknown) — Correção 1.
 *
 * - Lançamento manual: somente `in` | `out` (sem fallback silencioso).
 * - RHID/AFD: não inventa direção. Mapeamento automático só com feature flag
 *   + campos documentados comprovados por payload real (lista vazia até evidência).
 * - `raw_event` permanece imutável; classificação vai em `direction_missing_reason`.
 */

export type PunchDirection = "in" | "out";
export type PunchDirectionOrUnknown = PunchDirection | "unknown";

export type DirectionMissingReason =
  | "afd_no_direction_field"
  | "unrecognized_direction_value"
  | "normalize_disabled"
  | "manual_rejected";

/** Campos AFD elegíveis a mapeamento — VAZIO até SQL/Parte B comprovar chave confiável. */
export const RHID_AFD_DIRECTION_FIELD_CANDIDATES: readonly string[] = Object.freeze([]);

/**
 * Aliases documentados → in/out.
 * Só aplicados quando a feature flag está ON **e** o campo veio de
 * RHID_AFD_DIRECTION_FIELD_CANDIDATES (não varrer o payload inteiro).
 */
export const RHID_DIRECTION_VALUE_ALIASES: Readonly<Record<string, PunchDirection>> = Object.freeze({
  in: "in",
  entrada: "in",
  "1": "in",
  out: "out",
  saida: "out",
  saída: "out",
  "2": "out",
});

export function isRhidDirectionNormalizeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(env.RHID_DIRECTION_NORMALIZE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export type ManualDirectionResult =
  | { ok: true; direction: PunchDirection }
  | { ok: false; error: string; reason: "manual_rejected" };

/** Valida direction para CREATE/UPDATE de batida manual ou PATCH. */
export function parseRequiredManualDirection(raw: unknown): ManualDirectionResult {
  if (raw === undefined || raw === null) {
    return {
      ok: false,
      error: "direction obrigatória: informe exatamente \"in\" (Entrada) ou \"out\" (Saída).",
      reason: "manual_rejected",
    };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: "direction inválida: use \"in\" ou \"out\".",
      reason: "manual_rejected",
    };
  }
  const s = raw.trim().toLowerCase();
  if (!s || s === "unknown") {
    return {
      ok: false,
      error: "direction obrigatória: \"unknown\", vazio ou omitido não são aceitos. Use \"in\" ou \"out\".",
      reason: "manual_rejected",
    };
  }
  if (s === "in" || s === "out") return { ok: true, direction: s };
  return {
    ok: false,
    error: `direction inválida ("${raw}"): aceite apenas "in" ou "out".`,
    reason: "manual_rejected",
  };
}

export type AfdDirectionResolution = {
  direction: PunchDirectionOrUnknown;
  missingReason: DirectionMissingReason | null;
  /** Campo usado quando houve mapeamento (nunca logar valor bruto sensível). */
  matchedField: string | null;
};

/**
 * Resolve direction de um registro AFD sem mutar o payload.
 * Sem candidatos documentados ou com flag OFF → unknown + reason (não infere par/ímpar).
 */
export function resolveAfdRecordDirection(
  rec: Record<string, unknown> | null | undefined,
  opts: { normalizeEnabled?: boolean; fieldCandidates?: readonly string[] } = {},
): AfdDirectionResolution {
  const normalizeEnabled = opts.normalizeEnabled ?? isRhidDirectionNormalizeEnabled();
  const candidates = opts.fieldCandidates ?? RHID_AFD_DIRECTION_FIELD_CANDIDATES;

  if (!normalizeEnabled) {
    return {
      direction: "unknown",
      missingReason: "afd_no_direction_field",
      matchedField: null,
    };
  }

  if (!candidates.length) {
    return {
      direction: "unknown",
      missingReason: "afd_no_direction_field",
      matchedField: null,
    };
  }

  if (!rec || typeof rec !== "object") {
    return {
      direction: "unknown",
      missingReason: "afd_no_direction_field",
      matchedField: null,
    };
  }

  let sawNonEmpty = false;
  for (const field of candidates) {
    if (!(field in rec)) continue;
    const rawVal = rec[field];
    if (rawVal === undefined || rawVal === null || rawVal === "") continue;
    sawNonEmpty = true;
    const key = String(rawVal).trim().toLowerCase();
    const mapped = RHID_DIRECTION_VALUE_ALIASES[key];
    if (mapped) {
      return { direction: mapped, missingReason: null, matchedField: field };
    }
  }

  if (sawNonEmpty) {
    return {
      direction: "unknown",
      missingReason: "unrecognized_direction_value",
      matchedField: null,
    };
  }

  return {
    direction: "unknown",
    missingReason: "afd_no_direction_field",
    matchedField: null,
  };
}

/** Patch de adoption: SOMENTE external_id — nunca direction. */
export function buildExternalIdAdoptionPatch(externalId: string): { external_id: string } {
  return { external_id: externalId };
}

export function adoptionPatchPreservesDirection(patch: Record<string, unknown>): boolean {
  return !("direction" in patch) && !("direction_missing_reason" in patch);
}
