import test from "node:test";
import assert from "node:assert/strict";
import { movementKind, selectBalanceComposition, type LedgerTx } from "./asaas-balance-composition";

function tx(partial: Partial<LedgerTx> & Pick<LedgerTx, "id" | "value" | "balance">): LedgerTx {
  return {
    type: "PAYMENT_RECEIVED",
    date: "2026-10-30",
    description: null,
    paymentId: null,
    ...partial,
  };
}

test("recebimentos depois da reserva compõem o saldo e a transferência fica de fora", () => {
  // Extrato do mais novo para o mais antigo.
  const txs: LedgerTx[] = [
    tx({ id: "b", value: 4423.15, balance: 6518.25, paymentId: "pay_b", date: "2026-10-30" }),
    tx({ id: "fee", value: -4.9, balance: 2095.1, type: "PAYMENT_FEE", date: "2026-10-29" }),
    tx({ id: "a", value: 2000, balance: 2100, paymentId: "pay_a", date: "2026-10-29" }),
    tx({ id: "pix", value: -6400, balance: 100, type: "TRANSFER", date: "2026-10-20" }),
    tx({ id: "old", value: 6400, balance: 6500, paymentId: "pay_old", date: "2026-10-18" }),
  ];

  const r = selectBalanceComposition(txs, 6518.25, 100);
  assert.equal(r.covered, true);
  assert.equal(r.reason, "ok");
  assert.equal(r.openedFrom, 100);
  assert.deepEqual(r.items.map((i) => i.id), ["a", "fee", "b"]);
  const sum = r.items.reduce((s, i) => s + i.value, 0);
  assert.equal(Math.round((sum + (r.openedFrom || 0)) * 100), 651825);
});

test("saldo repetido usa o ciclo mais novo, não o recebimento anterior", () => {
  const txs: LedgerTx[] = [
    tx({ id: "novo", value: 6418.25, balance: 6518.25, date: "2026-10-30" }),
    tx({ id: "saida", value: -6418.25, balance: 100, type: "TRANSFER", date: "2026-10-25" }),
    tx({ id: "velho", value: 6418.25, balance: 6518.25, date: "2026-10-10" }),
  ];
  const r = selectBalanceComposition(txs, 6518.25, 100);
  assert.equal(r.covered, true);
  assert.deepEqual(r.items.map((i) => i.id), ["novo"]);
  assert.equal(r.openedFrom, 100);
});

test("lista do mais antigo para o mais novo ainda pega o ciclo atual", () => {
  const txs: LedgerTx[] = [
    tx({ id: "velho", value: 6418.25, balance: 6518.25, date: "2026-10-10" }),
    tx({ id: "saida", value: -6418.25, balance: 100, type: "TRANSFER", date: "2026-10-25" }),
    tx({ id: "novo", value: 6418.25, balance: 6518.25, date: "2026-10-30" }),
  ];
  const r = selectBalanceComposition(txs, 6518.25, 100);
  assert.equal(r.covered, true);
  assert.deepEqual(r.items.map((i) => i.id), ["novo"]);
});

test("saldo que voltou ao mesmo valor não pula o recebimento do meio", () => {
  const txs: LedgerTx[] = [
    tx({ id: "a", value: 400, balance: 500, date: "2026-10-01" }),
    tx({ id: "b", value: 1000, balance: 1500, date: "2026-10-02" }),
    tx({ id: "c", value: -1000, balance: 500, type: "PAYMENT_REVERSAL", date: "2026-10-03" }),
    tx({ id: "d", value: 1500, balance: 2000, date: "2026-10-04" }),
  ];
  const r = selectBalanceComposition(txs, 2000, 100);
  assert.equal(r.covered, true);
  assert.equal(r.reason, "ok");
  assert.equal(r.openedFrom, 100);
  assert.deepEqual(r.items.map((i) => i.id), ["a", "b", "c", "d"]);
});

test("saldo já na reserva não tem histórico de recebimento", () => {
  const r = selectBalanceComposition([
    tx({ id: "pix", value: -500, balance: 100, type: "TRANSFER" }),
  ], 100, 100);
  assert.equal(r.covered, true);
  assert.equal(r.reason, "so_reserva");
  assert.equal(r.items.length, 0);
  assert.equal(r.openedFrom, 100);
});

test("sem lançamento ancorado no saldo atual não inventa composição", () => {
  const r = selectBalanceComposition([
    tx({ id: "a", value: 10, balance: 110 }),
  ], 6518.25, 100);
  assert.equal(r.covered, false);
  assert.equal(r.reason, "sem_ancora");
  assert.equal(r.items.length, 0);
});

test("cadeia cortada no meio da página marca histórico parcial", () => {
  const r = selectBalanceComposition([
    tx({ id: "b", value: 1000, balance: 3100 }),
  ], 3100, 100);
  assert.equal(r.covered, false);
  assert.equal(r.reason, "cadeia_incompleta");
  assert.deepEqual(r.items.map((i) => i.id), ["b"]);
  assert.equal(r.openedFrom, 2100);
});

test("tipo do lançamento separa recebimento, taxa e estorno", () => {
  assert.equal(movementKind("PAYMENT_RECEIVED", 100), "recebimento");
  assert.equal(movementKind("PAYMENT_FEE", -1.99), "taxa");
  assert.equal(movementKind("PAYMENT_REVERSAL", -50), "estorno");
  assert.equal(movementKind("PIX_TRANSACTION_DEBIT", -100), "outro");
});
