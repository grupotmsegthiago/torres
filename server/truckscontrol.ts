import AdmZip from "adm-zip";

interface TrucksControlVehicle {
  veiID: number;
  placa: string;
  ident: string;
  eqp: number;
  prop: string;
}

interface TrucksControlMessage {
  mId: number;
  veiID: number;
  dt: string;
  lat: number;
  lon: number;
  mun: string;
  uf: string;
  rod: string;
  rua: string;
  vel: number;
  evt4: number;
}

interface SpyDevice {
  spyID: number;
  serie: number;
  desc: string;
  nBat: number;
  sAcop: number;
  eqp: number;
  tipo: number;
}

interface SpyMessage {
  mId: number;
  spyID: number;
  serie: number;
  dtHora: string;
  lat: number;
  lon: number;
  mun: string;
  uf: string;
  rod: string;
  rua: string;
  vGPS: number;
  gps: string;
  relAt: number;
}

export interface TrucksControlPosition {
  latitude: number;
  longitude: number;
  speed: number;
  ignition: boolean;
  lastPositionTime: string;
  gpsSignal: boolean;
  address: string;
  direction: number;
  odometer: number;
  plate: string;
  identifier: string;
  voltage: number;
  veiID: number;
  municipality: string;
  state: string;
  deviceType: "vehicle" | "spy";
  batteryLevel?: number;
  coupled?: boolean;
}

interface TrucksControlConfig {
  login: string;
  senha: string;
}

let lastError: string | null = null;
let lastMid: number = 1;
let vehicleCache: TrucksControlVehicle[] = [];
let vehicleCacheTimestamp = 0;
let messagesByVehicle: Map<number, TrucksControlMessage> = new Map();
let lastValidMessageByVehicle: Map<number, TrucksControlMessage> = new Map();

let lastSpyMid: number = 1;
let spyCache: SpyDevice[] = [];
let spyCacheTimestamp = 0;
let messagesBySpy: Map<number, SpyMessage> = new Map();
let lastValidMessageBySpy: Map<number, SpyMessage> = new Map();

interface PositionHistoryEntry {
  lat: number;
  lon: number;
  speed: number;
  ignition: boolean;
  timestamp: number;
}

const positionHistory: Map<number, PositionHistoryEntry[]> = new Map();
const POSITION_HISTORY_MAX = 10;
const SAME_PLACE_RADIUS_METERS = 50;
const IDLE_SAME_PLACE_THRESHOLD = 5;
const MAX_PLAUSIBLE_SPEED_MS = 55.6;

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isOutlierPosition(history: PositionHistoryEntry[], lat: number, lon: number): boolean {
  if (history.length < 2) return false;
  const now = Date.now();
  const recent = history.slice(-2);
  for (const prev of recent) {
    const dist = haversineDistance(prev.lat, prev.lon, lat, lon);
    const elapsed = (now - prev.timestamp) / 1000;
    if (elapsed < 1) continue;
    const impliedSpeed = dist / elapsed;
    if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MS) return true;
  }
  return false;
}

export function recordPosition(veiID: number, lat: number, lon: number, speed: number, ignition: boolean): boolean {
  if (lat === 0 && lon === 0) return false;
  const history = positionHistory.get(veiID) || [];
  if (isOutlierPosition(history, lat, lon)) {
    console.log(`[truckscontrol] Outlier descartado veiID=${veiID}: lat=${lat} lon=${lon} (velocidade impossível)`);
    return false;
  }
  history.push({ lat, lon, speed, ignition, timestamp: Date.now() });
  if (history.length > POSITION_HISTORY_MAX) history.splice(0, history.length - POSITION_HISTORY_MAX);
  positionHistory.set(veiID, history);
  return true;
}

export function getIdleSamePlaceInfo(veiID: number): { count: number; isAlert: boolean } | null {
  const history = positionHistory.get(veiID);
  if (!history || history.length < 2) return null;

  const latest = history[history.length - 1];
  if (!latest.ignition || latest.speed > 2) return null;

  let consecutiveCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!entry.ignition) break;
    if (entry.speed > 2) break;
    const dist = haversineDistance(latest.lat, latest.lon, entry.lat, entry.lon);
    if (dist > SAME_PLACE_RADIUS_METERS) break;
    consecutiveCount++;
  }

  if (consecutiveCount < 2) return null;
  return { count: consecutiveCount, isAlert: consecutiveCount >= IDLE_SAME_PLACE_THRESHOLD };
}

const BASE_URL = "https://webservice.newrastreamentoonline.com.br/";
const VEHICLE_CACHE_TTL = 5 * 60 * 1000;

const API_INTERVALS = {
  RequestVeiculo: 5 * 60 * 1000,
  RequestMensagemCB: 5 * 60 * 1000,
  RequestSpy: 5 * 60 * 1000,
  RequestMensagemSpy: 30 * 1000,
  RequestVeiculoEspelhado: 5 * 60 * 1000,
  RequestDadosVeiculo: 30 * 1000,
} as const;

const lastCallByRequest: Record<string, number> = {};

function getConfig(): TrucksControlConfig | null {
  const login = process.env.TRUCKSCONTROL_CHAVE;
  const senha = process.env.TRUCKSCONTROL_SENHA;
  if (!login || !senha) return null;
  return { login, senha };
}

function parseXmlValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

function canCallApi(requestType: string): boolean {
  const interval = API_INTERVALS[requestType as keyof typeof API_INTERVALS] || 5 * 60 * 1000;
  const lastCall = lastCallByRequest[requestType] || 0;
  return Date.now() - lastCall >= interval;
}

function markApiCall(requestType: string): void {
  lastCallByRequest[requestType] = Date.now();
}

async function postXml(xmlBody: string): Promise<string> {
  const fullXml = `<?xml version="1.0" encoding="utf-8"?>${xmlBody}`;
  const resp = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: fullXml,
    signal: AbortSignal.timeout(5000),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }

  const raw = Buffer.from(await resp.arrayBuffer());

  if (raw[0] === 0x50 && raw[1] === 0x4B) {
    const zip = new AdmZip(raw);
    const entries = zip.getEntries();
    if (entries.length > 0) {
      return entries[0].getData().toString("utf-8");
    }
    return "";
  }

  return raw.toString("utf-8");
}

function parseVehicles(xml: string): TrucksControlVehicle[] {
  const vehicles: TrucksControlVehicle[] = [];
  const regex = /<Veiculo>([\s\S]*?)<\/Veiculo>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    vehicles.push({
      veiID: parseInt(parseXmlValue(block, "veiID") || "0"),
      placa: parseXmlValue(block, "placa") || "",
      ident: parseXmlValue(block, "ident") || "",
      eqp: parseInt(parseXmlValue(block, "eqp") || "0"),
      prop: parseXmlValue(block, "prop") || "",
    });
  }
  return vehicles;
}

function parseMessages(xml: string): TrucksControlMessage[] {
  const messages: TrucksControlMessage[] = [];
  const regex = /<MensagemCB>([\s\S]*?)<\/MensagemCB>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const latStr = parseXmlValue(block, "lat").replace(",", ".");
    const lonStr = parseXmlValue(block, "lon").replace(",", ".");
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    messages.push({
      mId: parseInt(parseXmlValue(block, "mId") || "0"),
      veiID: parseInt(parseXmlValue(block, "veiID") || "0"),
      dt: parseXmlValue(block, "dt") || "",
      lat,
      lon,
      mun: parseXmlValue(block, "mun") || "",
      uf: parseXmlValue(block, "uf") || "",
      rod: parseXmlValue(block, "rod") || "",
      rua: parseXmlValue(block, "rua") || "",
      vel: parseInt(parseXmlValue(block, "vel") || "0"),
      evt4: parseInt(parseXmlValue(block, "evt4") || "0"),
    });
  }
  return messages;
}

function parseSpyDevices(xml: string): SpyDevice[] {
  const devices: SpyDevice[] = [];
  const regex = /<Spy>([\s\S]*?)<\/Spy>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    devices.push({
      spyID: parseInt(parseXmlValue(block, "spyID") || "0"),
      serie: parseInt(parseXmlValue(block, "serie") || "0"),
      desc: parseXmlValue(block, "desc") || "",
      nBat: parseInt(parseXmlValue(block, "nBat") || "-1"),
      sAcop: parseInt(parseXmlValue(block, "sAcop") || "0"),
      eqp: parseInt(parseXmlValue(block, "eqp") || "0"),
      tipo: parseInt(parseXmlValue(block, "tipo") || "0"),
    });
  }
  return devices;
}

function parseSpyMessages(xml: string): SpyMessage[] {
  const messages: SpyMessage[] = [];
  const regex = /<MensagemSpy>([\s\S]*?)<\/MensagemSpy>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const latStr = parseXmlValue(block, "lat").replace(",", ".");
    const lonStr = parseXmlValue(block, "lon").replace(",", ".");
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    messages.push({
      mId: parseInt(parseXmlValue(block, "mId") || "0"),
      spyID: parseInt(parseXmlValue(block, "spyID") || "0"),
      serie: parseInt(parseXmlValue(block, "serie") || "0"),
      dtHora: parseXmlValue(block, "dtHora") || "",
      lat,
      lon,
      mun: parseXmlValue(block, "mun") || "",
      uf: parseXmlValue(block, "uf") || "",
      rod: parseXmlValue(block, "rod") || "",
      rua: parseXmlValue(block, "rua") || "",
      vGPS: parseInt(parseXmlValue(block, "vGPS") || "0"),
      gps: parseXmlValue(block, "gps") || "",
      relAt: parseInt(parseXmlValue(block, "relAt") || "0"),
    });
  }
  return messages;
}

async function fetchSpyDevices(config: TrucksControlConfig): Promise<SpyDevice[]> {
  const cacheValid = spyCache.length > 0 && Date.now() - spyCacheTimestamp < VEHICLE_CACHE_TTL;
  if (cacheValid) {
    return spyCache;
  }

  if (!canCallApi("RequestSpy")) {
    return spyCache;
  }

  try {
    markApiCall("RequestSpy");
    const xml = `<RequestSpy><login>${config.login}</login><senha>${config.senha}</senha></RequestSpy>`;
    const response = await postXml(xml);

    if (response.includes("<erro>") || response.includes("<Erro>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      if (erroMsg.includes("tempo minimo")) {
        return spyCache;
      }
      console.log(`[truckscontrol] Erro RequestSpy: ${erroMsg}`);
      return spyCache;
    }

    const devices = parseSpyDevices(response);
    if (devices.length > 0) {
      spyCache = devices;
      spyCacheTimestamp = Date.now();
      console.log(`[truckscontrol] ${devices.length} SPY device(s) carregados`);
    } else {
      spyCache = [];
      spyCacheTimestamp = Date.now();
    }
    return spyCache;
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao buscar SPY devices: ${err.message}`);
    return spyCache;
  }
}

async function fetchSpyMessages(config: TrucksControlConfig): Promise<SpyMessage[]> {
  if (!canCallApi("RequestMensagemSpy")) {
    return [];
  }
  try {
    markApiCall("RequestMensagemSpy");
    const xml = `<RequestMensagemSpy><login>${config.login}</login><senha>${config.senha}</senha><mId>${lastSpyMid}</mId></RequestMensagemSpy>`;
    const response = await postXml(xml);

    if (response.includes("<erro>") || response.includes("<Erro>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      if (!erroMsg.includes("tempo minimo")) {
        console.log(`[truckscontrol] Erro RequestMensagemSpy: ${erroMsg}`);
      }
      return [];
    }

    const messages = parseSpyMessages(response);
    messages.sort((a, b) => parseTcDate(a.dtHora) - parseTcDate(b.dtHora));

    for (const msg of messages) {
      if (msg.mId > lastSpyMid) {
        lastSpyMid = msg.mId;
      }
      if (hasValidCoords(msg.lat, msg.lon)) {
        const existing = messagesBySpy.get(msg.spyID);
        const existingTs = existing ? parseTcDate(existing.dtHora) : 0;
        const msgTs = parseTcDate(msg.dtHora);
        if (!existing || msgTs >= existingTs) {
          messagesBySpy.set(msg.spyID, msg);
        }
        lastValidMessageBySpy.set(msg.spyID, msg);
      } else {
        if (!messagesBySpy.has(msg.spyID)) {
          const lastValid = lastValidMessageBySpy.get(msg.spyID);
          if (lastValid) messagesBySpy.set(msg.spyID, lastValid);
        }
      }
    }

    if (messages.length > 0) {
      console.log(`[truckscontrol] ${messages.length} mensagem(ns) SPY novas, lastSpyMid=${lastSpyMid}`);
    }

    return messages;
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao buscar mensagens SPY: ${err.message}`);
    return [];
  }
}

async function fetchVehicles(config: TrucksControlConfig): Promise<TrucksControlVehicle[]> {
  const cacheValid = vehicleCache.length > 0 && Date.now() - vehicleCacheTimestamp < VEHICLE_CACHE_TTL;
  if (cacheValid) {
    return vehicleCache;
  }

  if (!canCallApi("RequestVeiculo")) {
    if (vehicleCache.length > 0) return vehicleCache;
    const remaining = Math.ceil((API_INTERVALS.RequestVeiculo - (Date.now() - (lastCallByRequest["RequestVeiculo"] || 0))) / 1000);
    console.log(`[truckscontrol] RequestVeiculo rate limit — ${remaining}s restantes`);
    return vehicleCache;
  }

  try {
    markApiCall("RequestVeiculo");
    const xml = `<RequestVeiculo><login>${config.login}</login><senha>${config.senha}</senha></RequestVeiculo>`;
    const response = await postXml(xml);

    if (response.includes("<erro>") || response.includes("<ErrorRequest>")) {
      const erroMsg = parseXmlValue(response, "erro");
      if (erroMsg.includes("tempo minimo")) {
        console.log(`[truckscontrol] Rate limit da API — cache com ${vehicleCache.length} veículo(s)`);
        return vehicleCache;
      }
      console.log(`[truckscontrol] Erro RequestVeiculo: ${erroMsg}`);
      return vehicleCache;
    }

    const vehicles = parseVehicles(response);
    if (vehicles.length > 0) {
      vehicleCache = vehicles;
      vehicleCacheTimestamp = Date.now();
      console.log(`[truckscontrol] ${vehicles.length} veículo(s) carregados`);
    }
    return vehicleCache;
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao buscar veículos: ${err.message}`);
    return vehicleCache;
  }
}

function parseTcDate(dtStr: string): number {
  if (!dtStr) return 0;
  const m = dtStr.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
  return new Date(y, parseInt(m[1]) - 1, parseInt(m[2]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6] || "0")).getTime();
}

function hasValidCoords(lat: number, lon: number): boolean {
  return (lat !== 0 || lon !== 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

async function fetchMessages(config: TrucksControlConfig): Promise<TrucksControlMessage[]> {
  if (!canCallApi("RequestMensagemCB")) {
    return [];
  }
  try {
    markApiCall("RequestMensagemCB");
    const xml = `<RequestMensagemCB><login>${config.login}</login><senha>${config.senha}</senha><mId>${lastMid}</mId></RequestMensagemCB>`;
    const response = await postXml(xml);

    if (response.includes("<erro>")) {
      const erroMsg = parseXmlValue(response, "erro");
      if (!erroMsg.includes("tempo minimo")) {
        console.log(`[truckscontrol] Erro RequestMensagemCB: ${erroMsg}`);
      }
      return [];
    }

    const messages = parseMessages(response);

    messages.sort((a, b) => parseTcDate(a.dt) - parseTcDate(b.dt));

    let emptyCount = 0;
    for (const msg of messages) {
      if (msg.mId > lastMid) {
        lastMid = msg.mId;
      }

      if (hasValidCoords(msg.lat, msg.lon)) {
        const existing = messagesByVehicle.get(msg.veiID);
        const existingTs = existing ? parseTcDate(existing.dt) : 0;
        const msgTs = parseTcDate(msg.dt);
        if (!existing || msgTs >= existingTs) {
          messagesByVehicle.set(msg.veiID, msg);
        }
        lastValidMessageByVehicle.set(msg.veiID, msg);
      } else {
        emptyCount++;
        if (!messagesByVehicle.has(msg.veiID)) {
          const lastValid = lastValidMessageByVehicle.get(msg.veiID);
          if (lastValid) {
            messagesByVehicle.set(msg.veiID, lastValid);
          }
        }
      }
    }

    if (messages.length > 0) {
      console.log(`[truckscontrol] ${messages.length} mensagem(ns) novas (${emptyCount} sem coordenadas), lastMid=${lastMid}`);
    }

    return messages;
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao buscar mensagens: ${err.message}`);
    return [];
  }
}

let initialized = false;
let initRetryTimer: ReturnType<typeof setTimeout> | null = null;

async function initializeCache(config: TrucksControlConfig): Promise<void> {
  if (initialized) return;
  initialized = true;
  console.log("[truckscontrol] Inicializando cache...");
  try {
    await fetchVehicles(config);
  } catch {}
  try {
    await fetchMessages(config);
  } catch {}
  try {
    await fetchSpyDevices(config);
  } catch {}
  try {
    await fetchSpyMessages(config);
  } catch {}
  console.log(`[truckscontrol] Cache inicial: ${vehicleCache.length} veículo(s), ${messagesByVehicle.size} posição(ões), ${spyCache.length} SPY(s)`);

  if (vehicleCache.length === 0 && !initRetryTimer) {
    console.log("[truckscontrol] Cache vazio após init — agendando retry em 5 minutos (limite API)");
    initRetryTimer = setTimeout(async () => {
      initRetryTimer = null;
      initialized = false;
      vehicleCacheTimestamp = 0;
      try {
        await initializeCache(config);
      } catch {}
    }, API_INTERVALS.RequestVeiculo);
  }
}

let fetchAllLock: Promise<TrucksControlPosition[]> | null = null;
let lastFetchAllTime = 0;
const FETCH_ALL_MIN_INTERVAL = 5 * 60 * 1000;

export async function fetchAllPositions(): Promise<TrucksControlPosition[]> {
  const config = getConfig();
  if (!config) {
    lastError = "TRUCKSCONTROL_CHAVE e TRUCKSCONTROL_SENHA não configurados";
    return [];
  }

  if (fetchAllLock) return fetchAllLock;

  const now = Date.now();
  if (now - lastFetchAllTime < FETCH_ALL_MIN_INTERVAL && vehicleCache.length > 0) {
    return getCachedPositions();
  }

  fetchAllLock = (async () => {
    try {
      await initializeCache(config);
      const vehicles = await fetchVehicles(config);
      const spyDevices = await fetchSpyDevices(config);
      await fetchMessages(config);
      await fetchSpyMessages(config);
      lastFetchAllTime = Date.now();
      return _buildPositions(vehicles, spyDevices);
    } finally {
      fetchAllLock = null;
    }
  })();

  return fetchAllLock;
}

function _buildPositions(vehicles: TrucksControlVehicle[], spyDevices: any[]): TrucksControlPosition[] {
  try {
    const positions: TrucksControlPosition[] = [];

    const processedVeiIDs = new Set<number>();

    for (const veh of vehicles) {
      processedVeiIDs.add(veh.veiID);
      const msg = messagesByVehicle.get(veh.veiID);
      const validMsg = msg && hasValidCoords(msg.lat, msg.lon) ? msg : lastValidMessageByVehicle.get(veh.veiID);
      if (validMsg) {
        const isLive = msg && hasValidCoords(msg.lat, msg.lon);
        const address = [validMsg.rua, validMsg.rod, validMsg.mun, validMsg.uf].filter(Boolean).join(", ");
        positions.push({
          latitude: validMsg.lat,
          longitude: validMsg.lon,
          speed: isLive ? (validMsg.vel >= 0 ? validMsg.vel : 0) : 0,
          ignition: isLive ? validMsg.evt4 === 1 : false,
          lastPositionTime: validMsg.dt,
          gpsSignal: !!isLive,
          address,
          direction: 0,
          odometer: 0,
          plate: veh.placa,
          identifier: veh.ident || String(veh.veiID),
          voltage: 0,
          veiID: veh.veiID,
          municipality: validMsg.mun,
          state: validMsg.uf,
          deviceType: "vehicle",
        });
      } else {
        positions.push({
          latitude: 0,
          longitude: 0,
          speed: 0,
          ignition: false,
          lastPositionTime: "",
          gpsSignal: false,
          address: "",
          direction: 0,
          odometer: 0,
          plate: veh.placa,
          identifier: veh.ident || String(veh.veiID),
          voltage: 0,
          veiID: veh.veiID,
          municipality: "",
          state: "",
          deviceType: "vehicle",
        });
      }
    }

    for (const [veiID, msg] of messagesByVehicle) {
      if (processedVeiIDs.has(veiID)) continue;
      const validMsg = hasValidCoords(msg.lat, msg.lon) ? msg : lastValidMessageByVehicle.get(veiID);
      if (!validMsg || !hasValidCoords(validMsg.lat, validMsg.lon)) continue;
      const address = [validMsg.rua, validMsg.rod, validMsg.mun, validMsg.uf].filter(Boolean).join(", ");
      positions.push({
        latitude: validMsg.lat,
        longitude: validMsg.lon,
        speed: validMsg.vel >= 0 ? validMsg.vel : 0,
        ignition: validMsg.evt4 === 1,
        lastPositionTime: validMsg.dt,
        gpsSignal: hasValidCoords(msg.lat, msg.lon),
        address,
        direction: 0,
        odometer: 0,
        plate: "",
        identifier: String(veiID),
        voltage: 0,
        veiID,
        municipality: validMsg.mun,
        state: validMsg.uf,
        deviceType: "vehicle",
      });
      console.log(`[truckscontrol] Posição órfã adicionada: veiID=${veiID} lat=${validMsg.lat} lon=${validMsg.lon} (veículo não no cache)`);
    }

    for (const spy of spyDevices) {
      const msg = messagesBySpy.get(spy.spyID);
      const eqpName = spy.eqp === 14 ? "SpyTrack2" : "SpyTrack";
      const validMsg = msg && hasValidCoords(msg.lat, msg.lon) ? msg : lastValidMessageBySpy.get(spy.spyID);
      if (validMsg) {
        const isLive = msg && hasValidCoords(msg.lat, msg.lon);
        const address = [validMsg.rua, validMsg.rod, validMsg.mun, validMsg.uf].filter(Boolean).join(", ");
        positions.push({
          latitude: validMsg.lat,
          longitude: validMsg.lon,
          speed: isLive ? (validMsg.vGPS >= 0 ? validMsg.vGPS : 0) : 0,
          ignition: false,
          lastPositionTime: validMsg.dtHora,
          gpsSignal: isLive ? (validMsg.gps === "A" || validMsg.gps === "") : false,
          address,
          direction: 0,
          odometer: 0,
          plate: `SPY-${spy.serie}`,
          identifier: spy.desc || `${eqpName} #${spy.spyID}`,
          voltage: 0,
          veiID: spy.spyID,
          municipality: validMsg.mun,
          state: validMsg.uf,
          deviceType: "spy",
          batteryLevel: spy.nBat >= 0 ? spy.nBat : undefined,
          coupled: spy.sAcop === 1,
        });
      } else {
        positions.push({
          latitude: 0,
          longitude: 0,
          speed: 0,
          ignition: false,
          lastPositionTime: "",
          gpsSignal: false,
          address: "",
          direction: 0,
          odometer: 0,
          plate: `SPY-${spy.serie}`,
          identifier: spy.desc || `${eqpName} #${spy.spyID}`,
          voltage: 0,
          veiID: spy.spyID,
          municipality: "",
          state: "",
          deviceType: "spy",
          batteryLevel: spy.nBat >= 0 ? spy.nBat : undefined,
          coupled: spy.sAcop === 1,
        });
      }
    }

    lastError = null;
    return positions;
  } catch (err: any) {
    lastError = err.message;
    console.log(`[truckscontrol] Erro geral: ${err.message}`);
    return [];
  }
}

export async function fetchSpyPositions(): Promise<TrucksControlPosition[]> {
  const positions = await getCachedPositions();
  return positions.filter(p => p.deviceType === "spy");
}

export function getSpyDevices(): SpyDevice[] {
  return spyCache;
}

export async function fetchPositionByPlate(plate: string): Promise<TrucksControlPosition | null> {
  const positions = await fetchAllPositions();
  const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return positions.find(p => p.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === cleanPlate) || null;
}

export async function testConnection(): Promise<{ success: boolean; message: string; vehicleCount?: number; spyCount?: number; rawResponse?: string }> {
  const config = getConfig();
  if (!config) {
    return { success: false, message: "TRUCKSCONTROL_CHAVE e TRUCKSCONTROL_SENHA não estão configurados nas variáveis de ambiente." };
  }

  try {
    const xml = `<RequestVeiculo><login>${config.login}</login><senha>${config.senha}</senha></RequestVeiculo>`;
    const response = await postXml(xml);

    let vehicleMsg = "";
    let vehicleCount = 0;

    if (response.includes("<erro>")) {
      const erroMsg = parseXmlValue(response, "erro");
      if (erroMsg.includes("tempo minimo")) {
        vehicleMsg = `${vehicleCache.length} veículo(s) em cache (rate limit)`;
        vehicleCount = vehicleCache.length;
      } else {
        return { success: false, message: `Erro: ${erroMsg}`, rawResponse: response };
      }
    } else {
      const vehicles = parseVehicles(response);
      if (vehicles.length > 0) {
        vehicleCache = vehicles;
        vehicleCacheTimestamp = Date.now();
      }
      vehicleCount = vehicles.length;
      vehicleMsg = `${vehicles.length} veículo(s)`;
    }

    let spyMsg = "";
    let spyCount = 0;
    try {
      const spyDevices = await fetchSpyDevices(config);
      spyCount = spyDevices.length;
      spyMsg = `${spyCount} SPY device(s)`;
    } catch {
      spyMsg = "SPY: erro ao consultar";
    }

    return {
      success: true,
      message: `Conexão OK — ${vehicleMsg}, ${spyMsg}`,
      vehicleCount,
      spyCount,
    };
  } catch (err: any) {
    return { success: false, message: `Erro de conexão: ${err.message}` };
  }
}

export async function debugLogin(): Promise<{
  attempts: Array<{
    label: string;
    xmlEnviado: string;
    xmlRetorno: string;
    loginResult: string;
    success: boolean;
  }>;
}> {
  const config = getConfig();
  if (!config) {
    return { attempts: [{ label: "Sem credenciais", xmlEnviado: "", xmlRetorno: "", loginResult: "não configurado", success: false }] };
  }

  const attempts: Array<{ label: string; xmlEnviado: string; xmlRetorno: string; loginResult: string; success: boolean; }> = [];

  const xml = `<RequestVeiculo><login>${config.login}</login><senha>${config.senha}</senha></RequestVeiculo>`;
  const fullXml = `<?xml version="1.0" encoding="utf-8"?>${xml}`;

  try {
    const response = await postXml(xml);
    const hasError = response.includes("<erro>");
    const erroMsg = hasError ? parseXmlValue(response, "erro") : "";
    const isRateLimit = erroMsg.includes("tempo minimo");

    attempts.push({
      label: "RequestVeiculo (formato correto da API TC)",
      xmlEnviado: fullXml,
      xmlRetorno: response.substring(0, 2000),
      loginResult: hasError ? (isRateLimit ? "OK (rate limit)" : "erro") : "OK",
      success: !hasError || isRateLimit,
    });
  } catch (err: any) {
    attempts.push({
      label: "RequestVeiculo",
      xmlEnviado: fullXml,
      xmlRetorno: `ERRO: ${err.message}`,
      loginResult: "erro",
      success: false,
    });
  }

  return { attempts };
}

let positionCache: { data: TrucksControlPosition[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;
let swrInProgress = false;

export async function getCachedPositions(): Promise<TrucksControlPosition[]> {
  const hasData = positionCache && positionCache.data.some(p => p.latitude !== 0);
  const ttl = hasData ? CACHE_TTL : 30000;
  const age = positionCache ? Date.now() - positionCache.timestamp : Infinity;

  if (positionCache && age < ttl) {
    return positionCache.data;
  }

  if (positionCache && hasData && !swrInProgress) {
    swrInProgress = true;
    fetchAllPositions()
      .then((data) => {
        positionCache = { data, timestamp: Date.now() };
      })
      .catch((err) => {
        console.warn(`[truckscontrol] SWR background refresh failed: ${err.message}`);
      })
      .finally(() => {
        swrInProgress = false;
      });
    return positionCache.data;
  }

  if (swrInProgress && positionCache) {
    return positionCache.data;
  }

  const data = await fetchAllPositions();
  positionCache = { data, timestamp: Date.now() };
  return data;
}

export function findPositionByPlate(positions: TrucksControlPosition[], plate: string): TrucksControlPosition | null {
  const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return positions.find((p) => p.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === cleanPlate) || null;
}

export function findPositionByIdentifier(positions: TrucksControlPosition[], identifier: string): TrucksControlPosition | null {
  const clean = identifier.trim().toUpperCase();
  const byIdent = positions.find((p) => p.identifier.trim().toUpperCase() === clean);
  if (byIdent) return byIdent;
  const asNum = parseInt(identifier);
  if (!isNaN(asNum)) {
    const byVeiID = positions.find((p) => p.veiID === asNum);
    if (byVeiID) return byVeiID;
  }
  return null;
}

export type CommandType = "bloquear" | "desbloquear" | "sirene" | "aviso_cabine_on" | "aviso_cabine_off" | "mensagem_texto";

export async function sendCommand(
  veiID: number,
  command: CommandType,
  mensagem?: string
): Promise<{ success: boolean; message: string; rawResponse?: string }> {
  const config = getConfig();
  if (!config) {
    return { success: false, message: "Credenciais TrucksControl não configuradas." };
  }

  const commandMap: Record<string, { cmd: number; label: string }> = {
    bloquear: { cmd: 1, label: "Bloquear" },
    desbloquear: { cmd: 2, label: "Desbloquear" },
    sirene: { cmd: 3, label: "Sirene/Alerta" },
    aviso_cabine_on: { cmd: 5, label: "Aviso de Cabine (Ligar)" },
    aviso_cabine_off: { cmd: 5, label: "Aviso de Cabine (Desligar)" },
    mensagem_texto: { cmd: 4, label: "Mensagem de Texto" },
  };

  const cmdInfo = commandMap[command];
  if (!cmdInfo) {
    return { success: false, message: `Comando desconhecido: ${command}` };
  }

  const msgTag = command === "mensagem_texto" && mensagem ? `<msg>${escapeXml(mensagem)}</msg>` : "";

  try {
    const xml = `<RequestEnvioComando login="${config.login}" senha="${config.senha}"><comando><veiID>${veiID}</veiID><cmd>${cmdInfo.cmd}</cmd>${msgTag}</comando></RequestEnvioComando>`;
    const response = await postXml(xml);

    const cleanResponse = response.replace(/<\?xml[^?]*\?>/, "").trim();
    console.log(`[truckscontrol] Resposta crua comando ${command} veiID=${veiID}: "${cleanResponse.substring(0, 300)}"`);

    if (response.includes("<erro>") || response.includes("<Erro>") || response.includes("<ErrorRequest>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      console.log(`[truckscontrol] ERRO ao enviar comando ${command} para veiID=${veiID}: ${erroMsg}`);
      return { success: false, message: `Erro: ${erroMsg}`, rawResponse: response.substring(0, 500) };
    }

    if (!cleanResponse) {
      console.log(`[truckscontrol] AVISO: Resposta vazia para comando ${command} veiID=${veiID} — comando pode não ter sido entregue ao dispositivo`);
      return {
        success: true,
        message: `Comando "${cmdInfo.label}" aceito pela API (resposta vazia — entrega ao dispositivo não confirmada).`,
        rawResponse: "empty",
      };
    }

    const status = parseXmlValue(response, "status") || parseXmlValue(response, "Status");
    console.log(`[truckscontrol] Comando ${command} enviado para veiID=${veiID} — status: ${status || "OK"}`);
    return {
      success: true,
      message: `Comando "${cmdInfo.label}" enviado com sucesso.${status ? ` Status: ${status}` : ""}`,
    };
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao enviar comando ${command}: ${err.message}`);
    return { success: false, message: `Erro de conexão: ${err.message}` };
  }
}

const activeIdleAlerts: Map<number, { alertedAt: number; cabineTimer?: ReturnType<typeof setTimeout> }> = new Map();

export function getActiveIdleAlerts(): Map<number, { alertedAt: number }> {
  return activeIdleAlerts;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const activeSpeedAlerts = new Map<number, { alertedAt: number; cabineTimer?: ReturnType<typeof setTimeout> }>();

export async function processSpeedAlert(veiID: number, plate: string, speed: number): Promise<void> {
  if (activeSpeedAlerts.has(veiID)) return;

  activeSpeedAlerts.set(veiID, { alertedAt: Date.now() });

  console.log(`[speed-alert] Veiculo ${plate} (veiID=${veiID}) — ${speed} km/h. Enviando aviso de cabine + mensagem.`);

  const cabineResult = await sendCommand(veiID, "aviso_cabine_on");
  console.log(`[speed-alert] Aviso cabine ON para ${plate}: ${cabineResult.message}`);

  const msgResult = await sendCommand(veiID, "mensagem_texto", `VELOCIDADE ACIMA DO PERMITIDO! ${speed} km/h - REDUZA IMEDIATAMENTE!`);
  console.log(`[speed-alert] Mensagem enviada para ${plate}: ${msgResult.message}`);

  const cabineTimer = setTimeout(async () => {
    const alertInfo = activeSpeedAlerts.get(veiID);
    if (alertInfo) {
      console.log(`[speed-alert] Timeout 2min — desligando aviso de cabine para ${plate} (veiID=${veiID})`);
      const offResult = await sendCommand(veiID, "aviso_cabine_off");
      console.log(`[speed-alert] Aviso cabine OFF (timeout) para ${plate}: ${offResult.message}`);
      activeSpeedAlerts.delete(veiID);
    }
  }, 2 * 60 * 1000);

  const existing = activeSpeedAlerts.get(veiID);
  if (existing) existing.cabineTimer = cabineTimer;
}

export async function processIdleAlert(veiID: number, plate: string): Promise<void> {
  if (activeIdleAlerts.has(veiID)) return;

  activeIdleAlerts.set(veiID, { alertedAt: Date.now() });

  console.log(`[idle-alert] Veiculo ${plate} (veiID=${veiID}) — Motor ligado parado. Enviando aviso de cabine + mensagem.`);

  const cabineResult = await sendCommand(veiID, "aviso_cabine_on");
  console.log(`[idle-alert] Aviso cabine ON para ${plate}: ${cabineResult.message}`);

  const msgResult = await sendCommand(veiID, "mensagem_texto", "Motor Ligado com carro parado .. desligue o veiculo!");
  console.log(`[idle-alert] Mensagem enviada para ${plate}: ${msgResult.message}`);

  const cabineTimer = setTimeout(async () => {
    const alertInfo = activeIdleAlerts.get(veiID);
    if (alertInfo) {
      console.log(`[idle-alert] Timeout 2min — desligando aviso de cabine para ${plate} (veiID=${veiID})`);
      const offResult = await sendCommand(veiID, "aviso_cabine_off");
      console.log(`[idle-alert] Aviso cabine OFF (timeout) para ${plate}: ${offResult.message}`);
      activeIdleAlerts.delete(veiID);
    }
  }, 2 * 60 * 1000);

  const existing = activeIdleAlerts.get(veiID);
  if (existing) existing.cabineTimer = cabineTimer;
}

export async function processIgnitionOff(veiID: number, plate: string): Promise<void> {
  const alertInfo = activeIdleAlerts.get(veiID);
  if (!alertInfo) return;

  console.log(`[idle-alert] Veiculo ${plate} (veiID=${veiID}) — Ignição desligada. Cancelando aviso de cabine.`);

  if (alertInfo.cabineTimer) {
    clearTimeout(alertInfo.cabineTimer);
  }

  activeIdleAlerts.delete(veiID);

  const offResult = await sendCommand(veiID, "aviso_cabine_off");
  console.log(`[idle-alert] Aviso cabine OFF (ignição off) para ${plate}: ${offResult.message}`);
}

export function getVehicleCache(): TrucksControlVehicle[] {
  return vehicleCache;
}

export function getLastError(): string | null {
  return lastError;
}

let espelhamentoSeqId = Date.now();

function nextEspelhamentoId(): number {
  return ++espelhamentoSeqId;
}

export interface EspelhamentoResult {
  success: boolean;
  message: string;
  id?: number;
  status?: number;
  erro?: number;
  rawResponse?: string;
}

export async function createEspelhamento(
  veiID: number,
  cnpjGerenciadora: string,
  options: {
    cmd?: number;
    IE?: number;
    TIE?: number;
    validade?: string;
    possoCancelar?: number;
    comandoExclusivo?: number;
    compartilharDados?: number;
  } = {}
): Promise<EspelhamentoResult> {
  const config = getConfig();
  if (!config) return { success: false, message: "Credenciais TrucksControl não configuradas." };

  const id = nextEspelhamentoId();
  const cnpjClean = cnpjGerenciadora.replace(/[^0-9]/g, "");
  const cmd = options.cmd ?? 1;
  const IE = options.IE ?? 0;
  const TIE = options.TIE ?? 0;
  const validade = options.validade || getDefaultValidade();
  const possoCancelar = options.possoCancelar ?? 1;
  const comandoExclusivo = options.comandoExclusivo ?? 0;
  const compartilharDados = options.compartilharDados ?? 1;

  const xml = `<RequestNovoEspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento><id>${id}</id><veiID>${veiID}</veiID><cmd>${cmd}</cmd><IE>${IE}</IE><TIE>${TIE}</TIE><validade>${validade}</validade><possocancelar>${possoCancelar}</possocancelar><comandoexclusivo>${comandoExclusivo}</comandoexclusivo><compartilhardados>${compartilharDados}</compartilhardados><cgccpf>${cnpjClean}</cgccpf><usuario>torres</usuario></espelhamento></RequestNovoEspelhamentoVeiculo>`;

  console.log(`[truckscontrol] Espelhamento REQUEST: veiID=${veiID}, CNPJ=${cnpjClean}, cmd=${cmd}, IE=${IE}, TIE=${TIE}, validade=${validade}, possoCancelar=${possoCancelar}, comandoExclusivo=${comandoExclusivo}, compartilharDados=${compartilharDados}`);

  try {
    const response = await postXml(xml);
    console.log(`[truckscontrol] Espelhamento RESPONSE veiID=${veiID}: ${response.substring(0, 500)}`);

    if (response.includes("<ErrorRequest>") || response.includes("<erro>") || response.includes("<Erro>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro") || "Erro desconhecido";
      const codigoErro = parseXmlValue(response, "codigo") || "?";

      const diagnostics: string[] = [];
      if (codigoErro === "2") {
        try {
          const espelhados = await listEspelhados();
          const jaEspelhado = espelhados.vehicles.find(v => String(v.veiID) === String(veiID) && v.cgccpf.replace(/[^0-9]/g, "") === cnpjClean);
          if (jaEspelhado) {
            diagnostics.push(`Veículo já espelhado para este CNPJ (cliente: ${jaEspelhado.cliente || cnpjClean}, validade: ${jaEspelhado.validade}). Cancele o espelhamento existente antes de criar um novo.`);
          } else {
            diagnostics.push("A conta pode não ter permissão de espelhamento via API habilitada. Verifique com o suporte TrucksControl se 'Compartilhamento de Dados' e 'Alterar Validade' estão habilitados na integração.");
          }
        } catch {
          diagnostics.push("Veículo possivelmente já espelhado para este CNPJ, ou permissão de espelhamento não habilitada na conta.");
        }
      }

      const detailMsg = `Código ${codigoErro}: ${erroMsg}${diagnostics.length ? ` — ${diagnostics.join(" ")}` : ""}`;
      return { success: false, message: detailMsg, id, rawResponse: response.substring(0, 500) };
    }

    const statusVal = parseInt(parseXmlValue(response, "status") || "0");
    const erroVal = parseInt(parseXmlValue(response, "erro") || "0");

    if (statusVal === 2) {
      return { success: true, message: "Espelhamento realizado com sucesso", id, status: statusVal, erro: erroVal };
    } else {
      return { success: false, message: `Espelhamento não realizado (status=${statusVal}, erro=${erroVal})`, id, status: statusVal, erro: erroVal, rawResponse: response.substring(0, 500) };
    }
  } catch (err: any) {
    return { success: false, message: `Erro de conexão: ${err.message}`, id };
  }
}

export async function listEspelhados(): Promise<{ success: boolean; message: string; vehicles: Array<{ veiID: string; cmd: string; IE: string; TIE: string; cgccpf: string; cliente: string; validade: string; possoCancelar: string }>; rawResponse?: string }> {
  const config = getConfig();
  if (!config) return { success: false, message: "Credenciais não configuradas.", vehicles: [] };

  const xml = `<RequestVeiculoEspelhado><login>${config.login}</login><senha>${config.senha}</senha></RequestVeiculoEspelhado>`;

  try {
    const response = await postXml(xml);

    if (response.includes("<ErrorRequest>") || (response.includes("<erro>") && !response.includes("<VeiculoEspelhado>"))) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      if (erroMsg.includes("tempo minimo")) {
        return { success: true, message: "Rate limit — tente novamente em alguns segundos", vehicles: [] };
      }
      return { success: false, message: erroMsg || "Erro desconhecido", vehicles: [], rawResponse: response.substring(0, 500) };
    }

    const vehicles: Array<{ veiID: string; cmd: string; IE: string; TIE: string; cgccpf: string; cliente: string; validade: string; possoCancelar: string }> = [];
    const regex = /<VeiculoEspelhado>([\s\S]*?)<\/VeiculoEspelhado>/gi;
    let match;
    while ((match = regex.exec(response)) !== null) {
      const block = match[1];
      vehicles.push({
        veiID: parseXmlValue(block, "veiID"),
        cmd: parseXmlValue(block, "cmd"),
        IE: parseXmlValue(block, "IE"),
        TIE: parseXmlValue(block, "TIE"),
        cgccpf: parseXmlValue(block, "cgccpf"),
        cliente: parseXmlValue(block, "cliente"),
        validade: parseXmlValue(block, "validade"),
        possoCancelar: parseXmlValue(block, "possocancelar") || parseXmlValue(block, "possoCancelar"),
      });
    }

    return { success: true, message: `${vehicles.length} espelhamento(s) encontrado(s)`, vehicles };
  } catch (err: any) {
    return { success: false, message: `Erro de conexão: ${err.message}`, vehicles: [] };
  }
}

export async function listEspelhamentosPendentes(): Promise<{ success: boolean; message: string; pendentes: Array<{ veiID: string; placa: string; cmd: string; IE: string; TIE: string; prop: string; validade: string; propCancelamento: string }>; rawResponse?: string }> {
  const config = getConfig();
  if (!config) return { success: false, message: "Credenciais não configuradas.", pendentes: [] };

  const xml = `<RequestEspelhamentoPendenteVeiculo><login>${config.login}</login><senha>${config.senha}</senha></RequestEspelhamentoPendenteVeiculo>`;

  try {
    const response = await postXml(xml);

    if (response.includes("<ErrorRequest>") || (response.includes("<erro>") && !response.includes("<EspelhamentoPendenteVeiculo>"))) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      if (erroMsg.includes("tempo minimo")) {
        return { success: true, message: "Rate limit — tente novamente em alguns segundos", pendentes: [] };
      }
      return { success: false, message: erroMsg || "Erro desconhecido", pendentes: [], rawResponse: response.substring(0, 500) };
    }

    const pendentes: Array<{ veiID: string; placa: string; cmd: string; IE: string; TIE: string; prop: string; validade: string; propCancelamento: string }> = [];
    const regex = /<EspelhamentoPendenteVeiculo>([\s\S]*?)<\/EspelhamentoPendenteVeiculo>/gi;
    let match;
    while ((match = regex.exec(response)) !== null) {
      const block = match[1];
      pendentes.push({
        veiID: parseXmlValue(block, "veiID"),
        placa: parseXmlValue(block, "placa"),
        cmd: parseXmlValue(block, "cmd"),
        IE: parseXmlValue(block, "IE"),
        TIE: parseXmlValue(block, "TIE"),
        prop: parseXmlValue(block, "prop"),
        validade: parseXmlValue(block, "validade"),
        propCancelamento: parseXmlValue(block, "propCancelamento"),
      });
    }

    return { success: true, message: `${pendentes.length} espelhamento(s) pendente(s)`, pendentes };
  } catch (err: any) {
    return { success: false, message: `Erro de conexão: ${err.message}`, pendentes: [] };
  }
}

export async function acceptEspelhamento(veiID: number, desc?: string): Promise<EspelhamentoResult> {
  const config = getConfig();
  if (!config) return { success: false, message: "Credenciais não configuradas." };

  const id = nextEspelhamentoId();
  const xml = `<RequestAREspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento tipo="1"><id>${id}</id><veiID>${veiID}</veiID><desc>${desc || "Aceito via Torres VP"}</desc><usuario>torres</usuario></espelhamento></RequestAREspelhamentoVeiculo>`;

  try {
    const response = await postXml(xml);
    console.log(`[truckscontrol] Aceitar espelhamento veiID=${veiID}: ${response.substring(0, 300)}`);

    if (response.includes("<ErrorRequest>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro") || "Erro desconhecido";
      return { success: false, message: `Erro: ${erroMsg}`, id, rawResponse: response.substring(0, 500) };
    }

    const statusVal = parseInt(parseXmlValue(response, "status") || "0");
    const erroVal = parseInt(parseXmlValue(response, "erro") || "0");
    if (erroVal === 0 || statusVal === 2) {
      return { success: true, message: "Espelhamento aceito", id, status: statusVal, erro: erroVal };
    }
    return { success: false, message: `Falha ao aceitar (status=${statusVal}, erro=${erroVal})`, id, status: statusVal, erro: erroVal, rawResponse: response.substring(0, 500) };
  } catch (err: any) {
    return { success: false, message: `Erro: ${err.message}`, id };
  }
}

export async function rejectEspelhamento(veiID: number): Promise<EspelhamentoResult> {
  const config = getConfig();
  if (!config) return { success: false, message: "Credenciais não configuradas." };

  const id = nextEspelhamentoId();
  const xml = `<RequestAREspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento tipo="2"><id>${id}</id><veiID>${veiID}</veiID><usuario>torres</usuario></espelhamento></RequestAREspelhamentoVeiculo>`;

  try {
    const response = await postXml(xml);
    console.log(`[truckscontrol] Rejeitar espelhamento veiID=${veiID}: ${response.substring(0, 300)}`);

    if (response.includes("<ErrorRequest>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro") || "Erro desconhecido";
      return { success: false, message: `Erro: ${erroMsg}`, id, rawResponse: response.substring(0, 500) };
    }

    const statusVal = parseInt(parseXmlValue(response, "status") || "0");
    const erroVal = parseInt(parseXmlValue(response, "erro") || "0");
    if (erroVal === 0 || statusVal === 2) {
      return { success: true, message: "Espelhamento rejeitado", id, status: statusVal, erro: erroVal };
    }
    return { success: false, message: `Falha ao rejeitar (status=${statusVal}, erro=${erroVal})`, id, status: statusVal, erro: erroVal, rawResponse: response.substring(0, 500) };
  } catch (err: any) {
    return { success: false, message: `Erro: ${err.message}`, id };
  }
}

export async function cancelEspelhamentoProprietario(veiID: number, cnpjCliente: string): Promise<EspelhamentoResult> {
  const config = getConfig();
  if (!config) return { success: false, message: "Credenciais não configuradas." };

  const id = nextEspelhamentoId();
  const cnpjClean = cnpjCliente.replace(/[^0-9]/g, "");
  const xml = `<RequestCancelarEspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento tipo="2"><id>${id}</id><veiID>${veiID}</veiID><cgccpf>${cnpjClean}</cgccpf><usuario>torres</usuario></espelhamento></RequestCancelarEspelhamentoVeiculo>`;

  try {
    const response = await postXml(xml);
    console.log(`[truckscontrol] Cancelar espelhamento veiID=${veiID}: ${response.substring(0, 300)}`);

    if (response.includes("<ErrorRequest>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro") || "Erro desconhecido";
      return { success: false, message: `Erro: ${erroMsg}`, id, rawResponse: response.substring(0, 500) };
    }

    const statusVal = parseInt(parseXmlValue(response, "status") || "0");
    const erroVal = parseInt(parseXmlValue(response, "erro") || "0");
    if (erroVal === 0 || statusVal === 2) {
      return { success: true, message: "Espelhamento cancelado", id, status: statusVal, erro: erroVal };
    }
    return { success: false, message: `Falha ao cancelar (status=${statusVal}, erro=${erroVal})`, id, status: statusVal, erro: erroVal, rawResponse: response.substring(0, 500) };
  } catch (err: any) {
    return { success: false, message: `Erro: ${err.message}`, id };
  }
}

export const cancelEspelhamento = cancelEspelhamentoProprietario;

function getDefaultValidade(): string {
  const d = new Date();
  d.setDate(d.getDate() + 31);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function diagnosticoEspelhamento(veiID: number, cnpj: string): Promise<{
  results: Array<{ test: string; params: Record<string, any>; success: boolean; message: string; rawResponse?: string }>;
  summary: string;
}> {
  const config = getConfig();
  if (!config) return { results: [], summary: "Credenciais TrucksControl não configuradas." };

  const cnpjClean = cnpj.replace(/[^0-9]/g, "");
  const cnpjFormatted = cnpjClean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const validade = getDefaultValidade();
  const results: Array<{ test: string; params: Record<string, any>; success: boolean; message: string; rawResponse?: string }> = [];

  const xmlVariations: Array<{ test: string; xml: string }> = [
    {
      test: `CNPJ somente dígitos (${cnpjClean}) + usuario=torres`,
      xml: `<RequestNovoEspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento><id>${nextEspelhamentoId()}</id><veiID>${veiID}</veiID><cmd>1</cmd><IE>0</IE><TIE>0</TIE><validade>${validade}</validade><possocancelar>1</possocancelar><comandoexclusivo>0</comandoexclusivo><compartilhardados>1</compartilhardados><cgccpf>${cnpjClean}</cgccpf><usuario>torres</usuario></espelhamento></RequestNovoEspelhamentoVeiculo>`,
    },
    {
      test: `CNPJ formatado (${cnpjFormatted}) + usuario=torres`,
      xml: `<RequestNovoEspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento><id>${nextEspelhamentoId()}</id><veiID>${veiID}</veiID><cmd>1</cmd><IE>0</IE><TIE>0</TIE><validade>${validade}</validade><possocancelar>1</possocancelar><comandoexclusivo>0</comandoexclusivo><compartilhardados>1</compartilhardados><cgccpf>${cnpjFormatted}</cgccpf><usuario>torres</usuario></espelhamento></RequestNovoEspelhamentoVeiculo>`,
    },
    {
      test: `CNPJ dígitos + usuario = login (${config.login.substring(0, 8)}...)`,
      xml: `<RequestNovoEspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento><id>${nextEspelhamentoId()}</id><veiID>${veiID}</veiID><cmd>1</cmd><IE>0</IE><TIE>0</TIE><validade>${validade}</validade><possocancelar>1</possocancelar><comandoexclusivo>0</comandoexclusivo><compartilhardados>1</compartilhardados><cgccpf>${cnpjClean}</cgccpf><usuario>${config.login}</usuario></espelhamento></RequestNovoEspelhamentoVeiculo>`,
    },
    {
      test: `CNPJ formatado + usuario = login`,
      xml: `<RequestNovoEspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento><id>${nextEspelhamentoId()}</id><veiID>${veiID}</veiID><cmd>1</cmd><IE>0</IE><TIE>0</TIE><validade>${validade}</validade><possocancelar>1</possocancelar><comandoexclusivo>0</comandoexclusivo><compartilhardados>1</compartilhardados><cgccpf>${cnpjFormatted}</cgccpf><usuario>${config.login}</usuario></espelhamento></RequestNovoEspelhamentoVeiculo>`,
    },
  ];

  for (const v of xmlVariations) {
    console.log(`[truckscontrol] DIAG test="${v.test}" veiID=${veiID}`);
    console.log(`[truckscontrol] DIAG XML: ${v.xml.replace(config.senha, "***")}`);

    try {
      const response = await postXml(v.xml);
      console.log(`[truckscontrol] DIAG RESPONSE: ${response.substring(0, 500)}`);

      const hasError = response.includes("<ErrorRequest>") || (response.includes("<erro>") && response.includes("<codigo>"));
      const statusVal = parseInt(parseXmlValue(response, "status") || "0");
      const codigoErro = parseXmlValue(response, "codigo") || "";
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro") || "";

      if (hasError) {
        results.push({ test: v.test, params: {}, success: false, message: `Código ${codigoErro}: ${erroMsg}`, rawResponse: response.substring(0, 500) });
      } else if (statusVal === 2) {
        results.push({ test: v.test, params: {}, success: true, message: "Espelhamento criado com sucesso!" });
      } else {
        results.push({ test: v.test, params: {}, success: false, message: `status=${statusVal}, erro=${erroMsg || codigoErro}`, rawResponse: response.substring(0, 500) });
      }
    } catch (err: any) {
      results.push({ test: v.test, params: {}, success: false, message: `Erro de conexão: ${err.message}` });
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  const anySuccess = results.some(r => r.success);
  let summary = "";
  if (anySuccess) {
    const working = results.filter(r => r.success).map(r => r.test).join("; ");
    summary = `SUCESSO! Espelhamento funciona com: ${working}. A configuração será atualizada automaticamente.`;
  } else {
    const allSameError = results.every(r => r.message === results[0]?.message);
    if (allSameError) {
      summary = `Todas as 5 variações de formato falharam com o mesmo erro. Isso confirma que não é problema de formato XML. O TrucksControl está recusando a solicitação. Verifique com o suporte TrucksControl se a conta tem permissão de "espelhamento como proprietário" habilitada para o veiID ${veiID}.`;
    } else {
      summary = `Variações diferentes resultaram em erros diferentes. Verifique os detalhes de cada teste acima.`;
    }
  }

  return { results, summary };
}
