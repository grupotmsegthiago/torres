import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contractFranquiaKm, suggestPriceTableByRouteKm } from "./suggest-price-table-by-km";

describe("suggest-price-table-by-km", () => {
  const tables = [
    { id: "a", name: "100km", franquia_km: 100, franquia_horas: 3 },
    { id: "b", name: "200km", franquia_km: 200, franquia_horas: 5 },
    { id: "c", name: "300km", franquia_km: 300, franquia_horas: 8 },
  ];

  it("contractFranquiaKm usa fallback minima", () => {
    assert.equal(contractFranquiaKm({ id: "x", franquia_minima_km: 150 }), 150);
    assert.equal(contractFranquiaKm({ id: "y", franquia_km: 200, franquia_minima_km: 100 }), 200);
  });

  it("escolhe menor franquia que cobre a rota (200 → 200km)", () => {
    const { suggested } = suggestPriceTableByRouteKm(tables, 200);
    assert.equal(suggested?.id, "b");
    assert.equal(suggested?.name, "200km");
  });

  it("198 km ainda cai na tabela 200", () => {
    const { suggested } = suggestPriceTableByRouteKm(tables, 198);
    assert.equal(suggested?.id, "b");
  });

  it("101 km usa 200 (não cabe em 100)", () => {
    const { suggested } = suggestPriceTableByRouteKm(tables, 101);
    assert.equal(suggested?.id, "b");
  });

  it("50 km usa 100", () => {
    const { suggested } = suggestPriceTableByRouteKm(tables, 50);
    assert.equal(suggested?.id, "a");
  });

  it("rota acima de todas usa a maior", () => {
    const { suggested } = suggestPriceTableByRouteKm(tables, 450);
    assert.equal(suggested?.id, "c");
  });

  it("sem km ou sem tabelas não sugere", () => {
    assert.equal(suggestPriceTableByRouteKm(tables, 0).suggested, null);
    assert.equal(suggestPriceTableByRouteKm([], 200).suggested, null);
  });
});
