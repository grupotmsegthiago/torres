import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPayrollPeriod,
  getPayrollPeriodForDate,
  formatPayrollPeriodWithMonthName,
} from "./payroll-period";

// ============================================================================
// getPayrollPeriod — fechamento do dia 26 do mês anterior ao dia 25 do mês ref
// ============================================================================

test("getPayrollPeriod: maio/2026 = 26/abr/2026 → 25/mai/2026", () => {
  const p = getPayrollPeriod(2026, 5);
  assert.equal(p.startDate, "2026-04-26");
  assert.equal(p.endDate, "2026-05-25");
  assert.equal(p.labelShort, "26/abr → 25/mai");
  assert.equal(p.label, "26/abr → 25/mai/2026");
  assert.equal(p.month, 5);
  assert.equal(p.year, 2026);
});

test("getPayrollPeriod: janeiro/2027 = 26/dez/2026 → 25/jan/2027 (virada de ano)", () => {
  const p = getPayrollPeriod(2027, 1);
  assert.equal(p.startDate, "2026-12-26");
  assert.equal(p.endDate, "2027-01-25");
  assert.equal(p.labelShort, "26/dez → 25/jan");
});

test("getPayrollPeriod: março/2026 = 26/fev/2026 → 25/mar/2026 (mês curto)", () => {
  const p = getPayrollPeriod(2026, 3);
  assert.equal(p.startDate, "2026-02-26");
  assert.equal(p.endDate, "2026-03-25");
});

test("getPayrollPeriod: end é 00:00 UTC do dia 26 (exclusivo)", () => {
  const p = getPayrollPeriod(2026, 6);
  // 25 inclusivo → end (exclusivo) é 26/jun 00:00
  assert.equal(p.end.toISOString().slice(0, 10), "2026-06-26");
  assert.equal(p.end.getUTCHours(), 0);
});

test("getPayrollPeriod: rejeita parâmetros inválidos", () => {
  assert.throws(() => getPayrollPeriod(2026, 0));
  assert.throws(() => getPayrollPeriod(2026, 13));
  assert.throws(() => getPayrollPeriod(NaN as any, 5));
});

// ============================================================================
// getPayrollPeriodForDate — qual competência contém uma data específica
// ============================================================================

test("getPayrollPeriodForDate: dia 10/mai cai em maio/2026 (26/abr → 25/mai)", () => {
  const p = getPayrollPeriodForDate(new Date("2026-05-10T12:00:00-03:00"));
  assert.equal(p.month, 5);
  assert.equal(p.year, 2026);
  assert.equal(p.startDate, "2026-04-26");
  assert.equal(p.endDate, "2026-05-25");
});

test("getPayrollPeriodForDate: dia 25/mai cai em maio/2026 (último dia da competência)", () => {
  const p = getPayrollPeriodForDate(new Date("2026-05-25T12:00:00-03:00"));
  assert.equal(p.month, 5);
});

test("getPayrollPeriodForDate: dia 26/mai cai em junho/2026 (primeiro dia da próxima)", () => {
  const p = getPayrollPeriodForDate(new Date("2026-05-26T08:00:00-03:00"));
  assert.equal(p.month, 6);
  assert.equal(p.startDate, "2026-05-26");
  assert.equal(p.endDate, "2026-06-25");
});

test("getPayrollPeriodForDate: virada de ano — 28/dez cai em janeiro/seguinte", () => {
  const p = getPayrollPeriodForDate(new Date("2026-12-28T12:00:00-03:00"));
  assert.equal(p.month, 1);
  assert.equal(p.year, 2027);
});

// ============================================================================
// Sanity: a função do server/routes/holidays.ts (payrollPeriodRange) deve
// retornar o mesmo intervalo que getPayrollPeriod (sem precisar importar o
// server aqui, replicamos a lógica e checamos contra a fonte canônica).
// ============================================================================

test("payrollPeriodRange replica getPayrollPeriod: mesmas datas como YYYY-MM-DD", () => {
  // Replica payrollPeriodRange (em server/routes/holidays.ts) sem importar
  // pra evitar dependência circular no teste.
  const payrollPeriodRange = (year: number, month: number) => {
    const start = new Date(Date.UTC(year, month - 2, 26));
    const end = new Date(Date.UTC(year, month - 1, 25));
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    return { from: fmt(start), to: fmt(end) };
  };
  const cases = [
    [2026, 5], [2026, 1], [2026, 3], [2026, 12], [2027, 1], [2026, 6],
  ] as const;
  for (const [y, m] of cases) {
    const a = getPayrollPeriod(y, m);
    const b = payrollPeriodRange(y, m);
    assert.equal(b.from, a.startDate, `from mismatch ${y}-${m}`);
    assert.equal(b.to, a.endDate, `to mismatch ${y}-${m}`);
  }
});

test("formatPayrollPeriodWithMonthName: 'Maio/2026 (26/abr → 25/mai)'", () => {
  const p = getPayrollPeriod(2026, 5);
  assert.equal(formatPayrollPeriodWithMonthName(p), "Maio/2026 (26/abr → 25/mai)");
});
