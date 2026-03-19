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
  chave: string;
  senha: string;
}

let lastError: string | null = null;

function getConfig(): TrucksControlConfig | null {
  const chave = process.env.TRUCKSCONTROL_CHAVE;
  const senha = process.env.TRUCKSCONTROL_SENHA;
  if (!chave || !senha) return null;
  return { chave, senha };
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

function parsePositionBlock(block: string): TrucksControlPosition | null {
  try {
    const lat = parseFloat(parseXmlValue(block, "Latitude") || parseXmlValue(block, "latitude") || "0");
    const lng = parseFloat(parseXmlValue(block, "Longitude") || parseXmlValue(block, "longitude") || "0");
    if (lat === 0 && lng === 0) return null;

    const speed = parseFloat(parseXmlValue(block, "Velocidade") || parseXmlValue(block, "velocidade") || "0");
    const ignStr = (parseXmlValue(block, "Ignicao") || parseXmlValue(block, "ignicao") || "").toLowerCase();
    const ignition = ignStr === "true" || ignStr === "1" || ignStr === "ligada" || ignStr === "sim";
    const dateStr = parseXmlValue(block, "DataHora") || parseXmlValue(block, "datahora") || parseXmlValue(block, "Data") || "";
    const gpsStr = (parseXmlValue(block, "GPS") || parseXmlValue(block, "gps") || parseXmlValue(block, "GpsValido") || "").toLowerCase();
    const gpsSignal = gpsStr === "true" || gpsStr === "1" || gpsStr === "valido" || gpsStr === "sim" || gpsStr === "";
    const address = parseCdataValue(block, "Endereco") || parseCdataValue(block, "endereco") || parseXmlValue(block, "Endereco") || "";
    const direction = parseFloat(parseXmlValue(block, "Direcao") || parseXmlValue(block, "direcao") || "0");
    const odometer = parseFloat(parseXmlValue(block, "Odometro") || parseXmlValue(block, "odometro") || parseXmlValue(block, "Hodometro") || "0");
    const plate = parseXmlValue(block, "Placa") || parseXmlValue(block, "placa") || "";
    const identifier = parseCdataValue(block, "Identificador") || parseCdataValue(block, "identificador") || parseXmlValue(block, "Identificador") || "";
    const voltage = parseFloat(parseXmlValue(block, "Voltagem") || parseXmlValue(block, "voltagem") || parseXmlValue(block, "TensaoBateria") || "0");

    return {
      latitude: lat,
      longitude: lng,
      speed,
      ignition,
      lastPositionTime: dateStr,
      gpsSignal,
      address,
      direction,
      odometer,
      plate,
      identifier,
      voltage,
    };
  } catch {
    return null;
  }
}

export async function fetchAllPositions(): Promise<TrucksControlPosition[]> {
  const config = getConfig();
  if (!config) {
    console.log("[truckscontrol] Chave/Senha não configurados");
    return [];
  }

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetPosicaoTodosVeiculos xmlns="http://webservice.newrastreamentoonline.com.br/">
      <chave>${config.chave}</chave>
      <senha>${config.senha}</senha>
    </GetPosicaoTodosVeiculos>
  </soap:Body>
</soap:Envelope>`;

  try {
    const resp = await fetch("https://webservice.newrastreamentoonline.com.br/service.asmx", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://webservice.newrastreamentoonline.com.br/GetPosicaoTodosVeiculos",
      },
      body: soapBody,
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.log(`[truckscontrol] HTTP ${resp.status}: ${resp.statusText}`);
      lastError = `HTTP ${resp.status}: ${resp.statusText}`;
      return [];
    }

    const xml = await resp.text();

    const faultMatch = xml.match(/<faultstring>([^<]*)<\/faultstring>/i);
    if (faultMatch) {
      console.log(`[truckscontrol] SOAP Fault: ${faultMatch[1]}`);
      lastError = `SOAP Fault: ${faultMatch[1]}`;
      return [];
    }

    lastError = null;
    return parseAllPositions(xml);
  } catch (err: any) {
    console.log(`[truckscontrol] Erro ao buscar posições: ${err.message}`);
    lastError = err.message;
    return [];
  }
}

export async function fetchPositionByPlate(plate: string): Promise<TrucksControlPosition | null> {
  const config = getConfig();
  if (!config) return null;

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetPosicaoPorPlaca xmlns="http://webservice.newrastreamentoonline.com.br/">
      <chave>${config.chave}</chave>
      <senha>${config.senha}</senha>
      <placa>${plate.replace(/[^A-Za-z0-9]/g, "")}</placa>
    </GetPosicaoPorPlaca>
  </soap:Body>
</soap:Envelope>`;

  try {
    const resp = await fetch("https://webservice.newrastreamentoonline.com.br/service.asmx", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://webservice.newrastreamentoonline.com.br/GetPosicaoPorPlaca",
      },
      body: soapBody,
    });

    if (!resp.ok) return null;
    const xml = await resp.text();
    const positions = parseAllPositions(xml);
    return positions[0] || null;
  } catch {
    return null;
  }
}

function parseAllPositions(xml: string): TrucksControlPosition[] {
  const positions: TrucksControlPosition[] = [];

  const vehicleRegex = /<Veiculo>([\s\S]*?)<\/Veiculo>/gi;
  let match;
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
    const resultRegex = /<GetPosicao[^>]*Result>([\s\S]*?)<\/GetPosicao[^>]*Result>/i;
    const resultMatch = xml.match(resultRegex);
    if (resultMatch) {
      const pos = parsePositionBlock(resultMatch[1]);
      if (pos) positions.push(pos);
    }
  }

  return positions;
}

export async function testConnection(): Promise<{ success: boolean; message: string; vehicleCount?: number }> {
  const config = getConfig();
  if (!config) {
    return { success: false, message: "Chave e Senha do TrucksControl não estão configurados nas variáveis de ambiente" };
  }

  try {
    const positions = await fetchAllPositions();
    if (lastError) {
      return { success: false, message: `Erro: ${lastError}` };
    }
    if (positions.length > 0) {
      return {
        success: true,
        message: `Conexão OK — ${positions.length} veículo(s) encontrado(s)`,
        vehicleCount: positions.length,
      };
    }
    return {
      success: true,
      message: "Conexão estabelecida — nenhum veículo retornado. Verifique se há veículos cadastrados no TrucksControl.",
      vehicleCount: 0,
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
