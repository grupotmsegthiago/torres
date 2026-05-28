import cron from "node-cron";
import { supabaseAdmin } from "./supabase.js";
import { sendImageWithCaption, isZapiConfigured } from "./lib/zapi.js";

const TAG = "[whatsapp-forward-cron]";
const LOOKBACK_HOURS = 24;
const MAX_PER_RUN = 10;
const CLAIM_STALE_MIN = 5;

let running = false;

async function claim(id: number): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MIN * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("mission_updates")
    .update({ whatsapp_forward_claimed_at: new Date().toISOString() })
    .eq("id", id)
    .is("whatsapp_forwarded_at", null)
    .or(`whatsapp_forward_claimed_at.is.null,whatsapp_forward_claimed_at.lt.${staleBefore}`)
    .select("id");
  if (error) {
    console.error(`${TAG} claim falhou id=${id}:`, error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}

async function releaseClaim(id: number, errMsg?: string): Promise<void> {
  await supabaseAdmin.from("mission_updates")
    .update({ whatsapp_forward_claimed_at: null, whatsapp_forward_error: errMsg ? errMsg.slice(0, 500) : null })
    .eq("id", id);
}

async function markDone(id: number, errMsg: string | null): Promise<void> {
  await supabaseAdmin.from("mission_updates")
    .update({ whatsapp_forwarded_at: new Date().toISOString(), whatsapp_forward_error: errMsg ? errMsg.slice(0, 500) : null })
    .eq("id", id);
}

async function processPending(): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!isZapiConfigured()) return;

    const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const { data: ups, error } = await supabaseAdmin
      .from("mission_updates")
      .select("id, service_order_id, os_number, employee_name, message, photo_url, created_at")
      .is("whatsapp_forwarded_at", null)
      .not("photo_url", "is", null)
      .not("message", "is", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(MAX_PER_RUN);

    if (error) {
      console.error(`${TAG} query falhou:`, error.message);
      return;
    }
    if (!ups || ups.length === 0) return;

    console.log(`${TAG} ${ups.length} candidato(s) pra processar`);

    for (const u of ups as any[]) {
      // claim atômico (anti-race entre workers/instâncias)
      if (!(await claim(u.id))) continue;

      const photoUrl: string = String(u.photo_url || "");
      const msg: string = String(u.message || "").trim();
      if (!msg || !photoUrl.startsWith("data:image/")) {
        await markDone(u.id, "skip: foto/msg inválida");
        continue;
      }

      const { data: so, error: soErr } = await supabaseAdmin.from("service_orders")
        .select("client_id, status").eq("id", u.service_order_id).maybeSingle();
      if (soErr) {
        // erro transitório de DB → libera claim pra retentar no próximo ciclo
        await releaseClaim(u.id, `db service_orders: ${soErr.message}`);
        console.error(`${TAG} ⟳ id=${u.id} erro transitório SO:`, soErr.message);
        continue;
      }
      if (!so) {
        await markDone(u.id, "skip: OS não encontrada");
        continue;
      }
      if ((so as any).status === "recusada" || (so as any).status === "cancelada") {
        await markDone(u.id, `skip: OS ${(so as any).status}`);
        continue;
      }

      const { data: client, error: clErr } = await supabaseAdmin.from("clients")
        .select("name, whatsapp_group_id").eq("id", (so as any).client_id).maybeSingle();
      if (clErr) {
        await releaseClaim(u.id, `db clients: ${clErr.message}`);
        console.error(`${TAG} ⟳ id=${u.id} erro transitório CLIENT:`, clErr.message);
        continue;
      }
      const groupId = (client as any)?.whatsapp_group_id;
      if (!groupId) {
        await markDone(u.id, "skip: cliente sem whatsapp_group_id");
        continue;
      }

      const caption = `*Central Torres Vigilancia*\n\n🚨 *${u.os_number || "OS"}* — ${u.employee_name || "Agente"}\n\n${msg}`;
      try {
        const result = await sendImageWithCaption({
          groupOrPhone: String(groupId),
          imageBase64OrUrl: photoUrl,
          caption,
        });
        if (result.ok) {
          await markDone(u.id, null);
          console.log(`${TAG} ✓ id=${u.id} OS=${u.os_number} → ${(client as any).name} msgId=${result.messageId}`);
        } else {
          await releaseClaim(u.id, String(result.error || "erro desconhecido"));
          console.error(`${TAG} ⟳ id=${u.id} OS=${u.os_number}: ${result.error}`);
        }
      } catch (e: any) {
        await releaseClaim(u.id, String(e?.message || e));
        console.error(`${TAG} ⟳ id=${u.id} exception:`, e?.message);
      }
    }
  } finally {
    running = false;
  }
}

export function initWhatsappForwardCron(): void {
  cron.schedule("*/30 * * * * *", () => {
    processPending().catch((e) => console.error(`${TAG} crash:`, e?.message));
  });
  console.log(`${TAG} CRON ativo: a cada 30s, lookback ${LOOKBACK_HOURS}h, max ${MAX_PER_RUN}/ciclo, claim TTL ${CLAIM_STALE_MIN}min`);
  setTimeout(() => processPending().catch(() => {}), 5000);
}
