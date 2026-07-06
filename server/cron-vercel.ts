/**
 * Jobs agendados via Vercel Cron (HTTP). Em Replit/Node local, node-cron cuida disso.
 */
import { log } from "./lib/logger";

export type VercelCronJob =
  | "whatsapp-forward"
  | "whatsapp-monitor"
  | "agent-central-escalation"
  | "billing"
  | "nf-reconcile"
  | "aceite-expirado";

export async function runVercelCronJob(job: VercelCronJob): Promise<{ ok: true; job: VercelCronJob }> {
  switch (job) {
    case "whatsapp-forward": {
      const { processPendingForwards } = await import("./cron-whatsapp-forward");
      await processPendingForwards();
      break;
    }
    case "whatsapp-monitor": {
      const { runMonitorCheck } = await import("./whatsapp-monitor");
      await runMonitorCheck();
      break;
    }
    case "agent-central-escalation": {
      const { flushAgentEscalations } = await import("./lib/agent-central-mention");
      const r = await flushAgentEscalations();
      if (r.escalated > 0 || r.fulfilled > 0 || r.no_second > 0) {
        log(
          `CRON AgenteCentral-Escalonamento: ${r.escalated} 2º agente(s), ${r.fulfilled} resolvido(s), ${r.no_second} sem 2º`,
          "cron",
        );
      }
      break;
    }
    case "billing": {
      const { executeBillingCron } = await import("./cron");
      await executeBillingCron();
      break;
    }
    case "nf-reconcile": {
      const { reconcileAllInvoicesAsaas } = await import("./asaas");
      const result = await reconcileAllInvoicesAsaas({ limit: 80 });
      log(
        `CRON NF-Reconcile: ${result.processed} processada(s), ${result.updated} atualizada(s), ${result.errors} erro(s)`,
        "cron",
      );
      break;
    }
    case "aceite-expirado": {
      const { supabaseAdmin } = await import("./supabase");
      const { isSupabaseHealthy } = await import("./pg-fallback");
      if (!isSupabaseHealthy()) {
        log("CRON AceiteExpirado: SKIP — Supabase offline", "cron");
        break;
      }
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: expired } = await supabaseAdmin
        .from("mission_acceptances")
        .select("id")
        .eq("status", "pendente")
        .lt("notified_at", twoHoursAgo);
      if (expired?.length) {
        for (const acc of expired) {
          await supabaseAdmin
            .from("mission_acceptances")
            .update({
              status: "expirado",
              responded_at: new Date().toISOString(),
              notes: "Expirado automaticamente — sem resposta em 2 horas",
            })
            .eq("id", acc.id);
        }
        log(`CRON AceiteExpirado: ${expired.length} aceite(s) expirado(s)`, "cron");
      }
      break;
    }
    default: {
      const _exhaustive: never = job;
      throw new Error(`Cron job desconhecido: ${_exhaustive}`);
    }
  }

  return { ok: true, job };
}

export function isVercelCronJob(value: string): value is VercelCronJob {
  return [
    "whatsapp-forward",
    "whatsapp-monitor",
    "agent-central-escalation",
    "billing",
    "nf-reconcile",
    "aceite-expirado",
  ].includes(value);
}
