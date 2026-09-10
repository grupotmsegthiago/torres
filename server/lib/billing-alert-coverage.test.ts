import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leftoverOsNumbers,
  osNeedsFaturamentoAlert,
  refineBillingAlerts,
  type BillingCoverFact,
} from "./billing-alert-coverage.ts";

const recusada: BillingCoverFact = {
  id: "1", osNumber: "TOR-0610", osStatus: "recusada", billingStatus: "CANCELADO", invoiceId: null, inActiveBoletim: false,
};
const inBoletim: BillingCoverFact = {
  id: "2", osNumber: "TOR-0562", osStatus: "concluida", billingStatus: "APROVADA", invoiceId: null, inActiveBoletim: true,
};
const invoiced: BillingCoverFact = {
  id: "3", osNumber: "TOR-0999", osStatus: "concluida", billingStatus: "FATURADO", invoiceId: 163, inActiveBoletim: false,
};
const leftover: BillingCoverFact = {
  id: "4", osNumber: "TOR-0661", osStatus: "cancelada", billingStatus: "CANCELADO", invoiceId: null, inActiveBoletim: false,
};

test("recusada, boletim ativo e fatura não geram alerta", () => {
  assert.equal(osNeedsFaturamentoAlert(recusada), false);
  assert.equal(osNeedsFaturamentoAlert(inBoletim), false);
  assert.equal(osNeedsFaturamentoAlert(invoiced), false);
  assert.equal(osNeedsFaturamentoAlert(leftover), true);
});

test("leftover lista só OS de verdade fora do faturamento", () => {
  assert.deepEqual(leftoverOsNumbers([recusada, inBoletim, invoiced, leftover]), ["TOR-0661"]);
});

test("refine: some alerta se já está no boletim; reescreve ciclo com leftover real", () => {
  const leftoverMap = new Map<string, string[]>([
    ["121", []],
    ["119", ["TOR-0661", "TOR-0717"]],
    ["120", ["TOR-0661", "TOR-0717"]],
  ]);
  const visible = refineBillingAlerts(
    [
      { id: 121, client_name: "UNIKA", alert_type: "OS_ESQUECIDA", os_numbers: "TOR-0562", resolved: false },
      { id: 119, client_id: 9, client_name: "TM SEG", alert_type: "VENCIMENTO_EMISSAO", period_start: "2026-08-16", period_end: "2026-08-31", resolved: false },
      { id: 120, client_id: 9, client_name: "TM SEG", alert_type: "PENDENTE_FATURAMENTO", period_start: "2026-08-16", period_end: "2026-08-31", resolved: false },
    ],
    leftoverMap,
  );
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 119);
  assert.match(visible[0].message, /TOR-0661/);
  assert.match(visible[0].message, /2 OS/);
});
