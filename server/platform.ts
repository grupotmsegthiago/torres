/** True quando rodando em função serverless da Vercel. */
export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

/** Crons e timers em memória só fazem sentido em processo persistente (Replit, Node local). */
export function shouldRunBackgroundJobs(): boolean {
  return !isVercel();
}
