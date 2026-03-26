import { storage } from "./storage";
import { processIdleAlert, processIgnitionOff, getActiveIdleAlerts } from "./truckscontrol";
import type { InsertTelemetryEvent } from "@shared/schema";

const SPEED_LIMIT = 110;
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

const speedAlertCooldown = new Map<string, number>();
const idleAlertSent = new Map<string, boolean>();

const SPEED_COOLDOWN_MS = 5 * 60 * 1000;

interface VehicleTelemetryData {
  vehicleId: number;
  plate: string;
  speed: number;
  ignition: boolean;
  latitude?: number;
  longitude?: number;
  address?: string;
  stoppedSince?: string | null;
  ignitionOnSince?: string | null;
  driverName?: string | null;
  truckscontrolId?: number | null;
}

export function processTelemetry(vehicles: VehicleTelemetryData[]): void {
  const now = Date.now();

  for (const v of vehicles) {
    checkSpeedViolation(v, now);
    checkIdleViolation(v, now);
  }
}

function checkSpeedViolation(v: VehicleTelemetryData, now: number): void {
  if (v.speed <= SPEED_LIMIT) return;

  const lastAlert = speedAlertCooldown.get(v.plate) || 0;
  if (now - lastAlert < SPEED_COOLDOWN_MS) return;

  speedAlertCooldown.set(v.plate, now);

  const event: InsertTelemetryEvent = {
    vehicleId: v.vehicleId,
    plate: v.plate,
    eventType: "excesso_velocidade",
    value: v.speed,
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
    address: v.address ?? null,
    driverName: v.driverName ?? null,
    details: `Velocidade de ${v.speed} km/h (limite: ${SPEED_LIMIT} km/h)`,
  };

  storage.createTelemetryEvent(event).then(() => {
    console.log(`[telemetry] VELOCIDADE: ${v.plate} a ${v.speed} km/h`);
  }).catch(err => {
    console.error(`[telemetry] Erro ao registrar velocidade:`, err.message);
  });
}

function checkIdleViolation(v: VehicleTelemetryData, now: number): void {
  if (!v.ignition || v.speed > 2) {
    idleAlertSent.delete(v.plate);
    if (!v.ignition && v.truckscontrolId && getActiveIdleAlerts().has(v.truckscontrolId)) {
      processIgnitionOff(v.truckscontrolId, v.plate).catch(err => {
        console.error(`[telemetry] Erro ao processar ignição off para ${v.plate}:`, err.message);
      });
    }
    return;
  }

  if (!v.stoppedSince) return;

  const stoppedAt = new Date(v.stoppedSince).getTime();
  if (isNaN(stoppedAt)) return;

  const idleDurationMs = now - stoppedAt;
  const idleMinutes = Math.floor(idleDurationMs / 60000);

  if (idleDurationMs < IDLE_THRESHOLD_MS) return;

  if (idleAlertSent.get(v.plate)) return;
  idleAlertSent.set(v.plate, true);

  const event: InsertTelemetryEvent = {
    vehicleId: v.vehicleId,
    plate: v.plate,
    eventType: "idle_excessivo",
    value: idleMinutes,
    duration: idleMinutes,
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
    address: v.address ?? null,
    driverName: v.driverName ?? null,
    details: `Motor ligado parado há ${idleMinutes} min`,
  };

  storage.createTelemetryEvent(event).then(() => {
    console.log(`[telemetry] IDLE: ${v.plate} parado c/ motor há ${idleMinutes}min`);
  }).catch(err => {
    console.error(`[telemetry] Erro ao registrar idle:`, err.message);
  });

  if (v.truckscontrolId) {
    processIdleAlert(v.truckscontrolId, v.plate).catch(err => {
      console.error(`[telemetry] Erro ao enviar alerta cabine para ${v.plate}:`, err.message);
    });
  }
}

export function updateIdleDuration(plate: string, currentMinutes: number): void {
  storage.getTelemetryEvents({ eventType: "idle_excessivo", plate, limit: 1 }).then(events => {
    if (events.length > 0) {
      const last = events[0];
      const lastCreated = new Date(last.createdAt!).getTime();
      if (Date.now() - lastCreated < 2 * 60 * 60 * 1000) {
        return;
      }
    }
  }).catch(() => {});
}

export function getStats() {
  return {
    speedCooldownEntries: speedAlertCooldown.size,
    idleAlertEntries: idleAlertSent.size,
  };
}
