import cron from "node-cron";
import { supabaseAdmin } from "./supabase.js";
import { sendImageWithCaption, isZapiConfigured } from "./lib/zapi.js";
import { haversineDist } from "./routes/_helpers.js";
import { nominatimReverseGeocode } from "./db-init.js";

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

const MISSION_STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  aceita: "Aceita",
  deslocamento_inicio: "Deslocamento ao Início",
  no_local_origem: "No Local de Origem",
  em_transito: "Em Trânsito",
  em_transito_destino: "Em Trânsito Destino",
  no_local_destino: "No Local de Destino",
  em_apoio: "Em Apoio",
  pernoite: "Pernoite",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
  recusada: "Recusada",
};

function fmtMissionStatus(s?: string | null): string {
  if (!s) return "";
  const key = String(s).toLowerCase().trim();
  if (MISSION_STATUS_LABEL[key]) return MISSION_STATUS_LABEL[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtBrtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  } catch { return ""; }
}
function fmtBrtTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  } catch { return ""; }
}
function fmtEta(km: number): string {
  if (!isFinite(km) || km <= 0) return "Chegando";
  const totalMin = Math.round((km / 60) * 60); // 60 km/h média
  if (totalMin < 60) return `~${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `~${h}h` : `~${h}h${String(m).padStart(2, "0")}`;
}

export async function buildRichCaption(u: any, so: any, client: any): Promise<string> {
  const upLat = u.latitude ? parseFloat(u.latitude) : NaN;
  const upLng = u.longitude ? parseFloat(u.longitude) : NaN;
  const hasGeo = isFinite(upLat) && isFinite(upLng);

  // Lookups paralelos: viatura + agentes + reverse-geocode
  const vehicleP = so?.vehicle_id
    ? supabaseAdmin.from("vehicles").select("plate").eq("id", so.vehicle_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const ag1P = so?.assigned_employee_id
    ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const ag2P = so?.assigned_employee_2_id
    ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_2_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const addrP = hasGeo ? nominatimReverseGeocode(upLat, upLng).catch(() => null) : Promise.resolve(null);

  const [vehRes, ag1Res, ag2Res, addr] = await Promise.all([vehicleP, ag1P, ag2P, addrP]);
  const viaturaPlate = (vehRes as any)?.data?.plate;
  const ag1Name = (ag1Res as any)?.data?.name;
  const ag2Name = (ag2Res as any)?.data?.name;

  // Progresso + distância restante (precisa origin/destination lat/lng + posição atual)
  let progressoPct: number | null = null;
  let distRestKm: number | null = null;
  const oLat = so?.origin_lat != null ? Number(so.origin_lat) : NaN;
  const oLng = so?.origin_lng != null ? Number(so.origin_lng) : NaN;
  const dLat = so?.destination_lat != null ? Number(so.destination_lat) : NaN;
  const dLng = so?.destination_lng != null ? Number(so.destination_lng) : NaN;
  if (hasGeo && isFinite(dLat) && isFinite(dLng)) {
    distRestKm = haversineDist(upLat, upLng, dLat, dLng) / 1000;
  }
  if (hasGeo && isFinite(oLat) && isFinite(oLng) && isFinite(dLat) && isFinite(dLng)) {
    const total = haversineDist(oLat, oLng, dLat, dLng);
    const done = haversineDist(oLat, oLng, upLat, upLng);
    if (total > 0) {
      const pct = Math.round((done / total) * 100);
      progressoPct = Math.max(0, Math.min(99, pct));
    }
  }

  const dataStr = fmtBrtDate(u.created_at);
  const horaStr = fmtBrtTime(u.created_at);
  const statusLabel = fmtMissionStatus(so?.mission_status).toUpperCase();
  const opLabel = fmtMissionStatus(so?.mission_status);
  const clienteNome = String(client?.name || "").toUpperCase();
  const msgUpper = String(u.message || "").toUpperCase();

  const L: string[] = [];
  L.push(`🛡️ *TORRES VIGILÂNCIA PATRIMONIAL*`);
  L.push(`🚨 *OS ${u.os_number || ""}* | *STATUS:* ${statusLabel || "—"}`);
  L.push("");
  if (dataStr || horaStr) L.push(`📅 *DATA:* ${dataStr}   🕐 *HORA:* ${horaStr}`);
  if (opLabel) L.push(`🏢 *OPERAÇÃO:* ${opLabel}`);
  if (clienteNome) L.push(`🏢 *CLIENTE:* ${clienteNome}`);
  L.push("");
  if (so?.origin) L.push(`📍 *ORIGEM:* ${so.origin}`);
  if (so?.destination) L.push(`🏁 *DESTINO:* ${so.destination}`);
  L.push("");
  if (so?.escorted_vehicle_plate) L.push(`🚛 *VEÍCULO:* ${so.escorted_vehicle_plate}`);
  if (so?.escorted_driver_name) L.push(`👤 *MOTORISTA:* ${so.escorted_driver_name}`);
  if (so?.escorted_driver_phone) L.push(`📞 *CONTATO:* ${so.escorted_driver_phone}`);
  L.push("");
  if (viaturaPlate) L.push(`🚓 *VIATURA:* ${viaturaPlate}`);
  if (ag1Name) L.push(`👮 *AGENTE 01:* ${ag1Name}`);
  if (ag2Name) L.push(`👮 *AGENTE 02:* ${ag2Name}`);
  L.push("");
  if (progressoPct != null) L.push(`📊 *PROGRESSO DA MISSÃO:* ${progressoPct}%`);
  if (msgUpper) L.push(`📝 *ATUALIZAÇÃO:* ${msgUpper}`);
  if (addr) L.push(`📍 *LOCALIZAÇÃO:* ${addr}`);
  L.push("");
  if (distRestKm != null) L.push(`🚗 *DISTÂNCIA ATÉ DESTINO:* ${Math.round(distRestKm)} km`);
  if (distRestKm != null) L.push(`⏱️ *PREVISÃO DE CHEGADA:* ${fmtEta(distRestKm)}`);
  if (hasGeo) {
    L.push("");
    L.push(`📍 *LOCALIZAÇÃO:*`);
    L.push(`https://www.google.com/maps?q=${upLat.toFixed(4)},${upLng.toFixed(4)}&z=17&hl=pt-BR`);
  }

  // Compacta múltiplas linhas em branco consecutivas
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

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
      .select("id, service_order_id, os_number, employee_name, message, photo_url, latitude, longitude, created_at")
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
        .select("client_id, status, mission_status, origin, destination, origin_lat, origin_lng, destination_lat, destination_lng, vehicle_id, assigned_employee_id, assigned_employee_2_id, escorted_driver_name, escorted_driver_phone, escorted_vehicle_plate")
        .eq("id", u.service_order_id).maybeSingle();
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

      let caption: string;
      try {
        caption = await buildRichCaption(u, so, client);
      } catch (capErr: any) {
        // fallback simples se algo der ruim na montagem do caption rico
        console.warn(`${TAG} caption rico falhou id=${u.id}, usando fallback:`, capErr?.message);
        caption = `*Central Torres Vigilancia*\n\n🚨 *${u.os_number || "OS"}* — ${u.employee_name || "Agente"}\n\n${msg}`;
      }
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
