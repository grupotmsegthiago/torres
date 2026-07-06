/**
 * Entrada HTTP dos crons na Vercel (delega para buckets compartilhados com Replit).
 */
import { log } from "./lib/logger";
import { CRON_BUCKETS, isCronBucket, runCronBucket, type CronBucket } from "./cron-buckets";

/** @deprecated Use CronBucket — mantido para compatibilidade de query ?job= */
export type VercelCronJob = CronBucket;

export async function runVercelCronJob(job: CronBucket): Promise<{ ok: true; job: CronBucket }> {
  log(`CRON Vercel: bucket=${job}`, "cron");
  await runCronBucket(job);
  return { ok: true, job };
}

export function isVercelCronJob(value: string): value is CronBucket {
  return isCronBucket(value);
}

export { CRON_BUCKETS, runCronBucket, isCronBucket };
export type { CronBucket };
