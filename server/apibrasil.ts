import { storage } from "./storage";

const API_BASE = "https://gateway.apibrasil.io/api/v2";

function getDeviceTokens(): Record<string, string | undefined> {
  return {
    "/vehicles/multas": process.env.APIBRASIL_DEVICE_MULTAS,
    "/vehicles/cnh": process.env.APIBRASIL_DEVICE_CNH,
    "/vehicles/dados": process.env.APIBRASIL_DEVICE_PLACA_DADOS,
    "/judiciais/processos": process.env.APIBRASIL_DEVICE_PROCESSOS,
    "/credito/spc": process.env.APIBRASIL_DEVICE_SPC,
    "/credito/quod": process.env.APIBRASIL_DEVICE_QUOD,
    "/credito/protesto": process.env.APIBRASIL_DEVICE_PROTESTO,
    "/dados/situacao-eleitoral": process.env.APIBRASIL_DEVICE_ELEITORAL,
    "/nfe/emitir": process.env.APIBRASIL_DEVICE_NOTAS,
  };
}

function getToken(): string | null {
  return process.env.APIBRASIL_TOKEN || null;
}

async function apiRequest(
  endpoint: string,
  method: string,
  body: any,
  userId?: number,
  source: string = "manual"
): Promise<{ success: boolean; data: any; status: number }> {
  const token = getToken();

  if (!token) {
    await storage.createApiLog({
      endpoint,
      method,
      requestData: JSON.stringify(body),
      responseStatus: 503,
      responseData: JSON.stringify({ error: "Token APIBRASIL_TOKEN não configurado" }),
      userId: userId ?? null,
      source,
    });
    return { success: false, data: { error: "Token APIBRASIL_TOKEN não configurado" }, status: 503 };
  }

  const deviceToken = getDeviceTokens()[endpoint];

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };
    if (deviceToken) {
      headers["DeviceToken"] = deviceToken;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: method !== "GET" ? JSON.stringify(body) : undefined,
    });

    const responseData = await response.json().catch(() => ({ error: "Resposta inválida" }));
    const status = response.status;

    const logData = typeof responseData === "object"
      ? JSON.stringify(responseData).substring(0, 5000)
      : String(responseData).substring(0, 5000);

    await storage.createApiLog({
      endpoint,
      method,
      requestData: JSON.stringify(body),
      responseStatus: status,
      responseData: logData,
      userId: userId ?? null,
      source,
    });

    if (!response.ok) {
      const errMsg = responseData?.message || responseData?.error || `HTTP ${status}`;
      return { success: false, data: { error: errMsg, details: responseData }, status };
    }

    return { success: true, data: responseData?.response || responseData, status };
  } catch (err: any) {
    await storage.createApiLog({
      endpoint,
      method,
      requestData: JSON.stringify(body),
      responseStatus: 0,
      responseData: JSON.stringify({ error: err.message }),
      userId: userId ?? null,
      source,
    });
    return { success: false, data: { error: `Erro de conexão: ${err.message}` }, status: 0 };
  }
}

export async function consultaMultasPRF(placa: string, userId?: number, source = "manual") {
  return apiRequest("/vehicles/multas", "POST", { placa }, userId, source);
}

export async function consultaCNH(cpf: string, userId?: number, source = "manual") {
  return apiRequest("/vehicles/cnh", "POST", { cpf: cpf.replace(/\D/g, "") }, userId, source);
}

export async function consultaProcessos(cpf: string, userId?: number, source = "manual") {
  return apiRequest("/judiciais/processos", "POST", { cpf: cpf.replace(/\D/g, "") }, userId, source);
}

export async function consultaSPC(document: string, userId?: number, source = "manual") {
  const clean = document.replace(/\D/g, "");
  return apiRequest("/credito/spc", "POST", { documento: clean }, userId, source);
}

export async function consultaQuodScore(document: string, userId?: number, source = "manual") {
  const clean = document.replace(/\D/g, "");
  return apiRequest("/credito/quod", "POST", { documento: clean }, userId, source);
}

export async function consultaProtestoNacional(document: string, userId?: number, source = "manual") {
  const clean = document.replace(/\D/g, "");
  return apiRequest("/credito/protesto", "POST", { documento: clean }, userId, source);
}

export async function consultaSituacaoEleitoral(cpf: string, userId?: number, source = "manual") {
  return apiRequest("/dados/situacao-eleitoral", "POST", { cpf: cpf.replace(/\D/g, "") }, userId, source);
}

export async function emitirNotaFiscal(dados: any, userId?: number, source = "manual") {
  return apiRequest("/nfe/emitir", "POST", dados, userId, source);
}

export async function consultaDadosVeiculo(placa: string, userId?: number, source = "manual") {
  return apiRequest("/vehicles/dados", "POST", { placa }, userId, source);
}

export async function autoConsultaFuncionario(cpf: string, userId?: number) {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return;
  const source = "cadastro_funcionario";
  await Promise.allSettled([
    consultaCNH(clean, userId, source),
    consultaProcessos(clean, userId, source),
    consultaSPC(clean, userId, source),
    consultaQuodScore(clean, userId, source),
    consultaProtestoNacional(clean, userId, source),
    consultaSituacaoEleitoral(clean, userId, source),
  ]);
}

export async function autoConsultaCliente(document: string, userId?: number) {
  const clean = document.replace(/\D/g, "");
  if (clean.length !== 11 && clean.length !== 14) return;
  const source = "cadastro_cliente";
  const tasks: Promise<any>[] = [
    consultaSPC(clean, userId, source),
    consultaQuodScore(clean, userId, source),
    consultaProtestoNacional(clean, userId, source),
  ];
  if (clean.length === 11) {
    tasks.push(consultaProcessos(clean, userId, source));
    tasks.push(consultaSituacaoEleitoral(clean, userId, source));
  }
  await Promise.allSettled(tasks);
}

export async function autoConsultaVeiculo(placa: string, userId?: number) {
  const clean = placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (clean.length < 7) return;
  const source = "cadastro_veiculo";
  await Promise.allSettled([
    consultaDadosVeiculo(clean, userId, source),
    consultaMultasPRF(clean, userId, source),
  ]);
}

export async function analiseCredito(document: string, userId?: number) {
  const [spc, quod, protesto] = await Promise.all([
    consultaSPC(document, userId, "analise_credito"),
    consultaQuodScore(document, userId, "analise_credito"),
    consultaProtestoNacional(document, userId, "analise_credito"),
  ]);

  return {
    spc: spc,
    quod: quod,
    protesto: protesto,
    hasRestrictions: !spc.success || !quod.success || !protesto.success,
    summary: {
      spcStatus: spc.success ? "consultado" : "erro",
      quodStatus: quod.success ? "consultado" : "erro",
      protestoStatus: protesto.success ? "consultado" : "erro",
    },
  };
}
