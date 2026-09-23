import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDateKey,
  formatDateOnlyBR,
  parseBrDateToYmd,
  ymdToBrDisplay,
  maskBrDateInput,
  ymdToLocalDate,
  localDateToYmd,
} from "./date-key.ts";

test("toDateKey: DATE pura YYYY-MM-DD não escorrega (nem D-1 nem D+1)", () => {
  assert.equal(toDateKey("2026-08-03"), "2026-08-03");
  assert.equal(toDateKey("2026-01-01"), "2026-01-01");
  assert.equal(toDateKey("2026-12-31"), "2026-12-31");
});

test("toDateKey: ISO com hora usa dia BRT", () => {
  // 03/08 00:00 UTC = 02/08 21:00 BRT
  assert.equal(toDateKey("2026-08-03T00:00:00.000Z"), "2026-08-02");
  // 03/08 03:00 UTC = 03/08 00:00 BRT
  assert.equal(toDateKey("2026-08-03T03:00:00.000Z"), "2026-08-03");
});

test("toDateKey: prefixo ISO truncado mantém o dia", () => {
  assert.equal(toDateKey("2026-08-03T00:00:00.000Z".slice(0, 10)), "2026-08-03");
});

test("formatDateOnlyBR: DATE pura vira dd/mm/aaaa sem fuso", () => {
  assert.equal(formatDateOnlyBR("2026-08-03"), "03/08/2026");
  assert.equal(formatDateOnlyBR("2026-08-03T00:00:00.000Z".slice(0, 10)), "03/08/2026");
  assert.equal(formatDateOnlyBR(null), "—");
  assert.equal(formatDateOnlyBR(""), "—");
});

test("parseBrDateToYmd: 21/01/2026 → 2026-01-21 (nunca MM/DD)", () => {
  assert.equal(parseBrDateToYmd("21/01/2026"), "2026-01-21");
  assert.equal(parseBrDateToYmd("01/21/2026"), null); // mês 21 inválido
  assert.equal(parseBrDateToYmd("1/2/2026"), "2026-02-01");
  assert.equal(parseBrDateToYmd("29/02/2024"), "2024-02-29");
  assert.equal(parseBrDateToYmd("29/02/2025"), null);
  assert.equal(parseBrDateToYmd(""), null);
});

test("ymdToBrDisplay / maskBrDateInput: round-trip sem off-by-one", () => {
  assert.equal(ymdToBrDisplay("2026-01-21"), "21/01/2026");
  assert.equal(parseBrDateToYmd(ymdToBrDisplay("2026-01-21")), "2026-01-21");
  assert.equal(maskBrDateInput("21012026"), "21/01/2026");
  assert.equal(maskBrDateInput("21"), "21");
  assert.equal(maskBrDateInput("2101"), "21/01");
});

test("ymdToLocalDate / localDateToYmd: calendário local sem UTC D-1", () => {
  const d = ymdToLocalDate("2026-01-21");
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2026);
  assert.equal(d!.getMonth(), 0);
  assert.equal(d!.getDate(), 21);
  assert.equal(localDateToYmd(d!), "2026-01-21");
  assert.equal(ymdToLocalDate("2026-02-30"), null);
});

test("filtro de período: DATE no limite dateTo entra no range", () => {
  const dateFrom = "2026-07-16";
  const dateTo = "2026-08-03";
  // ISO com hora falha em comparação lexicográfica direta com dateTo
  assert.equal("2026-08-03T00:00:00.000Z" <= dateTo, false);
  for (const raw of ["2026-08-03", "2026-08-03T00:00:00.000Z", "2026-08-03T12:00:00"]) {
    const d = toDateKey(raw);
    assert.ok(d, `toDateKey(${raw})`);
    // Para ISO UTC midnight, o dia BRT é D-1 — o filtro correto usa toDateKey.
    // Aqui validamos só a DATE pura e o timestamp local/noon.
    if (raw === "2026-08-03" || raw === "2026-08-03T12:00:00") {
      assert.equal(d! >= dateFrom && d! <= dateTo, true, `${raw} → ${d}`);
    }
  }
  assert.equal(toDateKey("2026-08-03"), "2026-08-03");
  assert.equal(toDateKey("2026-08-03")! <= dateTo, true);
});
