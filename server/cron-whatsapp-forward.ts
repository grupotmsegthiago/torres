import cron from "node-cron";
import { supabaseAdmin } from "./supabase.js";
import { sendImageWithCaption, isZapiConfigured } from "./lib/zapi.js";

const TAG = "[whatsapp-forward-cron]";
// Janela curta: só encaminha updates recentes. Se uma update ficar
// pendente por mais que isso (Z-API fora, cron parado, etc.), é
// descartada pra evitar despejar backlog antigo no grupo do cliente.
// Decisão do dono em 28/05/2026.
const LOOKBACK_MIN = 15;
const MAX_PER_RUN = 10;
const CLAIM_STALE_MIN = 5;
// Anti-spam: no máximo 1 msg a cada N min por grupo de cliente.
// Se já enviou recente, o claim é liberado pro próximo ciclo do cron.
// Combinado com LOOKBACK_MIN=15: no pior caso 5 msgs/15min por cliente.
const THROTTLE_PER_GROUP_MIN = 3;

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

    const cutoff = new Date(Date.now() - LOOKBACK_MIN * 60 * 1000).toISOString();
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

      // Throttle por grupo: se mandou msg pra esse grupo nos últimos N min,
      // libera o claim e tenta no próximo ciclo (evita spam em backlog)
      const { data: thr, error: thrErr } = await supabaseAdmin
        .from("whatsapp_group_throttle")
        .select("last_sent_at").eq("group_id", String(groupId)).maybeSingle();
      if (thrErr) {
        await releaseClaim(u.id, `db throttle: ${thrErr.message}`);
        console.error(`${TAG} ⟳ id=${u.id} erro transitório THROTTLE:`, thrErr.message);
        continue;
      }
      if (thr?.last_sent_at) {
        const elapsedMs = Date.now() - new Date(thr.last_sent_at).getTime();
        if (elapsedMs < THROTTLE_PER_GROUP_MIN * 60 * 1000) {
          const waitMin = Math.ceil((THROTTLE_PER_GROUP_MIN * 60 * 1000 - elapsedMs) / 60000);
          await releaseClaim(u.id, `throttle: aguardando ${waitMin}min`);
          console.log(`${TAG} ⏸ id=${u.id} OS=${u.os_number} → ${(client as any).name} throttle ${waitMin}min`);
          continue;
        }
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
          await supabaseAdmin.from("whatsapp_group_throttle")
            .upsert({ group_id: String(groupId), last_sent_at: new Date().toISOString() }, { onConflict: "group_id" });
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
  console.log(`${TAG} CRON ativo: a cada 30s, lookback ${LOOKBACK_MIN}min, max ${MAX_PER_RUN}/ciclo, claim TTL ${CLAIM_STALE_MIN}min, throttle ${THROTTLE_PER_GROUP_MIN}min/grupo`);
  setTimeout(() => processPending().catch(() => {}), 5000);
}
