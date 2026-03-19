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
    const vehicles = await fetchVehicles(config);
    await fetchMessages(config);

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

export async function fetchPositionByPlate(plate: string): Promise<TrucksControlPosition | null> {
  const positions = await fetchAllPositions();
  const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return positions.find(p => p.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === cleanPlate) || null;
}

export async function testConnection(): Promise<{ success: boolean; message: string; vehicleCount?: number; rawResponse?: string }> {
  const config = getConfig();
  if (!config) {
    return { success: false, message: "TRUCKSCONTROL_CHAVE e TRUCKSCONTROL_SENHA não estão configurados nas variáveis de ambiente." };
  }

  try {
    const xml = `<RequestVeiculo><login>${config.login}</login><senha>${config.senha}</senha></RequestVeiculo>`;
    const response = await postXml(xml);

    if (response.includes("<erro>")) {
      const erroMsg = parseXmlValue(response, "erro");
      if (erroMsg.includes("tempo minimo")) {
        return {
          success: true,
          message: `Conexão OK — Credenciais autorizadas. ${vehicleCache.length} veículo(s) em cache. (Aguardando intervalo mínimo para nova requisição)`,
          vehicleCount: vehicleCache.length,
        };
      }
      return { success: false, message: `Erro: ${erroMsg}`, rawResponse: response };
    }

    const vehicles = parseVehicles(response);
    if (vehicles.length > 0) {
      vehicleCache = vehicles;
      vehicleCacheTimestamp = Date.now();
    }

    return {
      success: true,
      message: `Conexão OK — ${vehicles.length} veículo(s) encontrado(s): ${vehicles.map(v => v.placa).join(", ")}`,
      vehicleCount: vehicles.length,
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
const CACHE_TTL = 30000;

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
