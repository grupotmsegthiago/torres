import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  currentBrtCalendarMonthYm,
  formatOsListPeriodLabel,
  formatOsListRangeLabel,
  osListCalendarMonthFetchWindow,
  osListCalendarMonthRange,
  osListDateRange,
  osListDateRangeFetchWindow,
  osMatchesCalendarMonth,
  osMatchesDateRange,
} from "./os-list-period";

test("outubro de 2026 cobre 01/10 até 31/10, inclusive os limites", () => {
  assert.deepEqual(osListCalendarMonthRange("2026-10"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(osListCalendarMonthFetchWindow("2026-10"), {
    from: "2026-10-01",
    to: "2026-10-31",
    fromPad: "2026-09-30",
    toPad: "2026-11-01",
  });
  assert.equal(formatOsListPeriodLabel("2026-10"), "Período: 01/10/2026 a 31/10/2026");

  const inside = [
    { scheduledDate: "2026-10-01T00:00:00-03:00" },
    { scheduledDate: "2026-10-01" },
    { scheduledDate: "2026-10-31T23:59:59-03:00" },
    { scheduledDate: "2026-10-31T23:30:00" },
    { scheduledDate: "2026-11-01T02:30:00Z" },
  ];
  for (const order of inside) {
    assert.equal(osMatchesCalendarMonth(order, "2026-10"), true, JSON.stringify(order));
  }

  const outside = [
    { scheduledDate: "2026-09-30T23:59:59-03:00" },
    { scheduledDate: "2026-10-01T02:30:00Z" },
    { scheduledDate: "2026-11-01T00:00:00-03:00" },
    { scheduledDate: "2026-11-01T03:00:00Z" },
  ];
  for (const order of outside) {
    assert.equal(osMatchesCalendarMonth(order, "2026-10"), false, JSON.stringify(order));
  }
});

test("fevereiro de 2026 fecha em 28", () => {
  assert.deepEqual(osListCalendarMonthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2026-02-01T00:00:00-03:00" }, "2026-02"), true);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2026-02-28T23:59:59-03:00" }, "2026-02"), true);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2026-02-29T12:00:00-03:00" }, "2026-02"), false);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2026-03-01T00:00:00-03:00" }, "2026-02"), false);
});

test("fevereiro de 2028 fecha em 29", () => {
  assert.deepEqual(osListCalendarMonthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2028-02-29T00:00:00-03:00" }, "2028-02"), true);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2028-02-29T23:59:59-03:00" }, "2028-02"), true);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2028-03-01T00:00:00-03:00" }, "2028-02"), false);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2028-03-01T02:30:00Z" }, "2028-02"), true);
});

test("sem agendamento usa createdAt; agendamento vence a criação", () => {
  assert.equal(
    osMatchesCalendarMonth(
      { scheduledDate: "2026-11-15T12:00:00-03:00", createdAt: "2026-10-02T12:00:00-03:00" },
      "2026-10",
    ),
    false,
  );
  assert.equal(
    osMatchesCalendarMonth({ scheduledDate: null, createdAt: "2026-10-31T22:00:00-03:00" }, "2026-10"),
    true,
  );
  assert.equal(
    osMatchesCalendarMonth({ scheduled_date: "", created_at: "2026-10-01T08:00:00-03:00" }, "2026-10"),
    true,
  );
  assert.equal(osMatchesCalendarMonth({}, "2026-10"), false);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2026-10-10" }, "2026-13"), false);
  assert.equal(osMatchesCalendarMonth({ scheduledDate: "2026-10-10" }, "hoje"), false);
});

test("mês combina com status, cliente, autorizador e texto antes da página", () => {
  const orders = [
    { osNumber: "TOR-1", status: "aberta", clientId: 1, createdByUserId: 7, scheduledDate: "2026-10-02T10:00:00-03:00" },
    { osNumber: "TOR-2", status: "concluida", clientId: 1, createdByUserId: 7, scheduledDate: "2026-10-20T10:00:00-03:00" },
    { osNumber: "TOR-3", status: "aberta", clientId: 2, createdByUserId: 7, scheduledDate: "2026-11-02T10:00:00-03:00" },
    { osNumber: "TOR-4", status: "aberta", clientId: 1, createdByUserId: 9, scheduledDate: "2026-10-31T23:00:00-03:00" },
    { osNumber: "TOR-5", status: "aberta", clientId: 1, createdByUserId: 7, scheduledDate: null, createdAt: "2026-09-30T23:00:00-03:00" },
  ];
  const inMonth = orders.filter((o) => osMatchesCalendarMonth(o, "2026-10"));
  assert.deepEqual(inMonth.map((o) => o.osNumber), ["TOR-1", "TOR-2", "TOR-4"]);
  const combined = inMonth.filter((o) => o.status === "aberta" && o.clientId === 1 && o.createdByUserId === 7 && o.osNumber.toLowerCase().includes("tor-1"));
  assert.deepEqual(combined.map((o) => o.osNumber), ["TOR-1"]);
  const pageSize = 1;
  const page = inMonth.slice(0, pageSize);
  assert.equal(page.length, pageSize);
  assert.equal(inMonth.length, 3);
});

test("mês civil corrente em BRT é YYYY-MM estável", () => {
  assert.equal(currentBrtCalendarMonthYm(new Date("2026-10-15T12:00:00-03:00")), "2026-10");
  assert.equal(currentBrtCalendarMonthYm(new Date("2026-11-01T02:30:00Z")), "2026-10");
  assert.equal(currentBrtCalendarMonthYm(new Date("2026-11-01T03:00:00Z")), "2026-11");
  assert.match(currentBrtCalendarMonthYm(), /^\d{4}-\d{2}$/);
});

test("intervalo livre aceita data inicial e data final, inclusive os limites", () => {
  assert.deepEqual(osListDateRange("2026-10-19", "2026-10-21"), { from: "2026-10-19", to: "2026-10-21" });
  assert.deepEqual(osListDateRange("2026-10-21", "2026-10-19"), { from: "2026-10-19", to: "2026-10-21" });
  assert.equal(osListDateRange("2026-02-31", "2026-03-01"), null);
  assert.equal(osListDateRange("2026-10-19", ""), null);
  assert.deepEqual(osListDateRangeFetchWindow("2026-10-19", "2026-10-21"), {
    from: "2026-10-19",
    to: "2026-10-21",
    fromPad: "2026-10-18",
    toPad: "2026-10-22",
  });
  assert.equal(formatOsListRangeLabel("2026-10-21", "2026-10-19"), "Período: 19/10/2026 a 21/10/2026");
  assert.equal(osMatchesDateRange({ scheduledDate: "2026-10-19T00:00:00-03:00" }, "2026-10-19", "2026-10-21"), true);
  assert.equal(osMatchesDateRange({ scheduledDate: "2026-10-21T23:59:59-03:00" }, "2026-10-19", "2026-10-21"), true);
  assert.equal(osMatchesDateRange({ scheduledDate: "2026-10-18T23:59:59-03:00" }, "2026-10-19", "2026-10-21"), false);
  assert.equal(osMatchesDateRange({ scheduledDate: "2026-10-19T02:30:00Z" }, "2026-10-19", "2026-10-21"), false);
  assert.equal(osMatchesDateRange({ scheduledDate: "2026-10-22T02:30:00Z" }, "2026-10-19", "2026-10-21"), true);
});

test("a tela pede data inicial e data final e filtra antes de paginar", () => {
  const src = readFileSync(new URL("../client/src/pages/admin/service-orders.tsx", import.meta.url), "utf8");
  assert.match(src, /type="date"/);
  assert.match(src, /aria-label="Data inicial"/);
  assert.match(src, /aria-label="Data final"/);
  assert.match(src, /data-testid="filter-period-from"/);
  assert.match(src, /data-testid="filter-period-to"/);
  assert.match(src, /currentBrtCalendarMonthYm\(\)/);
  assert.match(src, /osMatchesDateRange\(o, activeRange\.from, activeRange\.to\)/);
  assert.match(src, /setFilterFrom\(defaultPeriod\.from\)/);
  assert.match(src, /setFilterTo\(defaultPeriod\.to\)/);
  assert.match(src, /\?from=\$\{encodeURIComponent\(activeRange\.from\)\}&to=\$\{encodeURIComponent\(activeRange\.to\)\}/);
  assert.match(src, /data-testid="text-period-range"/);
  assert.match(src, /data-testid="orders-loading"/);
  assert.match(src, /Nenhuma ordem de serviço encontrada para este período/);
  assert.doesNotMatch(src, /<option value="hoje">/);
  assert.doesNotMatch(src, /type="month"/);
  const filterAt = src.indexOf("osMatchesDateRange(o, activeRange.from, activeRange.to)");
  const pageAt = src.indexOf("displayOrders.slice((safePage - 1) * ITEMS_PER_PAGE");
  assert.ok(filterAt > 0 && pageAt > filterAt);
});

test("a listagem API aceita data inicial e final, e ainda o mês, paginando além do teto 1000", () => {
  const src = readFileSync(new URL("../server/routes/service-orders.ts", import.meta.url), "utf8");
  assert.match(src, /osListCalendarMonthFetchWindow/);
  assert.match(src, /osListDateRangeFetchWindow/);
  assert.match(src, /osMatchesDateRange/);
  assert.match(src, /fetchAllSupabaseRows/);
  assert.match(src, /req\.query\.period/);
  assert.match(src, /req\.query\.from/);
  assert.match(src, /req\.query\.to/);
  assert.match(src, /scheduled_date\.gte\.\$\{periodWindow\.fromPad\}/);
  assert.match(src, /created_at\.gte\.\$\{periodWindow\.fromPad\}/);
  assert.match(src, /Período inválido/);
});
