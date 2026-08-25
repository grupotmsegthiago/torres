import test from "node:test";
import assert from "node:assert/strict";
import { aggregateRotasFaturamento } from "./rotas-faturamento.js";

test("aggregateRotasFaturamento: agrupa por rota e calcula percentuais", () => {
  const result = aggregateRotasFaturamento([
    {
      origin: "São Paulo - SP, Brasil",
      destination: "Rio de Janeiro - RJ, Brasil",
      fatTotal: 1000,
      share: 1,
      margemLiquida: 400,
      despesas: 100,
    },
    {
      origin: "São Paulo - SP, Brasil",
      destination: "Rio de Janeiro - RJ, Brasil",
      fatTotal: 800,
      share: 0.5,
      margemLiquida: 300,
      despesas: 80,
    },
    {
      origin: "Campinas - SP, Brasil",
      destination: "Santos - SP, Brasil",
      fatTotal: 600,
      share: 1,
      margemLiquida: 200,
      despesas: 50,
    },
  ]);

  assert.equal(result.rotas.length, 2);
  assert.equal(result.totalFaturamento, 2000); // 1000 + 400 + 600

  const spRj = result.rotas.find((r) => r.rota.includes("São Paulo") && r.rota.includes("Rio"));
  assert.ok(spRj);
  assert.equal(spRj!.missoes, 2);
  assert.equal(spRj!.fatAgente, 1400);
  assert.equal(spRj!.pctFaturamento, 70);
  assert.equal(spRj!.margemLiquida, 550); // 400 + 150
  assert.equal(spRj!.despesas, 140); // 100 + 40

  const campSantos = result.rotas.find((r) => r.rota.includes("Campinas"));
  assert.ok(campSantos);
  assert.equal(campSantos!.fatAgente, 600);
  assert.equal(campSantos!.pctFaturamento, 30);
});

test("aggregateRotasFaturamento: melhoresRotas ordena por margem %", () => {
  const result = aggregateRotasFaturamento([
    {
      origin: "A",
      destination: "B",
      fatTotal: 1000,
      share: 1,
      margemLiquida: 100,
      despesas: 50,
    },
    {
      origin: "C",
      destination: "D",
      fatTotal: 500,
      share: 1,
      margemLiquida: 300,
      despesas: 20,
    },
  ]);

  assert.deepEqual(result.melhoresRotas, ["C → D", "A → B"]);
});

test("aggregateRotasFaturamento: ignora missões sem faturamento", () => {
  const result = aggregateRotasFaturamento([
    {
      origin: "X",
      destination: "Y",
      fatTotal: 0,
      share: 1,
      margemLiquida: 0,
      despesas: 0,
    },
  ]);

  assert.equal(result.rotas.length, 0);
  assert.equal(result.totalFaturamento, 0);
});
