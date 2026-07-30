/**
 * Fixture A — Cartão oficial Control iD (PDF)
 * JORGE DOS REIS OLIVEIRA · 26/06/2026 → 25/07/2026
 * Fonte: JORGE_REIS_-_relatorio_2026727_1645_0461.PDF (emitido 27/07/2026 16:45)
 *
 * Esperados oficiais:
 *   TOTAL NORMAIS = 322:22
 *   base = 220:00
 *   HE = 102:22
 *   20/07 = 02:16 + órfã 23:59
 */

export type ReisDayFixture = {
  date: string; // YYYY-MM-DD BRT
  punchesHHMM: string[];
  /** TOTAL NORMAIS do cartão (minutos), quando houver. */
  officialNormaisMin: number | null;
  note?: string;
};

/** Converte data BRT + HH:MM → ISO UTC (BRT = UTC−3, sem DST). */
export function brtHHMMtoIso(dateYmd: string, hhmm: string): string {
  const [h, m] = hhmm.replace(/[^0-9:]/g, "").split(":").map(Number);
  const [y, mo, d] = dateYmd.split("-").map(Number);
  // 00:00 BRT = 03:00Z do mesmo dia civil
  const utc = Date.UTC(y, mo - 1, d, h + 3, m, 0, 0);
  return new Date(utc).toISOString();
}

export function fixturePunchesToInputs(day: ReisDayFixture) {
  return day.punchesHHMM.map((t, i) => ({
    punchAt: brtHHMMtoIso(day.date, t),
    id: `${day.date}-${i}`,
    externalId: `fixture_oficial_${day.date}_${i}`,
    source: "facial" as const,
  }));
}

/** Dias com batidas no cartão (folgas omitidas). */
export const REIS_OFICIAL_DAYS: ReisDayFixture[] = [
  { date: "2026-06-26", punchesHHMM: ["01:00", "11:56", "13:00", "23:31"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-06-27", punchesHHMM: ["07:59", "11:59", "12:57", "23:59"], officialNormaisMin: 15 * 60 + 2 },
  { date: "2026-06-28", punchesHHMM: ["00:00", "12:05", "13:08", "23:59"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-06-29", punchesHHMM: ["00:00", "12:13", "13:20", "23:59"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-06-30", punchesHHMM: ["00:27", "15:32", "16:29", "23:59"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-07-01", punchesHHMM: ["00:00", "12:03", "13:07", "23:59"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-07-02", punchesHHMM: ["00:00", "12:32", "13:33", "23:59"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-07-03", punchesHHMM: ["00:00", "11:58", "13:02", "23:59"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-07-04", punchesHHMM: ["00:00", "03:40"], officialNormaisMin: 3 * 60 + 40 },
  { date: "2026-07-06", punchesHHMM: ["04:16", "13:18", "14:22", "23:59"], officialNormaisMin: 18 * 60 + 39 },
  { date: "2026-07-07", punchesHHMM: ["00:00", "12:12", "13:18", "22:25"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-07-08", punchesHHMM: ["13:07", "14:26", "15:30", "20:45"], officialNormaisMin: 6 * 60 + 34 },
  { date: "2026-07-10", punchesHHMM: ["02:58", "11:47", "13:00", "18:05"], officialNormaisMin: 13 * 60 + 54 },
  { date: "2026-07-12", punchesHHMM: ["23:13", "23:59"], officialNormaisMin: 46 },
  { date: "2026-07-13", punchesHHMM: ["00:00", "11:35", "12:31", "14:51"], officialNormaisMin: 13 * 60 + 55 },
  { date: "2026-07-14", punchesHHMM: ["05:00", "11:34", "12:35", "14:16"], officialNormaisMin: 8 * 60 + 15 },
  { date: "2026-07-15", punchesHHMM: ["01:00", "12:09", "13:12", "23:59"], officialNormaisMin: 19 * 60 + 59 },
  { date: "2026-07-18", punchesHHMM: ["00:00", "05:12"], officialNormaisMin: 5 * 60 + 12 },
  {
    date: "2026-07-20",
    punchesHHMM: ["05:53", "07:00", "12:11", "13:20", "23:59"],
    officialNormaisMin: 2 * 60 + 16,
    note: "órfã oficial 23:59",
  },
  { date: "2026-07-21", punchesHHMM: ["00:00", "02:24", "08:00", "14:00"], officialNormaisMin: 8 * 60 + 24 },
  { date: "2026-07-22", punchesHHMM: ["05:47", "12:32", "13:28", "22:28"], officialNormaisMin: 15 * 60 + 45 },
  { date: "2026-07-23", punchesHHMM: ["05:24", "12:07", "13:06", "22:14"], officialNormaisMin: 15 * 60 + 51 },
  { date: "2026-07-24", punchesHHMM: ["06:49", "11:58", "13:00", "22:09"], officialNormaisMin: 14 * 60 + 18 },
];

export const REIS_OFICIAL_TOTAL_NORMAIS_MIN = 322 * 60 + 22; // 19342
export const REIS_OFICIAL_BASE_MIN = 220 * 60;
export const REIS_OFICIAL_HE_MIN = REIS_OFICIAL_TOTAL_NORMAIS_MIN - REIS_OFICIAL_BASE_MIN; // 102:22
export const REIS_EMPLOYEE_ID = 22;
export const REIS_COMPETENCIA = "2026-07"; // ciclo 26/06→25/07
