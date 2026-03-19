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
  if (spyCache.length > 0 && Date.now() - spyCacheTimestamp < VEHICLE_CACHE_TTL) {
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
  if (vehicleCache.length > 0 && Date.now() - vehicleCacheTimestamp < VEHICLE_CACHE_TTL) {
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

export async function fetchAllPositions(): Promise<TrucksControlPosition[]> {
  const config = getConfig();
  if (!config) {
    lastError = "TRUCKSCONTROL_CHAVE e TRUCKSCONTROL_SENHA não configurados";
    return [];
  }

  try {
    const [vehicles, spyDevices] = await Promise.all([
      fetchVehicles(config),
      fetchSpyDevices(config),
    ]);

    await Promise.all([
      fetchMessages(config),
      fetchSpyMessages(config),
    ]);

    const positions: TrucksControlPosition[] = [];

    for (const veh of vehicles) {
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
  if (positionCache && Date.now() - positionCache.timestamp < CACHE_TTL) {
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
  return positions.find((p) => p.identifier.trim().toUpperCase() === clean) || null;
}

export function getLastError(): string | null {
  return lastError;
}
