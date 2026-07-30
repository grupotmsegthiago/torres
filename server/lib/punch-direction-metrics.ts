/**
 * Contadores auditáveis de direção de batidas (Correção 1).
 * Em memória por processo — expostos via GET /api/control-id/direction-stats.
 * Não registra payload pessoal / biometria / raw_event.
 */

export type DirectionOrigin =
  | "afd_sync"
  | "device_api"
  | "admin_manual"
  | "self_manual"
  | "manual"
  | "other";

type Counters = {
  received: number;
  in: number;
  out: number;
  unknown: number;
  unknownByDevice: Record<string, number>;
  unknownByOrigin: Record<string, number>;
  /** Contagem histórica de in/out por device nesta sessão (para alerta de regressão). */
  knownByDevice: Record<string, number>;
  unknownManual: number;
  unknownMissingField: number;
  unknownUnrecognizedValue: number;
  manualRejectedUnknown: number;
  alerts: Array<{ at: string; code: string; detail: string }>;
};

const MAX_ALERTS = 100;

function empty(): Counters {
  return {
    received: 0,
    in: 0,
    out: 0,
    unknown: 0,
    unknownByDevice: {},
    unknownByOrigin: {},
    knownByDevice: {},
    unknownManual: 0,
    unknownMissingField: 0,
    unknownUnrecognizedValue: 0,
    manualRejectedUnknown: 0,
    alerts: [],
  };
}

let counters: Counters = empty();

function bumpMap(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1;
}

function pushAlert(code: string, detail: string) {
  const entry = { at: new Date().toISOString(), code, detail };
  counters.alerts.unshift(entry);
  if (counters.alerts.length > MAX_ALERTS) counters.alerts.length = MAX_ALERTS;
  console.warn(`[ControlID][ALERT] ${code}: ${detail}`);
}

export function resetDirectionMetrics() {
  counters = empty();
}

export function getDirectionMetrics(): Counters {
  return {
    ...counters,
    unknownByDevice: { ...counters.unknownByDevice },
    unknownByOrigin: { ...counters.unknownByOrigin },
    knownByDevice: { ...counters.knownByDevice },
    alerts: [...counters.alerts],
  };
}

export function recordPunchDirectionIngest(opts: {
  direction: "in" | "out" | "unknown";
  origin: DirectionOrigin;
  deviceId?: number | string | null;
  missingReason?: string | null;
}) {
  counters.received += 1;
  const devKey = opts.deviceId == null ? "none" : String(opts.deviceId);
  if (opts.direction === "in") {
    counters.in += 1;
    bumpMap(counters.knownByDevice, devKey);
  } else if (opts.direction === "out") {
    counters.out += 1;
    bumpMap(counters.knownByDevice, devKey);
  } else {
    counters.unknown += 1;
    bumpMap(counters.unknownByDevice, devKey);
    bumpMap(counters.unknownByOrigin, opts.origin);
    if (opts.origin === "admin_manual" || opts.origin === "self_manual" || opts.origin === "manual") {
      counters.unknownManual += 1;
    }
    if (opts.missingReason === "afd_no_direction_field" || opts.missingReason === "normalize_disabled") {
      counters.unknownMissingField += 1;
    }
    if (opts.missingReason === "unrecognized_direction_value") {
      counters.unknownUnrecognizedValue += 1;
    }
  }
}

/** Manual tentou unknown / omitido — HTTP 400; conta alerta evitável. */
export function recordManualDirectionRejected(detail: string) {
  counters.manualRejectedUnknown += 1;
  pushAlert("manual_unknown_rejected", detail);
}

/** Crescimento de unknown evitável no sync (AFD sem campo / unrecognized). */
export function recordAvoidableUnknownGrowth(opts: {
  deviceId: number | string;
  count: number;
  reason: string;
}) {
  if (opts.count <= 0) return;
  pushAlert(
    "avoidable_unknown_growth",
    `device=${opts.deviceId} count=${opts.count} reason=${opts.reason}`,
  );
}

/** Dispositivo que já entregou in/out nesta sessão e agora só manda unknown. */
export function maybeAlertDeviceLostDirection(opts: {
  deviceId: number | string;
  knownInBatch: number;
  unknownBatch: number;
}) {
  const prevKnown = counters.knownByDevice[String(opts.deviceId)] || 0;
  // prevKnown já inclui o batch atual se houve in/out; exigir histórico prévio:
  // se o batch atual não tem known mas o device já teve known antes → regressão.
  if (opts.unknownBatch > 0 && opts.knownInBatch === 0 && prevKnown > 0) {
    pushAlert(
      "device_stopped_providing_direction",
      `device=${opts.deviceId} had_known_session=${prevKnown} unknown_in_batch=${opts.unknownBatch}`,
    );
  }
}
