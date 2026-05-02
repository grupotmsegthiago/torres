/**
 * Service de Cobrança Banco Inter — API v3.
 * Boletos híbridos (boleto + PIX QR Code no mesmo papel) e webhooks.
 *
 * Documentação oficial: https://developers.bancointer.com.br/reference/criarcobranca
 */
import { getInterClient } from "./client";

const SCOPES = "boleto-cobranca.read boleto-cobranca.write";

export interface CriarCobrancaInput {
  /** Identificador único nosso (ex: "INV-12345"). Aparece no boleto. */
  seuNumero: string;
  valorNominal: number;
  /** YYYY-MM-DD */
  dataVencimento: string;
  /** Dias após vencimento para baixa automática. Default 30. */
  numDiasAgenda?: number;
  pagador: {
    cpfCnpj: string;
    tipoPessoa: "FISICA" | "JURIDICA";
    nome: string;
    endereco: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade: string;
    uf: string;
    cep: string;
    email?: string;
    ddd?: string;
    telefone?: string;
  };
  mensagem?: { linha1?: string; linha2?: string; linha3?: string; linha4?: string; linha5?: string };
  desconto?: { codigo: "PERCENTUALDATAINFORMADA" | "VALORFIXODATAINFORMADA" | "NAOTEMDESCONTO"; taxa?: number; valor?: number; data?: string };
  multa?: { codigo: "NAOAPLICAR" | "VALORFIXO" | "PERCENTUAL"; taxa?: number; valor?: number };
  mora?: { codigo: "VALORDIA" | "TAXAMENSAL" | "ISENTO"; taxa?: number; valor?: number };
}

export interface CobrancaResponse {
  cobranca: any;
  boleto?: { nossoNumero: string; codigoBarras: string; linhaDigitavel: string };
  pix?: { txid: string; pixCopiaECola: string };
}

export async function criarCobranca(input: CriarCobrancaInput): Promise<{ codigoSolicitacao: string }> {
  const client = getInterClient();
  return client.call({
    method: "POST",
    path: "/cobranca/v3/cobrancas",
    scopes: SCOPES,
    useContaCorrente: true,
    body: input,
  });
}

export async function consultarCobranca(codigoSolicitacao: string): Promise<CobrancaResponse> {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: `/cobranca/v3/cobrancas/${codigoSolicitacao}`,
    scopes: SCOPES,
    useContaCorrente: true,
  });
}

export async function cancelarCobranca(codigoSolicitacao: string, motivoCancelamento: string): Promise<void> {
  const client = getInterClient();
  await client.call({
    method: "POST",
    path: `/cobranca/v3/cobrancas/${codigoSolicitacao}/cancelar`,
    scopes: SCOPES,
    useContaCorrente: true,
    body: { motivoCancelamento },
  });
}

export async function obterPdfBoleto(codigoSolicitacao: string): Promise<{ pdf: string }> {
  // Inter retorna { pdf: "<base64>" }
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: `/cobranca/v3/cobrancas/${codigoSolicitacao}/pdf`,
    scopes: SCOPES,
    useContaCorrente: true,
  });
}

export async function listarCobrancas(query: {
  dataInicial: string;  // YYYY-MM-DD
  dataFinal: string;
  filtrarDataPor?: "VENCIMENTO" | "EMISSAO" | "PAGAMENTO";
  situacao?: string;    // EXPIRADA, A_RECEBER, MARCADA_RECEBIDA, RECEBIDA, ATRASADA, CANCELADA
  pessoaPagadora?: string;
  cpfCnpjPessoaPagadora?: string;
  itensPorPagina?: number;
  paginaAtual?: number;
}): Promise<{ totalPaginas: number; totalElementos: number; cobrancas: any[] }> {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/cobranca/v3/cobrancas",
    scopes: SCOPES,
    useContaCorrente: true,
    query,
  });
}

// === WEBHOOKS ===

export async function cadastrarWebhook(webhookUrl: string): Promise<void> {
  const client = getInterClient();
  await client.call({
    method: "PUT",
    path: "/cobranca/v3/cobrancas/webhook",
    scopes: SCOPES,
    useContaCorrente: true,
    body: { webhookUrl },
  });
}

export async function consultarWebhook(): Promise<{ webhookUrl: string; criacao: string }> {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/cobranca/v3/cobrancas/webhook",
    scopes: SCOPES,
    useContaCorrente: true,
  });
}

export async function excluirWebhook(): Promise<void> {
  const client = getInterClient();
  await client.call({
    method: "DELETE",
    path: "/cobranca/v3/cobrancas/webhook",
    scopes: SCOPES,
    useContaCorrente: true,
  });
}
