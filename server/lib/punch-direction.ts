/**
 * Direção de batidas (in/out/unknown) — Correção 1.
 *
 * - Lançamento manual: somente `in` | `out` (sem fallback silencioso).
 * - RHID/AFD: não inventa direção. Mapeamento automático só com feature flag
 *   + campos documentados comprovados por payload real (lista vazia — ver evidência).
 * - `raw_event` permanece imutável; classificação vai em `direction_missing_reason`.
 *
 * ## Evidência Parte B (competência 26/06→26/07/2026 exclus., 17 funcs, 1085 batidas)
 * - Device: rhid_cloud — sync via `/customerdb/afd.svc/a`.
 * - 301 unknown = 291 AFD (`source` null + `rhid_*`) + 10 manual.
 * - Payload AFD dos 291: campo `Tipo` presente e **sempre = 3**; ausentes
 *   direction/flow/tipo/event/inOut/InOut/status.
 * - `Tipo=3` também aparece em registros já classificados como in/out → NÃO é
 *   entrada/saída (no código, POST manual envia `Tipo: 3` como tipo de marcação AFD).
 * - Conclusão: endpoint AFD atual **não** fornece direção confiável.
 * - Manter: unknown + `afd_no_direction_field`, `RHID_DIRECTION_NORMALIZE=false`,
 *   sem inferência cronológica. Emp 36 (61/61 unknown) não auto-corrigir.
 *
 * ## 24 AFD com in/out (source null) — origem no código (sem alterar dados)
 * Sync AFD só insere `unknown`. Adoption só atualiza `external_id`.
 * Único write local de direction sem mudar source: `PATCH` → `updateLocalPunch`.
 * Hipótese sustentada: import AFD + edição humana posterior na UI admin.
 */

export type PunchDirection = "in" | "out";
export type PunchDirectionOrUnknown = PunchDirection | "unknown";

export type DirectionMissingReason =
  | "afd_no_direction_field"
  | "unrecognized_direction_value"
  | "normalize_disabled"
  | "manual_rejected";

/**
 * Campos AFD elegíveis a mapeamento.
 * VAZIO de propósito: Parte B comprovou que `Tipo` (único candidato) NÃO é direction.
 * Não incluir `Tipo` aqui.
 */
export const RHID_AFD_DIRECTION_FIELD_CANDIDATES: readonly string[] = Object.freeze([]);

/** Campo AFD avaliado e rejeitado como direção (evidência: sempre 3 em in/out/unknown). */
export const RHID_AFD_REJECTED_DIRECTION_FIELDS: readonly string[] = Object.freeze(["Tipo"]);

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
