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

let lastSpyMid: number = 1;
let spyCache: SpyDevice[] = [];
let spyCacheTimestamp = 0;
let messagesBySpy: Map<number, SpyMessage> = new Map();

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

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function recordPosition(veiID: number, lat: number, lon: number, speed: number, ignition: boolean) {
  if (lat === 0 && lon === 0) return;
  const history = positionHistory.get(veiID) || [];
  history.push({ lat, lon, speed, ignition, timestamp: Date.now() });
  if (history.length > POSITION_HISTORY_MAX) history.splice(0, history.length - POSITION_HISTORY_MAX);
  positionHistory.set(veiID, history);
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

async function postXml(xmlBody: string): Promise<string> {
  const fullXml = `<?xml version="1.0" encoding="utf-8"?>${xmlBody}`;
  const resp = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: fullXml,
    signal: AbortSignal.timeout(15000),
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

  try {
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
  try {
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
    for (const msg of messages) {
      const existing = messagesBySpy.get(msg.spyID);
      if (!existing || msg.mId > existing.mId) {
        messagesBySpy.set(msg.spyID, msg);
      }
      if (msg.mId > lastSpyMid) {
        lastSpyMid = msg.mId;
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

  try {
    const xml = `<RequestVeiculo><login>${config.login}</login><senha>${config.senha}</senha></RequestVeiculo>`;
    const response = await postXml(xml);

    if (response.includes("<erro>")) {
      const erroMsg = parseXmlValue(response, "erro");
      if (erroMsg.includes("tempo minimo")) {
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

async function fetchMessages(config: TrucksControlConfig): Promise<TrucksControlMessage[]> {
  try {
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
    for (const msg of messages) {
      const existing = messagesByVehicle.get(msg.veiID);
      if (!existing || msg.mId > existing.mId) {
        messagesByVehicle.set(msg.veiID, msg);
      }
      if (msg.mId > lastMid) {
        lastMid = msg.mId;
      }
    }

    if (messages.length > 0) {
      console.log(`[truckscontrol] ${messages.length} mensagem(ns) novas, lastMid=${lastMid}`);
    }

    return messages;
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao buscar mensagens: ${err.message}`);
    return [];
  }
}

let initialized = false;

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
}

export async function fetchAllPositions(): Promise<TrucksControlPosition[]> {
  const config = getConfig();
  if (!config) {
    lastError = "TRUCKSCONTROL_CHAVE e TRUCKSCONTROL_SENHA não configurados";
    return [];
  }

  await initializeCache(config);

  try {
    const vehicles = await fetchVehicles(config);
    const spyDevices = await fetchSpyDevices(config);
    await fetchMessages(config);
    await fetchSpyMessages(config);

    const positions: TrucksControlPosition[] = [];

    const processedVeiIDs = new Set<number>();

    for (const veh of vehicles) {
      processedVeiIDs.add(veh.veiID);
      const msg = messagesByVehicle.get(veh.veiID);
      if (msg) {
        const address = [msg.rua, msg.rod, msg.mun, msg.uf].filter(Boolean).join(", ");
        positions.push({
          latitude: msg.lat,
          longitude: msg.lon,
          speed: msg.vel >= 0 ? msg.vel : 0,
          ignition: msg.evt4 === 1,
          lastPositionTime: msg.dt,
          gpsSignal: true,
          address,
          direction: 0,
          odometer: 0,
          plate: veh.placa,
          identifier: veh.ident || String(veh.veiID),
          voltage: 0,
          veiID: veh.veiID,
          municipality: msg.mun,
          state: msg.uf,
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
      const address = [msg.rua, msg.rod, msg.mun, msg.uf].filter(Boolean).join(", ");
      positions.push({
        latitude: msg.lat,
        longitude: msg.lon,
        speed: msg.vel >= 0 ? msg.vel : 0,
        ignition: msg.evt4 === 1,
        lastPositionTime: msg.dt,
        gpsSignal: true,
        address,
        direction: 0,
        odometer: 0,
        plate: "",
        identifier: String(veiID),
        voltage: 0,
        veiID,
        municipality: msg.mun,
        state: msg.uf,
        deviceType: "vehicle",
      });
      console.log(`[truckscontrol] Posição órfã adicionada: veiID=${veiID} lat=${msg.lat} lon=${msg.lon} (veículo não no cache)`);
    }

    for (const spy of spyDevices) {
      const msg = messagesBySpy.get(spy.spyID);
      const eqpName = spy.eqp === 14 ? "SpyTrack2" : "SpyTrack";
      if (msg) {
        const address = [msg.rua, msg.rod, msg.mun, msg.uf].filter(Boolean).join(", ");
        positions.push({
          latitude: msg.lat,
          longitude: msg.lon,
          speed: msg.vGPS >= 0 ? msg.vGPS : 0,
          ignition: false,
          lastPositionTime: msg.dtHora,
          gpsSignal: msg.gps === "A" || msg.gps === "",
          address,
          direction: 0,
          odometer: 0,
          plate: `SPY-${spy.serie}`,
          identifier: spy.desc || `${eqpName} #${spy.spyID}`,
          voltage: 0,
          veiID: spy.spyID,
          municipality: msg.mun,
          state: msg.uf,
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

export async function getCachedPositions(): Promise<TrucksControlPosition[]> {
  const hasData = positionCache && positionCache.data.some(p => p.latitude !== 0);
  const ttl = hasData ? CACHE_TTL : 30000;
  if (positionCache && Date.now() - positionCache.timestamp < ttl) {
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

export type CommandType = "bloquear" | "desbloquear" | "sirene";

export async function sendCommand(
  veiID: number,
  command: CommandType
): Promise<{ success: boolean; message: string; rawResponse?: string }> {
  const config = getConfig();
  if (!config) {
    return { success: false, message: "Credenciais TrucksControl não configuradas." };
  }

  const commandMap: Record<CommandType, { cmd: number; label: string }> = {
    bloquear: { cmd: 1, label: "Bloquear" },
    desbloquear: { cmd: 2, label: "Desbloquear" },
    sirene: { cmd: 3, label: "Sirene/Alerta" },
  };

  const cmdInfo = commandMap[command];
  if (!cmdInfo) {
    return { success: false, message: `Comando desconhecido: ${command}` };
  }

  try {
    const xml = `<RequestComando><login>${config.login}</login><senha>${config.senha}</senha><veiID>${veiID}</veiID><cmd>${cmdInfo.cmd}</cmd></RequestComando>`;
    const response = await postXml(xml);

    if (response.includes("<erro>") || response.includes("<Erro>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      console.log(`[truckscontrol] Erro ao enviar comando ${command} para veiID=${veiID}: ${erroMsg}`);
      return { success: false, message: `Erro: ${erroMsg}`, rawResponse: response.substring(0, 500) };
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
  const compartilharDados = options.compartilharDados ?? 0;

  const xml = `<RequestNovoEspelhamentoVeiculo login="${config.login}" senha="${config.senha}"><espelhamento><id>${id}</id><veiID>${veiID}</veiID><cmd>${cmd}</cmd><IE>${IE}</IE><TIE>${TIE}</TIE><validade>${validade}</validade><possocancelar>${possoCancelar}</possocancelar><comandoexclusivo>${comandoExclusivo}</comandoexclusivo><compartilhardados>${compartilharDados}</compartilhardados><cgccpf>${cnpjClean}</cgccpf><usuario>torres</usuario></espelhamento></RequestNovoEspelhamentoVeiculo>`;

  try {
    const response = await postXml(xml);
    console.log(`[truckscontrol] Espelhamento veiID=${veiID} -> CNPJ=${cnpjClean}: ${response.substring(0, 300)}`);

    if (response.includes("<ErrorRequest>") || response.includes("<erro>") || response.includes("<Erro>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      return { success: false, message: erroMsg || "Erro desconhecido", id, rawResponse: response.substring(0, 500) };
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
    const statusVal = parseInt(parseXmlValue(response, "status") || "0");
    const erroVal = parseInt(parseXmlValue(response, "erro") || "0");
    if (statusVal === 2) {
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
    const statusVal = parseInt(parseXmlValue(response, "status") || "0");
    const erroVal = parseInt(parseXmlValue(response, "erro") || "0");
    if (statusVal === 2) {
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
    const statusVal = parseInt(parseXmlValue(response, "status") || "0");
    const erroVal = parseInt(parseXmlValue(response, "erro") || "0");
    if (statusVal === 2) {
      return { success: true, message: "Espelhamento cancelado", id, status: statusVal, erro: erroVal };
    }
    return { success: false, message: `Falha ao cancelar (status=${statusVal}, erro=${erroVal})`, id, status: statusVal, erro: erroVal, rawResponse: response.substring(0, 500) };
  } catch (err: any) {
    return { success: false, message: `Erro: ${err.message}`, id };
  }
}

function getDefaultValidade(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
