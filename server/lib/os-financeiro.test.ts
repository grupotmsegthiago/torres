// Testes do derivador de situação financeira por OS (Task #161).
// Rodar: npx tsx --test server/lib/os-financeiro.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { derivarSituacaoFinanceira } from "./os-financeiro";

const HOJE = "2026-07-28";
const d = (over: any) => derivarSituacaoFinanceira({ hoje: HOJE, ...over });

test("sem billing = NAO_FATURADA", () => {
  assert.equal(d({ billing: null, invoice: null }).status, "NAO_FATURADA");
});

test("billing aprovado sem fatura = NAO_FATURADA com detalhe", () => {
  const r = d({ billing: { status: "APROVADA" }, invoice: null });
  assert.equal(r.status, "NAO_FATURADA");
  assert.match(r.detalhe || "", /pronta/);
});

test("recusada = SEM_COBRANCA (§8.1), mesmo com billing", () => {
  const r = d({ billing: { status: "A_VERIFICAR" }, invoice: null, osStatus: "recusada" });
  assert.equal(r.status, "SEM_COBRANCA");
});

test("recusada COM fatura vinculada = DIVERGENCIA (cobrança indevida)", () => {
  const r = d({ billing: { status: "FATURADO", invoice_id: 9 }, invoice: { id: 9, status: "PENDING" }, osStatus: "recusada" });
  assert.equal(r.status, "DIVERGENCIA");
});

test("PAGO sem fatura = DIVERGENCIA (sem evidência)", () => {
  const r = d({ billing: { status: "PAGO", invoice_id: null }, invoice: null });
  assert.equal(r.status, "DIVERGENCIA");
  assert.match(r.causaDivergencia || "", /sem evidência/i);
});

test("invoice_id órfão (fatura sumiu) = DIVERGENCIA", () => {
  const r = d({ billing: { status: "FATURADO", invoice_id: 77 }, invoice: null });
  assert.equal(r.status, "DIVERGENCIA");
  assert.match(r.causaDivergencia || "", /#77/);
});

test("fatura PENDING dentro do prazo = AGUARDANDO_PAGAMENTO", () => {
  const r = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "PENDING", due_date: "2026-07-30" } });
  assert.equal(r.status, "AGUARDANDO_PAGAMENTO");
  assert.equal(r.vencimento, "2026-07-30");
});

test("fatura PENDING com due_date passado = VENCIDA com dias de atraso", () => {
  const r = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "PENDING", due_date: "2026-07-20" } });
  assert.equal(r.status, "VENCIDA");
  assert.equal(r.diasAtraso, 8);
});

test("fatura OVERDUE sem due_date = VENCIDA (mínimo 1 dia)", () => {
  const r = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "OVERDUE" } });
  assert.equal(r.status, "VENCIDA");
  assert.equal(r.diasAtraso, 1);
});

test("RECEIVED/CONFIRMED/RECEIVED_IN_CASH = PAGA", () => {
  for (const st of ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]) {
    const r = d({ billing: { status: "PAGO", invoice_id: 1 }, invoice: { id: 1, status: st, payment_date: "2026-07-25" } });
    assert.equal(r.status, "PAGA", st);
    assert.equal(r.dataPagamento, "2026-07-25");
  }
});

test("REFUNDED = ESTORNADA; com billing PAGO carrega causa de reversão pendente", () => {
  const r = d({ billing: { status: "PAGO", invoice_id: 1 }, invoice: { id: 1, status: "REFUNDED" } });
  assert.equal(r.status, "ESTORNADA");
  assert.match(r.causaDivergencia || "", /reversão pendente/i);
  const r2 = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "REFUNDED" } });
  assert.equal(r2.causaDivergencia, null);
});

test("CANCELLED com billing PAGO = DIVERGENCIA; sem PAGO = FATURA_CANCELADA", () => {
  const paga = d({ billing: { status: "PAGO", invoice_id: 1 }, invoice: { id: 1, status: "CANCELLED" } });
  assert.equal(paga.status, "DIVERGENCIA");
  const naoPaga = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "CANCELLED" } });
  assert.equal(naoPaga.status, "FATURA_CANCELADA");
});

test("billing PAGO com fatura em aberto = DIVERGENCIA", () => {
  const r = d({ billing: { status: "PAGO", invoice_id: 1 }, invoice: { id: 1, status: "PENDING", due_date: "2026-08-10" } });
  assert.equal(r.status, "DIVERGENCIA");
});

test("aliases do gateway: AWAITING_PAYMENT em aberto, CANCELED = cancelada", () => {
  const aberta = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "AWAITING_PAYMENT", due_date: "2026-08-15" } });
  assert.equal(aberta.status, "AGUARDANDO_PAGAMENTO");
  const canc = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "CANCELED" } });
  assert.equal(canc.status, "FATURA_CANCELADA");
});

test("Etapa 2: item quitado = PAGA; item parcial = PARCIALMENTE_PAGA", () => {
  const paga = d({
    billing: { status: "PAGO", invoice_id: 1 },
    invoice: { id: 1, status: "RECEIVED", value: 1000 },
    item: { valorItem: 400, valorAlocado: 400 },
    invoiceValorRecebido: 1000,
  });
  assert.equal(paga.status, "PAGA");
  const parcial = d({
    billing: { status: "FATURADO", invoice_id: 1 },
    invoice: { id: 1, status: "RECEIVED", value: 1000 },
    item: { valorItem: 400, valorAlocado: 200 },
    invoiceValorRecebido: 500,
  });
  assert.equal(parcial.status, "PARCIALMENTE_PAGA");
  assert.equal(parcial.valorAlocado, 200);
  assert.equal(parcial.saldoOs, 200);
  assert.equal(parcial.percentualFaturaRecebido, 50);
});

test("Etapa 2: tolerância de centavos quita a OS", () => {
  const r = d({
    billing: { status: "PAGO", invoice_id: 1 },
    invoice: { id: 1, status: "RECEIVED", value: 500 },
    item: { valorItem: 500, valorAlocado: 499.97 },
    invoiceValorRecebido: 499.97,
  });
  assert.equal(r.status, "PAGA");
});

test("Etapa 2: invoice PARTIAL (Inter) sem rateio = PARCIALMENTE_PAGA", () => {
  const r = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "PARTIAL", value: 800 } });
  assert.equal(r.status, "PARCIALMENTE_PAGA");
});

test("Etapa 2: baixa manual mostra 'não conciliada'", () => {
  const r = d({ billing: { status: "PAGO", invoice_id: 1 }, invoice: { id: 1, status: "RECEIVED_IN_CASH", value: 100 } });
  assert.equal(r.status, "PAGA");
  assert.match(r.detalhe || "", /não conciliada/);
});

test("status de gateway desconhecido = DIVERGENCIA explicada", () => {
  const r = d({ billing: { status: "FATURADO", invoice_id: 1 }, invoice: { id: 1, status: "CHARGEBACK_REQUESTED" } });
  assert.equal(r.status, "DIVERGENCIA");
  assert.match(r.causaDivergencia || "", /CHARGEBACK_REQUESTED/);
});

test("payload carrega dados da fatura, NF e agrupamento", () => {
  const r = d({
    billing: { status: "FATURADO", invoice_id: 5 },
    invoice: { id: 5, status: "PENDING", value: "1200.50", net_value: "1180.10", due_date: "2026-08-01", gateway: "asaas", invoice_url: "u", bank_slip_url: "b", nfse_number: "123", nfse_status: "AUTHORIZED", nfse_url: "n" },
    invoiceBillingCount: 3,
    valorOs: 400.17,
  });
  assert.equal(r.faturaId, 5);
  assert.equal(r.faturaValor, 1200.5);
  assert.equal(r.faturaLiquido, 1180.1);
  assert.equal(r.faturaQtdOs, 3);
  assert.equal(r.nfNumero, "123");
  assert.equal(r.valorOs, 400.17);
  assert.equal(r.gateway, "asaas");
});
