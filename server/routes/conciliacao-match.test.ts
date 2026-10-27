import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDaysBetween,
  fuelingCountsInSystemTotal,
  fuelingInConciliacaoPeriod,
  matchAbastecimentoTicketlog,
  shiftIsoDate,
  type FuelingMatchRow,
  type TicketLogTx,
} from "./conciliacao";

function tx(partial: Partial<TicketLogTx> & Pick<TicketLogTx, "code" | "date" | "valor">): TicketLogTx {
  return {
    time: "23:30:00",
    plate: "ABC1D23",
    fuelType: "ETANOL",
    km: 1000,
    liters: 10,
    driver: "MOTORISTA",
    station: "POSTO",
    city: "GUARULHOS",
    uf: "SP",
    ...partial,
  };
}

function fuel(partial: Partial<FuelingMatchRow> & Pick<FuelingMatchRow, "id" | "date" | "total_cost">): FuelingMatchRow {
  return {
    vehicle_id: 1,
    driver_id: 7,
    liters: 10,
    fuel_type: "etanol",
    station: "POSTO",
    km: 1000,
    ticketlog_autorizacao: null,
    ...partial,
  };
}

const plates = new Map<number, string>([[1, "ABC1D23"]]);
const drivers = new Map<number, string>([[7, "MOTORISTA"]]);
const registered = new Set(["ABC1D23"]);

function run(transactions: TicketLogTx[], fuelings: FuelingMatchRow[]) {
  return matchAbastecimentoTicketlog({
    transactions,
    fuelings,
    plateByVehicleId: plates,
    driverNameById: drivers,
    registeredPlates: registered,
  });
}

test("shiftIsoDate atravessa o mês sem depender do fuso", () => {
  assert.equal(shiftIsoDate("2026-09-30", 1), "2026-10-01");
  assert.equal(shiftIsoDate("2026-10-01", -1), "2026-09-30");
  assert.equal(calendarDaysBetween("2026-09-30", "2026-10-01"), 1);
  assert.equal(calendarDaysBetween("2026-10-01", "2026-09-30"), -1);
});

test("período do relatório não inclui a margem de um dia", () => {
  assert.equal(fuelingInConciliacaoPeriod("2026-09-30", "2026-09-01", "2026-09-30", "2026-04-09"), true);
  assert.equal(fuelingInConciliacaoPeriod("2026-10-01", "2026-09-01", "2026-09-30", "2026-04-09"), false);
  assert.equal(fuelingInConciliacaoPeriod("2026-08-31", "2026-09-01", "2026-09-30", "2026-04-09"), false);
});

test("total do sistema soma a margem só quando fechou par", () => {
  const paired = new Set([2, 4]);
  const period = ["2026-09-30", "2026-09-30", "2026-04-09"] as const;
  assert.equal(fuelingCountsInSystemTotal("2026-09-30", 1, ...period, paired), true);
  assert.equal(fuelingCountsInSystemTotal("2026-10-01", 2, ...period, paired), true);
  assert.equal(fuelingCountsInSystemTotal("2026-10-01", 3, ...period, paired), false);
  assert.equal(fuelingCountsInSystemTotal("2026-09-29", 4, ...period, paired), true);
});

test("mesmo dia e mesmo valor continua o par, sem usar o dia seguinte", () => {
  const r = run(
    [tx({ code: "1", date: "30/09/2026", valor: 100 })],
    [fuel({ id: 1, date: "2026-09-30", total_cost: 100 }), fuel({ id: 2, date: "2026-10-01", total_cost: 100 })],
  );
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].system.id, 1);
  assert.equal(r.matched[0].diffs.dateOffsetDays, 0);
  assert.equal(r.missingInSystem.length, 0);
});

test("sem lançamento no dia, aceita o dia seguinte com o mesmo valor", () => {
  const r = run(
    [tx({ code: "1", date: "30/09/2026", valor: 80.5 })],
    [fuel({ id: 2, date: "2026-10-01", total_cost: "80.50" })],
  );
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].system.id, 2);
  assert.equal(r.matched[0].diffs.dateOffsetDays, 1);
  assert.equal(r.missingInSystem.length, 0);
});

test("sem lançamento no dia, aceita o dia anterior com o mesmo valor", () => {
  const r = run(
    [tx({ code: "1", date: "01/10/2026", valor: 72.57 })],
    [fuel({ id: 3, date: "2026-09-30", total_cost: 72.57 })],
  );
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].diffs.dateOffsetDays, -1);
});

test("dois dias de diferença continuam sem par", () => {
  const r = run(
    [tx({ code: "1", date: "30/09/2026", valor: 80 })],
    [fuel({ id: 4, date: "2026-10-02", total_cost: 80 })],
  );
  assert.equal(r.missingInSystem.length, 1);
  assert.equal(r.matched.length, 0);
});

test("mesmo dia com valor diferente não perde o lugar para o dia seguinte exato", () => {
  const r = run(
    [tx({ code: "1", date: "30/09/2026", valor: 100 })],
    [
      fuel({ id: 1, date: "2026-09-30", total_cost: 40 }),
      fuel({ id: 2, date: "2026-10-01", total_cost: 100 }),
    ],
  );
  assert.equal(r.valueMismatch.length, 1);
  assert.equal(r.valueMismatch[0].system.id, 1);
  assert.equal(r.matched.length, 0);
});

test("a segunda passada não toma o abastecimento que já fechou no mesmo dia de outra linha", () => {
  const r = run(
    [
      tx({ code: "A", date: "30/09/2026", valor: 100 }),
      tx({ code: "B", date: "01/10/2026", valor: 100 }),
    ],
    [fuel({ id: 2, date: "2026-10-01", total_cost: 100 })],
  );
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].ticketlog.code, "B");
  assert.equal(r.missingInSystem.length, 1);
  assert.equal(r.missingInSystem[0].ticketlog.code, "A");
});

test("na margem de um dia, sem valor igual, usa o mais próximo e separa Bate de Diverge em R$ 5", () => {
  const perto = run(
    [tx({ code: "1", date: "30/09/2026", valor: 100 })],
    [fuel({ id: 1, date: "2026-10-01", total_cost: 102 })],
  );
  assert.equal(perto.matched.length, 1);
  assert.equal(perto.matched[0].diffs.dateOffsetDays, 1);

  const longe = run(
    [tx({ code: "1", date: "30/09/2026", valor: 100 })],
    [fuel({ id: 1, date: "2026-10-01", total_cost: 200 })],
  );
  assert.equal(longe.valueMismatch.length, 1);
  assert.equal(longe.matched.length, 0);
});

test("placa fora do cadastro não vira falta no sistema", () => {
  const r = run(
    [tx({ code: "1", date: "30/09/2026", valor: 80, plate: "ZZZ0Z00" })],
    [fuel({ id: 1, date: "2026-10-01", total_cost: 80 })],
  );
  assert.equal(r.unregisteredPlates.length, 1);
  assert.equal(r.missingInSystem.length, 0);
  assert.equal(r.matched.length, 0);
});

test("código TicketLog antigo ainda casa antes da data", () => {
  const r = run(
    [tx({ code: "999", date: "30/09/2026", valor: 10 })],
    [fuel({ id: 8, date: "2026-10-01", total_cost: 50, ticketlog_autorizacao: "999" })],
  );
  assert.equal(r.valueMismatch.length, 1);
  assert.equal(r.valueMismatch[0].system.id, 8);
  assert.equal(r.valueMismatch[0].diffs.dateOffsetDays, 1);
});
