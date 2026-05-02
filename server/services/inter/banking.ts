/**
 * Service de Banking Banco Inter — API v2.
 * Saldo, extrato, pagamento de boletos e PIX out (transferências).
 *
 * Documentação oficial: https://developers.bancointer.com.br/reference/saldo-1
 */
import { getInterClient } from "./client";

const EXTRATO_SCOPES = "extrato.read";
const PAG_BOLETO_SCOPES = "pagamento-boleto.read pagamento-boleto.write";
const PIX_OUT_SCOPES = "pagamento-pix.write";

export interface SaldoResponse {
  disponivel: number;
  bloqueado?: number;
  bloqueadoCheque?: number;
  bloqueadoJudicialmente?: number;
  bloqueadoAdministrativamente?: number;
  limite?: number;
}

export interface TransacaoExtrato {
  dataEntrada: string;
  tipoTransacao: string;        // PIX, BOLETO_RECEBIDO, BOLETO_PAGO, etc
  tipoOperacao: "C" | "D";      // Crédito / Débito
  valor: number;
  titulo?: string;
  descricao?: string;
}

export interface ExtratoCompletoResponse {
  totalPaginas: number;
  totalElementos: number;
  ultimaPagina: boolean;
  primeiraPagina: boolean;
  tamanhoPagina: number;
  numeroDeElementos: number;
  transacoes: any[];
}

export async function consultarSaldo(): Promise<SaldoResponse> {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/banking/v2/saldo",
    scopes: EXTRATO_SCOPES,
    useContaCorrente: true,
  });
}

export async function consultarExtrato(dataInicio: string, dataFim: string): Promise<{ transacoes: TransacaoExtrato[] }> {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/banking/v2/extrato",
    scopes: EXTRATO_SCOPES,
    useContaCorrente: true,
    query: { dataInicio, dataFim },
  });
}

export async function consultarExtratoCompleto(
  dataInicio: string,
  dataFim: string,
  pagina = 0,
  tamanhoPagina = 50
): Promise<ExtratoCompletoResponse> {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/banking/v2/extrato/completo",
    scopes: EXTRATO_SCOPES,
    useContaCorrente: true,
    query: { dataInicio, dataFim, pagina, tamanhoPagina },
  });
}

// === PAGAMENTO DE BOLETOS ===

export interface PagarBoletoInput {
  codBarraLinhaDigitavel: string; // 47 dígitos
  valorPagar: number;
  dataPagamento: string;          // YYYY-MM-DD
  dataVencimento: string;         // YYYY-MM-DD
  cpfCnpjBeneficiario: string;
}

export async function pagarBoleto(input: PagarBoletoInput): Promise<{ codigoTransacao: string; dataPagamento: string }> {
  const client = getInterClient();
  return client.call({
    method: "POST",
    path: "/banking/v2/pagamento",
    scopes: PAG_BOLETO_SCOPES,
    useContaCorrente: true,
    body: input,
  });
}

export async function consultarPagamentoBoleto(codigoTransacao: string): Promise<any> {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: `/banking/v2/pagamento/${codigoTransacao}`,
    scopes: PAG_BOLETO_SCOPES,
    useContaCorrente: true,
  });
}

// === PIX OUT ===

export type PixDestinatario =
  | { tipo: "CHAVE"; chave: string }
  | {
      tipo: "DADOS_BANCARIOS";
      contaCorrente: string;
      agencia: string;
      tipoConta: "CONTA_CORRENTE" | "CONTA_POUPANCA" | "CONTA_PAGAMENTO" | "CONTA_SALARIO";
      cpfCnpj: string;
      nome: string;
      instituicaoFinanceira: { codigo: string; nome?: string };
    };

export interface PixOutInput {
  valor: number;          // Em reais
  dataPagamento?: string; // Default = hoje
  descricao?: string;
  destinatario: PixDestinatario;
}

/**
 * Faz PIX (transferência) via API v2 do Inter.
 * O payload exato muda entre versões da API; este monta o formato atual aceito.
 */
export async function realizarPix(input: PixOutInput): Promise<{ tipoRetorno: string; endToEndId?: string; idempotenteId?: string; codigoSolicitacao?: string }> {
  const client = getInterClient();
  const body: any = {
    valor: input.valor.toFixed(2),
    descricao: input.descricao || "",
    destinatario: input.destinatario,
  };
  if (input.dataPagamento) body.dataPagamento = input.dataPagamento;
  return client.call({
    method: "POST",
    path: "/banking/v2/pix",
    scopes: PIX_OUT_SCOPES,
    useContaCorrente: true,
    body,
  });
}
