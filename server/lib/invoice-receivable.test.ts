import { test } from "node:test";
import assert from "node:assert/strict";
import { decideInvoiceReceivable } from "./invoice-receivable";

const base = {
  id: 44,
  client_name: "ACME",
  value: 1000,
  due_date: "2026-10-15",
  status: "PENDING",
  provider_cnpj: "36982392000189",
  nfse_status: null,
  nfse_number: "325",
};

test("fatura emitida vira recebimento pendente no valor líquido", () => {
  const d = decideInvoiceReceivable(base, { emite_nf: true, retem_inss: true, inss_aliquota: 11 });
  assert.equal(d.action, "upsert");
  if (d.action !== "upsert") return;
  assert.equal(d.status, "PENDING");
  assert.equal(d.amount, 890);
  assert.equal(d.due_date, "2026-10-15");
  assert.match(d.description, /Fatura #44 NF 325/);
  assert.equal(d.entity_name, "ACME");
});

test("sem retenção o líquido é o bruto", () => {
  const d = decideInvoiceReceivable(
    { ...base, nfse_number: null },
    { emite_nf: false, retem_inss: false },
  );
  assert.equal(d.action, "upsert");
  if (d.action !== "upsert") return;
  assert.equal(d.amount, 1000);
  assert.doesNotMatch(d.description, /NF /);
});

test("fatura paga entra como recebida", () => {
  const d = decideInvoiceReceivable({ ...base, status: "RECEIVED" }, { emite_nf: false });
  assert.equal(d.action, "upsert");
  if (d.action !== "upsert") return;
  assert.equal(d.status, "PAID");
});

test("ainda não emitida, cancelada ou de outro CNPJ não entra", () => {
  assert.equal(decideInvoiceReceivable({ ...base, status: "AGUARDANDO_FATURAMENTO" }).action, "remove");
  assert.equal(decideInvoiceReceivable({ ...base, status: "CANCELLED" }).action, "remove");
  assert.equal(decideInvoiceReceivable({ ...base, status: "CANCELED" }).action, "remove");
  assert.equal(decideInvoiceReceivable({ ...base, provider_cnpj: "11111111000111" }).action, "remove");
  assert.equal(decideInvoiceReceivable({ ...base, value: 0 }).action, "remove");
});

test("NF cancelada com cobrança ainda aberta continua a receber", () => {
  const d = decideInvoiceReceivable({ ...base, nfse_status: "CANCELLED", status: "PENDING" }, { emite_nf: false });
  assert.equal(d.action, "upsert");
});

test("vencimento inválido usa a data de criação", () => {
  const d = decideInvoiceReceivable(
    { ...base, due_date: "PENDENTE", created_at: "2026-09-02T12:00:00Z" },
    { emite_nf: false },
  );
  assert.equal(d.action, "upsert");
  if (d.action !== "upsert") return;
  assert.equal(d.due_date, "2026-09-02");
});
