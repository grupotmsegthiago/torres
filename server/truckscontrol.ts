interface TrucksControlPosition {
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
}

interface TrucksControlConfig {
  login: string;
  senha: string;
}

let lastError: string | null = null;
const BASE_URL = "https://webservice.newrastreamentoonline.com.br/";

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

function parseCdataValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}><!\\[CDATA\\[([^\\]]*?)\\]\\]></${tag}>`, "i");
  const match = xml.match(regex);
  if (match) return match[1].trim();
  return parseXmlValue(xml, tag);
}

async function postXml(xmlBody: string): Promise<string> {
  const resp = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="utf-8"?>${xmlBody}`,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }

  return resp.text();
}

function parsePositionBlock(block: string): TrucksControlPosition | null {
  try {
    const lat = parseFloat(parseXmlValue(block, "Latitude") || parseXmlValue(block, "latitude") || parseXmlValue(block, "lat") || "0");
    const lng = parseFloat(parseXmlValue(block, "Longitude") || parseXmlValue(block, "longitude") || parseXmlValue(block, "lng") || parseXmlValue(block, "lon") || "0");
    if (lat === 0 && lng === 0) return null;

    const speed = parseFloat(parseXmlValue(block, "Velocidade") || parseXmlValue(block, "velocidade") || parseXmlValue(block, "Speed") || "0");
    const ignStr = (parseXmlValue(block, "Ignicao") || parseXmlValue(block, "ignicao") || parseXmlValue(block, "Ignition") || "").toLowerCase();
    const ignition = ignStr === "true" || ignStr === "1" || ignStr === "ligada" || ignStr === "sim" || ignStr === "on";
    const dateStr = parseXmlValue(block, "DataHora") || parseXmlValue(block, "datahora") || parseXmlValue(block, "Data") || parseXmlValue(block, "DateTime") || "";
    const gpsStr = (parseXmlValue(block, "GPS") || parseXmlValue(block, "gps") || parseXmlValue(block, "GpsValido") || "").toLowerCase();
    const gpsSignal = gpsStr !== "false" && gpsStr !== "0" && gpsStr !== "invalido" && gpsStr !== "nao";
    const address = parseCdataValue(block, "Endereco") || parseCdataValue(block, "endereco") || parseXmlValue(block, "Endereco") || parseXmlValue(block, "Address") || "";
    const direction = parseFloat(parseXmlValue(block, "Direcao") || parseXmlValue(block, "direcao") || parseXmlValue(block, "Direction") || "0");
    const odometer = parseFloat(parseXmlValue(block, "Odometro") || parseXmlValue(block, "odometro") || parseXmlValue(block, "Hodometro") || "0");
    const plate = parseXmlValue(block, "Placa") || parseXmlValue(block, "placa") || parseXmlValue(block, "Plate") || "";
    const identifier = parseCdataValue(block, "Identificador") || parseCdataValue(block, "identificador") || parseXmlValue(block, "Identificador") || parseXmlValue(block, "Id") || "";
    const voltage = parseFloat(parseXmlValue(block, "Voltagem") || parseXmlValue(block, "voltagem") || parseXmlValue(block, "TensaoBateria") || "0");

    return { latitude: lat, longitude: lng, speed, ignition, lastPositionTime: dateStr, gpsSignal, address, direction, odometer, plate, identifier, voltage };
  } catch {
    return null;
  }
}

function parseAllPositions(xml: string): TrucksControlPosition[] {
  const positions: TrucksControlPosition[] = [];
  let match;

  const vehicleRegex = /<Veiculo>([\s\S]*?)<\/Veiculo>/gi;
  while ((match = vehicleRegex.exec(xml)) !== null) {
    const pos = parsePositionBlock(match[1]);
    if (pos) positions.push(pos);
  }

  if (positions.length === 0) {
    const posRegex = /<Posicao>([\s\S]*?)<\/Posicao>/gi;
    while ((match = posRegex.exec(xml)) !== null) {
      const pos = parsePositionBlock(match[1]);
      if (pos) positions.push(pos);
    }
  }

  if (positions.length === 0) {
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    while ((match = itemRegex.exec(xml)) !== null) {
      const pos = parsePositionBlock(match[1]);
      if (pos) positions.push(pos);
    }
  }

  if (positions.length === 0) {
    const pos = parsePositionBlock(xml);
    if (pos) positions.push(pos);
  }

  return positions;
}

async function doLogin(): Promise<{ success: boolean; rawResponse: string }> {
  const config = getConfig();
  if (!config) return { success: false, rawResponse: "Credenciais não configuradas" };

  try {
    const xml = `<Login><login>${config.login}</login><senha>${config.senha}</senha></Login>`;
    const response = await postXml(xml);
    const loginResult = parseXmlValue(response, "login").toLowerCase();
    return { success: loginResult === "true", rawResponse: response };
  } catch (err: any) {
    return { success: false, rawResponse: err.message };
  }
}

export async function fetchAllPositions(): Promise<TrucksControlPosition[]> {
  const config = getConfig();
  if (!config) {
    console.log("[truckscontrol] Login/Senha não configurados");
    return [];
  }

  try {
    const loginCheck = await doLogin();
    if (!loginCheck.success) {
      const erroMatch = loginCheck.rawResponse.match(/<erro>([^<]*)<\/erro>/i);
      const loginVal = parseXmlValue(loginCheck.rawResponse, "login");
      if (loginVal.toLowerCase() === "false") {
        lastError = "Login inválido — credenciais de integração não autorizadas. Solicite credenciais de integração ao suporte TrucksControl.";
      } else if (erroMatch) {
        lastError = erroMatch[1];
      } else {
        lastError = "Falha no login ao webservice";
      }
      console.log(`[truckscontrol] ${lastError}`);
      return [];
    }

    const xmlBody = `<Posicoes><login>${config.login}</login><senha>${config.senha}</senha></Posicoes>`;
    const response = await postXml(xmlBody);

    if (response.includes("<erro>")) {
      const erroMatch = response.match(/<erro>([^<]*)<\/erro>/i);
      if (erroMatch && erroMatch[1].includes("Tag xml invalida")) {
        console.log("[truckscontrol] Login OK mas tag Posicoes não reconhecida. Usando login apenas como teste de autenticação.");
        lastError = null;
        return [];
      }
      lastError = erroMatch ? erroMatch[1] : "Erro desconhecido";
      console.log(`[truckscontrol] Erro: ${lastError}`);
      return [];
    }

    lastError = null;
    return parseAllPositions(response);
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao buscar posições: ${err.message}`);
    lastError = err.message;
    return [];
  }
}

export async function fetchPositionByPlate(plate: string): Promise<TrucksControlPosition | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const xml = `<Posicao><login>${config.login}</login><senha>${config.senha}</senha><placa>${plate.replace(/[^A-Za-z0-9]/g, "")}</placa></Posicao>`;
    const response = await postXml(xml);
    if (response.includes("<erro>")) return null;
    const positions = parseAllPositions(response);
    return positions[0] || null;
  } catch {
    return null;
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string; vehicleCount?: number; rawLoginResponse?: string }> {
  const config = getConfig();
  if (!config) {
    return { success: false, message: "TRUCKSCONTROL_CHAVE e TRUCKSCONTROL_SENHA não estão configurados nas variáveis de ambiente." };
  }

  try {
    const loginResult = await doLogin();

    if (!loginResult.success) {
      const loginVal = parseXmlValue(loginResult.rawResponse, "login");
      const storkVal = parseXmlValue(loginResult.rawResponse, "stork");
      const clienteVal = parseXmlValue(loginResult.rawResponse, "cliente");

      if (loginVal.toLowerCase() === "false") {
        return {
          success: false,
          message: `Login falhou (login=${loginVal}, stork=${storkVal}, cliente=${clienteVal || "vazio"}). As credenciais podem ser do portal web, não da API de integração. Solicite credenciais específicas de integração ao suporte TrucksControl: WhatsApp (43) 99914-0020.`,
          rawLoginResponse: loginResult.rawResponse,
        };
      }

      return {
        success: false,
        message: `Erro de login: ${loginResult.rawResponse}`,
        rawLoginResponse: loginResult.rawResponse,
      };
    }

    const positions = await fetchAllPositions();
    if (lastError) {
      return { success: false, message: `Login OK mas erro ao buscar posições: ${lastError}` };
    }

    return {
      success: true,
      message: positions.length > 0
        ? `Conexão OK — Login autorizado, ${positions.length} veículo(s) encontrado(s).`
        : "Conexão OK — Login autorizado. Nenhuma posição retornada ainda.",
      vehicleCount: positions.length,
    };
  } catch (err: any) {
    return { success: false, message: `Erro de conexão: ${err.message}` };
  }
}

let positionCache: { data: TrucksControlPosition[]; timestamp: number } | null = null;
const CACHE_TTL = 30000;

export async function getCachedPositions(): Promise<TrucksControlPosition[]> {
  if (positionCache && Date.now() - positionCache.timestamp < CACHE_TTL) {
    return positionCache.data;
  }

  const data = await fetchAllPositions();
  if (data.length > 0 || !lastError) {
    positionCache = { data, timestamp: Date.now() };
  }
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
