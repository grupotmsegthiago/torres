import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceReadyForClientEmail, INVOICE_CLIENT_EMAIL_CC, INVOICE_CLIENT_EMAIL_BCC } from "./invoice-billing-email";

test("e-mail da NF: CC financeiro/adm e BCC thiago", () => {
  assert.deepEqual([...INVOICE_CLIENT_EMAIL_CC], [
    "financeiro@torresseguranca.com.br",
    "adm@torresseguranca.com.br",
  ]);
  assert.deepEqual([...INVOICE_CLIENT_EMAIL_BCC], ["thiago@grupotmseg.com.br"]);
});

test("invoiceReadyForClientEmail: exige boleto Asaas", () => {
  assert.equal(invoiceReadyForClientEmail({ email_sent: false, asaas_payment_id: null, invoice_url: "x" }, false), false);
  assert.equal(invoiceReadyForClientEmail({
    email_sent: false, asaas_payment_id: "pay_1", bank_slip_url: "https://asaas/b",
  }, false), true);
});

test("invoiceReadyForClientEmail: com emite_nf exige número municipal autorizado", () => {
  const boleto = { email_sent: false, asaas_payment_id: "pay_1", invoice_url: "https://asaas/i" };
  assert.equal(invoiceReadyForClientEmail(boleto, true), false);
  assert.equal(invoiceReadyForClientEmail({ ...boleto, nfse_provider: "focus", nfse_ref: "torres-inv-1", nfse_status: "PROCESSING" }, true), false);
  assert.equal(invoiceReadyForClientEmail({ ...boleto, nfse_provider: "focus", nfse_status: "ERROR", nfse_number: "torres-inv-1" }, true), false);
  assert.equal(invoiceReadyForClientEmail({ ...boleto, nfse_status: "AUTHORIZED", nfse_number: "325" }, true), true);
  assert.equal(invoiceReadyForClientEmail({ ...boleto, email_sent: true, nfse_status: "AUTHORIZED", nfse_number: "325" }, true), false);
});
