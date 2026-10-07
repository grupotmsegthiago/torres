import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMultilogToDescription,
  isMultilogClient,
  missingMultilogRefs,
  multilogDiscriminacaoLines,
  multilogLinesFromDescription,
  multilogRefsForOrder,
} from "./multilog-refs";

test("MULTILOG: OS e SM no formato do cliente", () => {
  assert.equal(isMultilogClient("MULTILOG BRASIL S.A"), true);
  assert.equal(isMultilogClient("TVM LOG"), false);
  const lines = multilogDiscriminacaoLines([
    { os: "1312", sm: "41128477" },
    { os: "OS. 1400", sm: "" },
  ]);
  assert.deepEqual(lines, ["OS. 1312", "SM. 41128477", "OS. 1400"]);
  const desc = appendMultilogToDescription("Referente aos serviços de Escolta Armada - Período: 16/09/2026 a 30/09/2026", lines);
  assert.deepEqual(multilogLinesFromDescription(desc), lines);
});

test("MULTILOG: referências obrigatórias vêm exclusivamente da OS", () => {
  assert.deepEqual(
    multilogRefsForOrder({ id: 1312, multilog_os: "OS. 1312", multilog_sm: "SM. 41128477" }),
    { os: "1312", sm: "41128477" },
  );
  assert.deepEqual(missingMultilogRefs({ id: 1312, multilog_os: null, multilog_sm: "" }), ["OS", "SM"]);
  assert.deepEqual(missingMultilogRefs({ id: 1312, multilog_os: "1312", multilog_sm: "" }), ["SM"]);
  assert.deepEqual(missingMultilogRefs({ id: 1312, multilog_os: "1312", multilog_sm: "41128477" }), []);
});
