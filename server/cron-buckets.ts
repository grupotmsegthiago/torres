/**
 * Agendamento unificado: Vercel Cron (HTTP) e node-cron (Replit/local).
 * Jobs com horário fixo em BRT são disparados no bucket `minute` via getBrtClock().
 */
import { log } from "./lib/logger";
import { isSupabaseHealthy } from "./pg-fallback";
import * as jobs from "./cron-jobs";

export type CronBucket =
  | "minute"
  | "three-min"
  | "five-min"
  | "ten-min"
  | "fifteen-min"
  | "thirty-min";

export const CRON_BUCKETS: CronBucket[] = [
  "minute",
  "three-min",
  "five-min",
  "ten-min",
  "fifteen-min",
  "thirty-min",
];

export interface BrtClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  ymd: string;
}

export function getBrtClock(now = new Date()): BrtClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayMap[parts.weekday] ?? 0,
    ymd: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

async function runBrtScheduledJobs(brt: BrtClock): Promise<void> {
  const { hour, minute, day, month, weekday } = brt;
  const isWeekday = weekday >= 1 && weekday <= 5;

  if (hour === 0 && minute === 0) {
    await jobs.runControlIdCron();
    await jobs.runRhidReconCron();
  }
  if (hour === 2 && minute === 0) await jobs.runFleetMultasCron();
  if (hour === 2 && minute === 59) await jobs.runProvisaoCron();
  if (hour === 3 && minute === 10) await jobs.runContratoDefinitivoCron();
  if (hour === 3 && minute === 0 && day === 1 && month % 3 === 1) await jobs.runRhComplianceCron();
  if (hour === 3 && minute === 0) await jobs.runBillingAlertsCron();
  if (hour === 4 && minute === 0) await jobs.runInterReconcileBackfillCron();
  if (hour === 5 && minute === 0 && day === 1) await jobs.runFolhaSnapshotCron();
  if (hour === 6 && minute === 0) {
    await jobs.runDiariasJornadaCron();
    if (day >= 2 && day <= 5) await jobs.runFolhaCatchupCron();
    if (isWeekday) await jobs.runResumoFinanceiroCron();
  }
  if (hour === 6 && minute === 30 && isWeekday) await jobs.runRodizioCron();
  if (hour === 7 && minute === 0) {
    await jobs.runVencimentosCron();
    await jobs.runAlertaFrotaCron();
    await jobs.runDocComplianceCron();
  }
  if (hour === 8 && minute === 0) {
    await jobs.runAlertaDocRhCron();
    await jobs.runJornadaAlertaCron();
  }
  if (hour === 9 && minute === 0) {
    await jobs.runComprovantesCron();
    if (isWeekday) await jobs.runResumoFinanceiroCron();
    await jobs.runPayslipReminderCron();
  }
  if (hour === 12 && minute === 0) {
    await jobs.runControlIdCron();
    if (isWeekday) await jobs.runResumoFinanceiroCron();
  }
  if (hour === 15 && minute === 0 && isWeekday) await jobs.runResumoFinanceiroCron();
  if (hour === 16 && minute === 30 && isWeekday) await jobs.runRodizioCron();
  if (hour === 18 && minute === 0 && isWeekday) await jobs.runResumoFinanceiroCron();
}

async function runBillingWithMeta(): Promise<void> {
  if (!isSupabaseHealthy()) {
    log("CRON Billing: SKIP — Supabase offline (modo fallback)", "cron");
    return;
  }
  const { executeBillingCron, checkMetaAndNotify } = await import("./cron");
  await executeBillingCron();
  await checkMetaAndNotify();
}

export async function runCronBucket(bucket: CronBucket): Promise<void> {
  switch (bucket) {
    case "minute": {
      const { processPendingForwards } = await import("./cron-whatsapp-forward");
      await processPendingForwards();
      await jobs.runAgentCentralEscalationCron();
      await runBrtScheduledJobs(getBrtClock());
      break;
    }
    case "three-min": {
      const { runMonitorCheck } = await import("./whatsapp-monitor");
      await runMonitorCheck();
      break;
    }
    case "five-min": {
      await jobs.runRhidQueueCron();
      await jobs.runInterReconcileFastCron();
      await jobs.runAgentCentralCron();
      break;
    }
    case "ten-min": {
      await runBillingWithMeta();
      break;
    }
    case "fifteen-min": {
      await jobs.runNfReconcileCron();
      break;
    }
    case "thirty-min": {
      await jobs.runAceiteExpiradoCron();
      break;
    }
    default: {
      const _exhaustive: never = bucket;
      throw new Error(`Bucket desconhecido: ${_exhaustive}`);
    }
  }
}

export function isCronBucket(value: string): value is CronBucket {
  return CRON_BUCKETS.includes(value as CronBucket);
}
