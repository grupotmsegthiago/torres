/**
 * Fixture B — eventos do Torres (control_id_punches) para o Reis.
 *
 * STATUS: reconstrução pericial a partir da composição aceita
 *   Torres − Control iD = +10:39 (20/07) − 09:15 (30/06) − 00:01 (04/07) = +01:23
 * enquanto o dump SQL integral de control_id_punches não estiver disponível
 * neste ambiente (Supabase MCP needsAuth / sem SERVICE_ROLE).
 *
 * Quando o dump real chegar, substituir `REIS_TORRES_DAYS` pelos HH:MM
 * exportados (mesma competência) sem alterar o motor.
 *
 * Aritmética da RECONSTRUÇÃO (não comprovada contra dump SQL real):
 *   first_last (prod)     = 323:45 = 19425 min
 *   pares (só corrige 20/07 −10:39) = 19425 − 639 = 18786 min = **313:06**
 *   Confirmação cruzada: 322:22 − 09:15 − 00:01 = 19342 − 555 − 1 = 18786 = **313:06**
 *   HE pares = 313:06 − 220:00 = **93:06**
 *
 * ⚠️ 313:06 NÃO é resultado comprovado do dump real de control_id_punches.
 *    Só será comprovado após FASE 4 com export SQL do employee_id 22.
 *    Até lá: tratar como expectativa da reconstrução pericial.
 *
 * Não inventa 00:27 no lugar de 12:18. Não hardcodar employee_id no motor.
 */

/** Flag explícita: fixture B ainda não é dump real. */
export const REIS_TORRES_IS_RECONSTRUCTION = true as const;

import {
  REIS_OFICIAL_DAYS,
  type ReisDayFixture,
  brtHHMMtoIso,
} from "./reis-oficial-controlid";

/** Divergências cartão × Torres (metadados de auditoria da fixture — não do motor). */
export const REIS_TORRES_AUDIT = {
  "2026-06-30": {
    code: "import_vs_official_entry",
    officialEntry: "00:27",
    torresFirstPunch: "12:18",
    detail:
      "Cartão oficial ENT.1=00:27 (C); Torres possui 12:18 no lugar. Não inserir 00:27 automaticamente.",
    officialNormaisMin: 19 * 60 + 59,
    torresExpectedMin: 10 * 60 + 44, // 19:59 − 09:15
  },
  "2026-07-04": {
    code: "import_vs_official_total",
    officialNormaisMin: 3 * 60 + 40,
    torresExpectedMin: 3 * 60 + 39,
    detail:
      "Referência oficial = 03:40. Dump reconstruído = 03:39 (−00:01). Eventos adicionais reais do dump devem substituir esta reconstrução.",
  },
  "2026-07-20": {
    code: "orphan_23_59",
    detail: "Mesmas 5 marcações do cartão; pares=02:16; first_last=12:55; órfã 23:59",
  },
} as const;

/**
 * Dias Torres = oficiais, com substituição apenas nos dias com Δ pericial.
 * 30/06: 12:18 em vez de 00:27 (demais iguais ao cartão).
 * 04/07: 00:00→03:39 (oficial seria 03:40) — placeholder até dump.
 */
export const REIS_TORRES_DAYS: ReisDayFixture[] = REIS_OFICIAL_DAYS.map((d) => {
  if (d.date === "2026-06-30") {
    return {
      date: d.date,
      punchesHHMM: ["12:18", "15:32", "16:29", "23:59"],
      officialNormaisMin: 10 * 60 + 44,
      note: "Torres: 12:18 no lugar da ENT.1 oficial 00:27; Δ −09:15 vs cartão",
    };
  }
  if (d.date === "2026-07-04") {
    return {
      date: d.date,
      punchesHHMM: ["00:00", "03:39"],
      officialNormaisMin: 3 * 60 + 39,
      note: "Reconstrução −00:01 vs oficial 03:40; substituir pelo dump real",
    };
  }
  return { ...d };
});

export const REIS_TORRES_FIRST_LAST_TOTAL_MIN = 323 * 60 + 45; // 19425 — prod atual
export const REIS_TORRES_PARES_TOTAL_MIN = 313 * 60 + 6; // 18786 — valor EXATO
export const REIS_TORRES_PARES_HE_MIN = REIS_TORRES_PARES_TOTAL_MIN - 220 * 60; // 93:06

export function fixtureTorresPunchesToInputs(day: ReisDayFixture) {
  return day.punchesHHMM.map((t, i) => ({
    punchAt: brtHHMMtoIso(day.date, t),
    id: `torres-${day.date}-${i}`,
    externalId: `fixture_torres_${day.date}_${i}`,
    source: "facial" as const,
  }));
}
