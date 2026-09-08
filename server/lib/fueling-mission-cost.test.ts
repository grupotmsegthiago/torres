import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { collectLinkedFuelingIds, fuelingTagMatchPattern } from "./fueling-mission-cost.ts";

const root = path.resolve(import.meta.dirname, "../..");

describe("fueling mission_cost tag", () => {
  it("extracts [F#id] from descriptions", () => {
    const ids = collectLinkedFuelingIds([
      { description: "Abastecimento UER7D08 - etanol 44.58L (Faro shell) [F#859]" },
      "outro [F#856] e [F#859]",
      { description: "sem tag" },
      null,
    ]);
    assert.deepEqual([...ids].sort((a, b) => a - b), [856, 859]);
  });

  it("monta regex de candidatos sem ILIKE com #", () => {
    assert.equal(fuelingTagMatchPattern([]), null);
    assert.equal(fuelingTagMatchPattern([859, 856, 859]), "\\[F#(859|856)\\]");
  });

  it("sync de boot pagina e filtra por candidatos, não um ilike único", () => {
    const routes = readFileSync(path.join(root, "server/routes.ts"), "utf8");
    const start = routes.indexOf("async function syncFuelingMissionCosts");
    assert.ok(start >= 0);
    const block = routes.slice(start, routes.indexOf("setTimeout(() => {", start));
    assert.match(block, /fetchAllSupabaseRows/);
    assert.match(block, /fuelingTagMatchPattern/);
    assert.match(block, /collectLinkedFuelingIds/);
    assert.doesNotMatch(block, /\.ilike\("description"/);
  });

  it("boot cria índice único por tag [F#id]", () => {
    const init = readFileSync(path.join(root, "server/db-init.ts"), "utf8");
    assert.match(init, /idx_mc_fueling_tag_unique/);
  });
});
