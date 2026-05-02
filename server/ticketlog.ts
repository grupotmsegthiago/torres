import { supabaseAdmin } from "./supabase";

const PROD_BASE = "https://srv1.ticketlog.com.br/ticketlog-servicos/credenciamento";
const HML_BASE = "https://serviceshml.ticketlog.com.br/ticketlog-servicos/credenciamento";

function getBaseUrl(): string {
  return process.env.TICKETLOG_ENV === "homologacao" ? HML_BASE : PROD_BASE;
}

function getAuthHeader(): string {
  const user = process.env.TICKETLOG_USER;
  const pass = process.env.TICKETLOG_PASS;
  if (!user || !pass) throw new Error("Credenciais TicketLog não configuradas (TICKETLOG_USER / TICKETLOG_PASS)");
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

export function isTicketLogConfigured(): boolean {
  return !!(process.env.TICKETLOG_USER && process.env.TICKETLOG_PASS);
}

export interface BuscarAutorizacaoRequest {
  codigoEstabelecimento: number;
  valorCupom: number;
  dataHoraCupom: string;
  volumeAbastecido: number;
  numeroAutorizacao?: number;
}

export interface BuscarAutorizacaoResponse {
  codigoAutorizacao?: number;
  erros?: Array<{ codigo: string; propriedade: string; detalhe: string }>;
}

export async function buscarAutorizacao(params: BuscarAutorizacaoRequest): Promise<BuscarAutorizacaoResponse> {
  const url = `${getBaseUrl()}/recolhaAutonoma/buscarAutorizacao`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": getAuthHeader(),
    },
    body: JSON.stringify(params),
  });

  const body = await resp.json();
  if (resp.status === 200) {
    return { codigoAutorizacao: body.codigoAutorizacao };
  }
  return { erros: body.erros || [{ codigo: `HTTP_${resp.status}`, propriedade: "", detalhe: JSON.stringify(body) }] };
}

export interface DadosNfeRequest {
  codigoEstabelecimento: number;
  codigoAutorizacao: number;
  dataAutorizacao?: string;
}

export interface DadosNfeResponse {
  data?: any;
  erros?: Array<{ codigo: string; propriedade: string; detalhe: string }>;
}

export async function consultarDadosNfe(params: DadosNfeRequest): Promise<DadosNfeResponse> {
  const qs = new URLSearchParams();
  qs.set("codigoEstabelecimento", String(params.codigoEstabelecimento));
  qs.set("codigoAutorizacao", String(params.codigoAutorizacao));
  if (params.dataAutorizacao) qs.set("dataAutorizacao", params.dataAutorizacao);

  const url = `${getBaseUrl()}/recolhaAutonoma/dadosEmissaoNfeRecolhaAutonoma?${qs.toString()}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": getAuthHeader(),
    },
  });

  const body = await resp.json();
  if (resp.status === 200) {
    return { data: body };
  }
  return { erros: body.erros || [{ codigo: `HTTP_${resp.status}`, propriedade: "", detalhe: JSON.stringify(body) }] };
}

export interface UploadNfeRequest {
  codigoEstabelecimento: number;
  codigoAutorizacao: number;
  xml: string;
}

export async function uploadNotaFiscal(params: UploadNfeRequest): Promise<{ success: boolean; erros?: any[] }> {
  const url = `${getBaseUrl()}/recolhaAutonoma/uploadNotaFiscal`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": getAuthHeader(),
    },
    body: JSON.stringify({
      codigoEstabelecimento: params.codigoEstabelecimento,
      codigoAutorizacao: params.codigoAutorizacao,
      xml: params.xml,
    }),
  });

  if (resp.status === 200 || resp.status === 201) {
    return { success: true };
  }
  const body = await resp.json().catch(() => ({}));
  return { success: false, erros: body.erros || [{ codigo: `HTTP_${resp.status}`, propriedade: "", detalhe: JSON.stringify(body) }] };
}

export async function updateFuelingTicketLog(fuelingId: number, updates: Record<string, any>) {
  const { error } = await supabaseAdmin.from("vehicle_fueling").update(updates).eq("id", fuelingId);
  if (error) throw new Error(`Erro ao atualizar fueling #${fuelingId}: ${error.message}`);
}

function normalizeStation(name: string | null | undefined): string {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findCodigoEstabPorNomePosto(nomePosto: string | null | undefined): Promise<{ codigo: string; nome: string } | null> {
  const norm = normalizeStation(nomePosto);
  if (!norm) return null;
  const { data } = await supabaseAdmin
    .from("ticketlog_postos")
    .select("nome_posto, codigo_estabelecimento, ativo")
    .eq("ativo", true);
  if (!data || data.length === 0) return null;
  // tenta exact-normalized match, depois substring
  for (const p of data) {
    if (normalizeStation(p.nome_posto) === norm) {
      return { codigo: String(p.codigo_estabelecimento), nome: p.nome_posto };
    }
  }
  for (const p of data) {
    const pn = normalizeStation(p.nome_posto);
    if (pn && (norm.includes(pn) || pn.includes(norm))) {
      return { codigo: String(p.codigo_estabelecimento), nome: p.nome_posto };
    }
  }
  return null;
}

export type ValidacaoStatus =
  | "ok"
  | "divergencia_pequena"
  | "divergencia_grande"
  | "nao_encontrado"
  | "sem_codigo_posto"
  | "sem_credenciais"
  | "erro";

export interface ValidacaoResult {
  status: ValidacaoStatus;
  message: string;
  codigoAutorizacao?: number;
  diffValor?: number;
  diffLitros?: number;
  valorTl?: number;
  litrosTl?: number;
}

const TOL_VALOR_OK = 0.50;       // até R$ 0,50 = OK
const TOL_VALOR_PEQUENA = 5.00;  // até R$ 5,00 = divergência pequena (provável arredondamento)

/**
 * DE/PARA REALTIME: Valida 1 abastecimento contra TicketLog.
 * Marca status, valor TL, diff, validated_at no fueling.
 * Retorna resultado legível pra exibir ao agente / admin.
 */
export async function validateFueling(fuelingId: number): Promise<ValidacaoResult> {
  if (!isTicketLogConfigured()) {
    await updateFuelingTicketLog(fuelingId, {
      ticketlog_status: "sem_credenciais",
      ticketlog_message: "TicketLog não configurado",
      ticketlog_validated_at: new Date().toISOString(),
    }).catch(() => {});
    return { status: "sem_credenciais", message: "TicketLog não configurado (TICKETLOG_USER/TICKETLOG_PASS)" };
  }

  const { data: f } = await supabaseAdmin.from("vehicle_fueling").select("*").eq("id", fuelingId).maybeSingle();
  if (!f) return { status: "erro", message: "Abastecimento não encontrado" };

  // 1) Determinar codigoEstabelecimento
  let codigoEstab: string | null = f.ticketlog_codigo_estab ? String(f.ticketlog_codigo_estab) : null;
  let estabNome: string | null = f.ticketlog_estab_nome || null;
  if (!codigoEstab) {
    const lookup = await findCodigoEstabPorNomePosto(f.station);
    if (lookup) {
      codigoEstab = lookup.codigo;
      estabNome = lookup.nome;
    }
  }

  if (!codigoEstab) {
    await updateFuelingTicketLog(fuelingId, {
      ticketlog_status: "sem_codigo_posto",
      ticketlog_message: `Posto "${f.station || "?"}" não cadastrado em /admin/ticketlog-postos`,
      ticketlog_validated_at: new Date().toISOString(),
      ticketlog_attempts: Number(f.ticketlog_attempts || 0) + 1,
    });
    return { status: "sem_codigo_posto", message: `Posto "${f.station || "sem nome"}" sem código TicketLog cadastrado` };
  }

  // 2) Construir dataHora — pega createdAt se existir, senão date+12:00
  let dataHora: string;
  if (f.created_at) {
    dataHora = new Date(f.created_at).toISOString().replace(/\.\d+Z$/, "-03:00");
  } else {
    dataHora = `${f.date}T12:00:00-03:00`;
  }

  const valorCupom = Number(f.total_cost) || 0;
  const volume = Number(f.liters) || 0;

  if (valorCupom <= 0 || volume <= 0) {
    await updateFuelingTicketLog(fuelingId, {
      ticketlog_status: "erro",
      ticketlog_message: "Valor ou volume zerado — impossível validar",
      ticketlog_validated_at: new Date().toISOString(),
      ticketlog_attempts: Number(f.ticketlog_attempts || 0) + 1,
    });
    return { status: "erro", message: "Valor ou volume zerado" };
  }

  try {
    const result = await buscarAutorizacao({
      codigoEstabelecimento: Number(codigoEstab),
      valorCupom,
      dataHoraCupom: dataHora,
      volumeAbastecido: volume,
    });

    if (!result.codigoAutorizacao) {
      const erros = (result.erros || []).map(e => e.detalhe || e.codigo).join(" | ");
      await updateFuelingTicketLog(fuelingId, {
        ticketlog_status: "nao_encontrado",
        ticketlog_codigo_estab: codigoEstab,
        ticketlog_estab_nome: estabNome,
        ticketlog_message: erros ? `TicketLog: ${erros}` : "TicketLog não encontrou autorização para este abastecimento",
        ticketlog_validated_at: new Date().toISOString(),
        ticketlog_attempts: Number(f.ticketlog_attempts || 0) + 1,
      });
      return {
        status: "nao_encontrado",
        message: "TicketLog não encontrou cobrança correspondente. O agente pode ter passado outro cartão ou a TL ainda não processou (tente novamente em alguns minutos).",
      };
    }

    // 3) Achou autorização. TicketLog confirma que existe cobrança nos parâmetros enviados.
    // Como buscarAutorizacao só retorna o código se valor/volume bater, divergência aqui é improvável.
    // Mas ainda registramos o valor para histórico.
    await updateFuelingTicketLog(fuelingId, {
      ticketlog_autorizacao: String(result.codigoAutorizacao),
      ticketlog_codigo_estab: codigoEstab,
      ticketlog_estab_nome: estabNome,
      ticketlog_status: "ok",
      ticketlog_valor_tl: valorCupom.toFixed(2),
      ticketlog_litros_tl: volume.toFixed(2),
      ticketlog_diff_valor: "0.00",
      ticketlog_message: `OK, lançado corretamente (autorização ${result.codigoAutorizacao})`,
      ticketlog_validated_at: new Date().toISOString(),
      ticketlog_attempts: Number(f.ticketlog_attempts || 0) + 1,
    });
    console.log(`[TicketLog-validate] Fueling #${fuelingId} OK — autorização ${result.codigoAutorizacao}`);
    return {
      status: "ok",
      message: `OK, lançado corretamente. TicketLog confirmou cobrança (autorização ${result.codigoAutorizacao}).`,
      codigoAutorizacao: result.codigoAutorizacao,
      valorTl: valorCupom,
      litrosTl: volume,
      diffValor: 0,
      diffLitros: 0,
    };
  } catch (err: any) {
    await updateFuelingTicketLog(fuelingId, {
      ticketlog_status: "erro",
      ticketlog_message: `Erro: ${err.message}`,
      ticketlog_validated_at: new Date().toISOString(),
      ticketlog_attempts: Number(f.ticketlog_attempts || 0) + 1,
    }).catch(() => {});
    console.error(`[TicketLog-validate] Fueling #${fuelingId} erro:`, err.message);
    return { status: "erro", message: err.message };
  }
}

/**
 * Cron retry: tenta novamente fuelings com status pendente/erro/nao_encontrado dos últimos N dias.
 */
export async function retryPendingValidations(diasParaTras = 5, maxAttempts = 8): Promise<{ tried: number; ok: number; divergent: number; failed: number }> {
  if (!isTicketLogConfigured()) return { tried: 0, ok: 0, divergent: 0, failed: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - diasParaTras);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data } = await supabaseAdmin
    .from("vehicle_fueling")
    .select("id,ticketlog_status,ticketlog_attempts")
    .gte("date", cutoffIso)
    .or("ticketlog_status.is.null,ticketlog_status.eq.nao_encontrado,ticketlog_status.eq.erro,ticketlog_status.eq.sem_codigo_posto")
    .order("id", { ascending: false })
    .limit(50);

  if (!data || data.length === 0) return { tried: 0, ok: 0, divergent: 0, failed: 0 };

  let ok = 0, divergent = 0, failed = 0, tried = 0;
  for (const f of data) {
    if (Number(f.ticketlog_attempts || 0) >= maxAttempts) continue;
    tried++;
    const r = await validateFueling(Number(f.id));
    if (r.status === "ok") ok++;
    else if (r.status === "divergencia_grande" || r.status === "divergencia_pequena") divergent++;
    else failed++;
    // pequena pausa pra não saturar API TL
    await new Promise(res => setTimeout(res, 250));
  }
  console.log(`[TicketLog-retry] Tentou ${tried} fuelings — ${ok} OK, ${divergent} divergentes, ${failed} falhou`);
  return { tried, ok, divergent, failed };
}
