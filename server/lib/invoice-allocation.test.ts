// Testes do rateio de recebimento por OS (Etapa 2 do Vínculo OS↔Fatura).
import test from "node:test";
import assert from "node:assert/strict";
import { ratearRecebimento } from "./invoice-allocation";

test("pagamento integral quita todos os itens", () => {
  const r = ratearRecebimento([
    { billingId: "b1", valorItem: 300 },
    { billingId: "b2", valorItem: 200 },
  ], 500);
  assert.equal(r.integral, true);
  assert.equal(r.percentualRecebido, 100);
  assert.ok(r.itens.every((i) => i.quitado));
});

test("tolerância de centavos: 499.97 quita fatura de 500", () => {
  const r = ratearRecebimento([{ billingId: "b1", valorItem: 500 }], 499.97);
  assert.equal(r.integral, true);
  assert.equal(r.itens[0].quitado, true);
});

test("parcial proporcional: aloca por participação e não quita ninguém", () => {
  const r = ratearRecebimento([
    { billingId: "b1", valorItem: 600 },
    { billingId: "b2", valorItem: 400 },
  ], 500);
  assert.equal(r.integral, false);
  assert.equal(r.percentualRecebido, 50);
  const a1 = r.itens.find((i) => i.billingId === "b1")!;
  const a2 = r.itens.find((i) => i.billingId === "b2")!;
  assert.equal(a1.valorAlocado, 300);
  assert.equal(a2.valorAlocado, 200);
  assert.ok(!a1.quitado && !a2.quitado);
  assert.equal(a1.origem, "proporcional");
});

test("identificação por item: recebido bate com exatamente um item", () => {
  const r = ratearRecebimento([
    { billingId: "b1", valorItem: 300 },
    { billingId: "b2", valorItem: 450 },
  ], 450);
  const a2 = r.itens.find((i) => i.billingId === "b2")!;
  assert.equal(a2.valorAlocado, 450);
  assert.equal(a2.quitado, true);
  assert.equal(a2.origem, "identificado");
  assert.equal(r.itens.find((i) => i.billingId === "b1")!.valorAlocado, 0);
});

test("identificação ambígua (2 itens de mesmo valor) cai no proporcional", () => {
  const r = ratearRecebimento([
    { billingId: "b1", valorItem: 250 },
    { billingId: "b2", valorItem: 250 },
  ], 250);
  assert.ok(r.itens.every((i) => i.origem === "proporcional"));
  assert.equal(r.itens[0].valorAlocado + r.itens[1].valorAlocado, 250);
});

test("alocação manual tem prioridade sobre o rateio", () => {
  const r = ratearRecebimento([
    { billingId: "b1", valorItem: 300, valorAlocadoManual: 300 },
    { billingId: "b2", valorItem: 400 },
  ], 350);
  const a1 = r.itens.find((i) => i.billingId === "b1")!;
  const a2 = r.itens.find((i) => i.billingId === "b2")!;
  assert.equal(a1.valorAlocado, 300);
  assert.equal(a1.origem, "manual");
  assert.equal(a1.quitado, true);
  assert.equal(a2.valorAlocado, 50);
  assert.ok(!a2.quitado);
});

test("soma alocada nunca excede o recebido nem o valor dos itens", () => {
  const r = ratearRecebimento([
    { billingId: "b1", valorItem: 333.33 },
    { billingId: "b2", valorItem: 333.33 },
    { billingId: "b3", valorItem: 333.34 },
  ], 700);
  const soma = r.itens.reduce((s, i) => s + i.valorAlocado, 0);
  assert.ok(Math.abs(soma - 700) <= 0.01, `soma=${soma}`);
  for (const i of r.itens) assert.ok(i.valorAlocado <= i.valorItem + 0.01);
});

test("recebido zero: nada alocado, nada quitado", () => {
  const r = ratearRecebimento([{ billingId: "b1", valorItem: 100 }], 0);
  assert.equal(r.totalAlocado, 0);
  assert.ok(!r.itens[0].quitado);
});
