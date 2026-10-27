import { supabaseAdmin } from "../supabase";
import { sendCommand } from "../truckscontrol";
import { haversineDist } from "../routes/_helpers";
import {
  FUELING_TRACKER_REMINDER_TEXT,
  shouldSendFuelingTrackerReminder,
} from "@shared/fueling-km-salto";

const CHECK_MS = 30 * 60 * 1000;
const SEND_MS = 6 * 60 * 60 * 1000;
const state = new Map<number, { checkedAt: number; sentAt: number }>();
const gpsTrip = new Map<number, { osId: number; lat: number; lng: number; km: number }>();

function accumulateGpsKm(vehicleId: number, osId: number, lat?: number | null, lng?: number | null): number {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    const prev = gpsTrip.get(vehicleId);
    return prev && prev.osId === osId ? prev.km : 0;
  }
  const prev = gpsTrip.get(vehicleId);
  if (!prev || prev.osId !== osId) {
    gpsTrip.set(vehicleId, { osId, lat, lng, km: 0 });
    return 0;
  }
  const meters = haversineDist(prev.lat, prev.lng, lat, lng);
  const legKm = meters >= 50 && meters <= 30000 ? meters / 1000 : 0;
  const km = prev.km + legKm;
  gpsTrip.set(vehicleId, { osId, lat, lng, km });
  return km;
}

export async function sendFuelingTrackerReminder(veiID: number): Promise<{ success: boolean; message: string }> {
  return sendCommand(veiID, "mensagem_texto", FUELING_TRACKER_REMINDER_TEXT);
}

/**
 * Missão ativa, mais de 400 km desde o último abastecimento e nenhum combustível
 * lançado nessa OS: manda o texto ao painel TrucksControl. No máximo uma vez a cada 6 h.
 */
export async function considerFuelingTrackerReminder(input: {
  vehicleId: number;
  vehicleKm?: number | null;
  truckscontrolId?: number | null;
  activeOsId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  const veiID = Number(input.truckscontrolId);
  const osId = Number(input.activeOsId);
  if (!input.vehicleId || !Number.isFinite(osId) || osId <= 0) return;
  const gpsKm = accumulateGpsKm(input.vehicleId, osId, input.latitude, input.longitude);
  if (!Number.isFinite(veiID) || veiID <= 0) return;

  const now = Date.now();
  const prev = state.get(input.vehicleId);
  if (prev && now - prev.checkedAt < CHECK_MS) return;
  if (prev && now - prev.sentAt < SEND_MS) {
    state.set(input.vehicleId, { checkedAt: now, sentAt: prev.sentAt });
    return;
  }

  const vehicleKm = Number(input.vehicleKm) || 0;
  const { data: last } = await supabaseAdmin
    .from("vehicle_fueling")
    .select("km")
    .eq("vehicle_id", input.vehicleId)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastKm = Number(last?.km) || 0;
  const odometerKm = lastKm > 0 ? Math.max(0, vehicleKm - lastKm) : 0;
  const kmDriven = Math.max(gpsKm, odometerKm);

  const { data: costs } = await supabaseAdmin
    .from("mission_costs")
    .select("id")
    .eq("service_order_id", osId)
    .ilike("category", "%combust%")
    .limit(1);
  const hasFuelingOnMission = (costs || []).length > 0;

  state.set(input.vehicleId, { checkedAt: now, sentAt: prev?.sentAt || 0 });
  if (!shouldSendFuelingTrackerReminder({ missionActive: true, kmDriven, hasFuelingOnMission })) return;

  const result = await sendFuelingTrackerReminder(veiID);
  if (result.success) {
    state.set(input.vehicleId, { checkedAt: now, sentAt: now });
    console.log(`[fueling-reminder] aviso enviado veiID=${veiID} OS=${osId} (+${kmDriven} km)`);
  } else {
    console.log(`[fueling-reminder] não enviado veiID=${veiID}: ${result.message}`);
  }
}
