import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CRON_BUCKETS, isVercelCronJob, runVercelCronJob } from "../server/cron-vercel.js";

function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.authorization;
  return auth === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const jobParam = typeof req.query.job === "string" ? req.query.job : "";
  if (!isVercelCronJob(jobParam)) {
    return res.status(400).json({
      message: "Parâmetro job inválido",
      jobs: CRON_BUCKETS,
    });
  }

  try {
    const result = await runVercelCronJob(jobParam);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error(`[cron] job=${jobParam} erro:`, err);
    return res.status(500).json({ message: err?.message || "Cron failed" });
  }
}
