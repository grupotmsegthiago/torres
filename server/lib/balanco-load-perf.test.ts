/**
 * Regressão de performance do Balanço: preload de batidas e ausência de
 * force=1 automático no frontend (cache SWR deve valer).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFolhaPonto } from "../control-id";
import { payrollWindowFromMesRef } from "./employee-monthly-cost";

test("buildFolhaPonto: punchesPreloaded=[] não consulta banco e devolve []", async () => {
  const dias = await buildFolhaPonto(999001, "2026-09", {
    horasMensais: 220,
    punchesPreloaded: [],
  });
  assert.deepEqual(dias, []);
});

test("payrollWindowFromMesRef: set/2026 = 26/08 → 25/09 (janela do bulk)", () => {
  const w = payrollWindowFromMesRef("2026-09");
  assert.equal(w.from, "2026-08-26");
  assert.equal(w.to, "2026-09-25");
});

test("balanco-gerencial: não força force=1 automático no rh-summary", () => {
  const src = readFileSync(
    join(process.cwd(), "client/src/pages/admin/balanco-gerencial.tsx"),
    "utf8",
  );
  assert.equal(
    /rh-summary-v\d+-forced/.test(src),
    false,
    "sessionStorage force bust do RH deve ter sido removido",
  );
  assert.match(
    src,
    /rh-summary\?cached=1&from=\$\{gridRange\.from\}/,
    "query RH deve usar só cached=1 (force só no botão Atualizar)",
  );
  assert.match(
    src,
    /queryKey: \["\/api\/fixed-costs\/rh-summary", "v16"/,
    "refetch/invalidate devem alinhar com v16",
  );
});

test("resolveHorasExtrasNoturnasBulk: código faz preload paginado de batidas", () => {
  const src = readFileSync(
    join(process.cwd(), "server/lib/employee-monthly-cost.ts"),
    "utf8",
  );
  assert.match(src, /fetchAllSupabaseRows/);
  assert.match(src, /punchesPreloaded/);
  assert.match(src, /preloadOk/);
  assert.match(src, /control_id_punches/);
});
