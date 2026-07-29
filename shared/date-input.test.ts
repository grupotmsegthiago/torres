import { test } from "node:test";
import assert from "node:assert/strict";

/** Espelha a regra do form de funcionários (toDateInput). */
function toDateInput(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

test("toDateInput: ISO da API vira YYYY-MM-DD válido pro input date", () => {
  assert.equal(toDateInput("1980-01-15T00:00:00.000Z"), "1980-01-15");
  assert.equal(toDateInput("1980-01-15T03:00:00.000Z"), "1980-01-15");
  assert.equal(toDateInput("1980-01-15"), "1980-01-15");
  assert.equal(toDateInput(""), "");
  assert.equal(toDateInput(null), "");
  assert.equal(toDateInput(undefined), "");
});
