/** True quando rodando em função serverless da Vercel. */
export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

/** Crons e timers em memória só fazem sentido em processo persistente (Replit, Node local). */
export function shouldRunBackgroundJobs(): boolean {
  // Local de teste: DISABLE_CRONS=true impede emissão, conciliação e WhatsApp agendados.
  if (String(process.env.DISABLE_CRONS || "").trim().toLowerCase() === "true") return false;
  return !isVercel();
}
