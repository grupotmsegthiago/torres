import { test } from "node:test";
import assert from "node:assert/strict";
import { rebuildApproval, rebuildSnapshotEntry } from "./boletim-resync";

const entry = (billingId: string, soId: number, total: number): any => ({
  billing_id: billingId,
  service_order_id: soId,
  os_number: `TOR-${soId}`,
  fat_acionamento: total,
  fat_hora_extra: 0, fat_km: 0, fat_adicional_noturno: 0, fat_estadia: 0,
  fat_pernoite: 0, despesas_pedagio: 0, despesas_outras: 0, receitas_os: 0,
  total,
});

test("OS recusada sai do boletim PENDENTE (ids, snapshot, total e os_count)", () => {
  const approval = {
    billing_ids: ["10", "11", "12"],
    billing_snapshot: [entry("10", 1, 480), entry("11", 2, 960), entry("12", 3, 555.65)],
  };
  const soStatus = new Map([[1, "recusada"], [2, "concluida"], [3, "concluida"]]);
  const out = rebuildApproval(approval as any, soStatus, new Map());
  assert.ok(out);
  assert.deepEqual(out!.billing_ids, ["11", "12"]);
  assert.equal(out!.os_count, 2);
  assert.equal(out!.total_value, 1515.65);
  assert.equal(out!.billing_snapshot.length, 2);
});

test("OS cancelada é recongelada com valores atuais do billing (tabela 100km)", () => {
  const approval = {
    billing_ids: ["10"],
    billing_snapshot: [entry("10", 1, 1200)],
  };
  const soStatus = new Map([[1, "cancelada"]]);
  const billing = { id: "10", fat_total: 562.5, fat_acionamento: 562.5, fat_hora_extra: 0, fat_km: 0, fat_adicional_noturno: 0, fat_estadia: 0, fat_pernoite: 0, despesas_pedagio: 0, despesas_outras: 0, receitas_os: 0 };
  const out = rebuildApproval(approval as any, soStatus, new Map([["10", billing]]));
  assert.ok(out);
  assert.equal(out!.total_value, 562.5);
  assert.equal(out!.os_count, 1);
  assert.equal(out!.billing_snapshot[0].total, 562.5);
});

test("sem mudança de status relevante ⇒ null (não escreve no banco)", () => {
  const approval = {
    billing_ids: ["10", "11"],
    billing_snapshot: [entry("10", 1, 480), entry("11", 2, 960)],
  };
  const soStatus = new Map([[1, "concluida"], [2, "concluída"]]);
  assert.equal(rebuildApproval(approval as any, soStatus, new Map()), null);
});

test("cancelada com total inalterado ⇒ null", () => {
  const approval = { billing_ids: ["10"], billing_snapshot: [entry("10", 1, 562.5)] };
  const soStatus = new Map([[1, "cancelada"]]);
  const billing = { id: "10", fat_total: 562.5, fat_acionamento: 562.5 };
  assert.equal(rebuildApproval(approval as any, soStatus, new Map([["10", billing]])), null);
});

test("elegibilidade de envio: recusada e faturada/paga ficam fora; demais entram", async () => {
  const { billingElegivelParaBoletim } = await import("./boletim-totals");
  assert.equal(billingElegivelParaBoletim({ status: "A_VERIFICAR" }, "recusada").ok, false);
  assert.equal(billingElegivelParaBoletim({ status: "FATURADO" }, "concluida").ok, false);
  assert.equal(billingElegivelParaBoletim({ status: "FATURADA" }, "concluida").ok, false);
  assert.equal(billingElegivelParaBoletim({ status: "PAGO" }, "concluida").ok, false);
  assert.equal(billingElegivelParaBoletim({ status: "A_VERIFICAR" }, "concluida").ok, true);
  assert.equal(billingElegivelParaBoletim({ status: "APROVADA" }, "concluída").ok, true);
  assert.equal(billingElegivelParaBoletim({ status: "CANCELADO" }, "cancelada").ok, true);
});

test("rebuildSnapshotEntry zera componentes de recusada", () => {
  const e = rebuildSnapshotEntry({ fat_acionamento: 480, fat_total: 480 }, "recusada", entry("10", 1, 480));
  assert.equal(e.total, 0);
  assert.equal(e.fat_acionamento, 0);
});
