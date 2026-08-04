import { test } from "node:test";
import assert from "node:assert/strict";

// Espelha a lógica de client/src/lib/fuel-cycles.ts (getCycleForYmd / buildCycle)
function pad(n: number) { return String(n).padStart(2, "0"); }
function buildCycle(closingYear: number, closingMonth: number) {
  const startMonth = closingMonth === 1 ? 12 : closingMonth - 1;
  const startYear = closingMonth === 1 ? closingYear - 1 : closingYear;
  return {
    value: `${closingYear}-${pad(closingMonth)}`,
    startDate: `${startYear}-${pad(startMonth)}-16`,
    endDate: `${closingYear}-${pad(closingMonth)}-15`,
  };
}
function getCycleForYmd(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  assert.ok(m);
  const y = Number(m![1]);
  const mo = Number(m![2]);
  const d = Number(m![3]);
  if (d >= 16) {
    const closingMonth = mo === 12 ? 1 : mo + 1;
    const closingYear = mo === 12 ? y + 1 : y;
    return buildCycle(closingYear, closingMonth);
  }
  return buildCycle(y, mo);
}

test("ciclo: dia 15 fica no ciclo que fecha nesse mês", () => {
  const c = getCycleForYmd("2026-08-15");
  assert.equal(c.value, "2026-08");
  assert.equal(c.startDate, "2026-07-16");
  assert.equal(c.endDate, "2026-08-15");
});

test("ciclo: dia 16 abre o ciclo seguinte", () => {
  const c = getCycleForYmd("2026-08-16");
  assert.equal(c.value, "2026-09");
  assert.equal(c.startDate, "2026-08-16");
  assert.equal(c.endDate, "2026-09-15");
});

test("ciclo atual BRT: 15/08 22h BRT (=16/08 01h UTC) NÃO pode pular de ciclo", () => {
  // Simula o bug: getDate() em UTC no processo retorna 16, mas o dia BRT ainda é 15.
  const utcInstant = new Date("2026-08-16T01:00:00Z");
  const wrongLocal = {
    y: utcInstant.getUTCFullYear(),
    m: utcInstant.getUTCMonth() + 1,
    d: utcInstant.getUTCDate(),
  };
  assert.equal(wrongLocal.d, 16, "precondição: em UTC o dia já é 16");
  const wrongCycle = getCycleForYmd(`${wrongLocal.y}-${pad(wrongLocal.m)}-${pad(wrongLocal.d)}`);
  assert.equal(wrongCycle.value, "2026-09");

  const brtYmd = utcInstant.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  assert.equal(brtYmd, "2026-08-15");
  const rightCycle = getCycleForYmd(brtYmd);
  assert.equal(rightCycle.value, "2026-08");
});
