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
