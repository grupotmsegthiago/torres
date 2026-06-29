import { test } from "node:test";
import assert from "node:assert/strict";
import { decideImport, rhidNumericCore } from "./lib/control-id-parsers";

test("decideImport: external_id já existe localmente → skip (idempotência)", () => {
  assert.equal(
    decideImport({ externalIdExists: true, localExternalIdAtMinute: undefined, eventExternalId: "rhid_5_99" }),
    "skip",
  );
});

test("decideImport: sem batida local no minuto → insert (batida nova de verdade)", () => {
  assert.equal(
    decideImport({ externalIdExists: false, localExternalIdAtMinute: undefined, eventExternalId: "rhid_5_99" }),
    "insert",
  );
});

test("decideImport: batida local no minuto com external_id divergente (numérico × rhid_*) → adopt-external-id", () => {
  // Causa histórica de duplicata: POST devolveu id numérico "12345", AFD reexporta "rhid_12345_170...".
  assert.equal(
    decideImport({ externalIdExists: false, localExternalIdAtMinute: "12345", eventExternalId: "rhid_12345_170" }),
    "adopt-external-id",
  );
});

test("decideImport: batida local no minuto SEM external_id (legado null) → adopt-external-id", () => {
  assert.equal(
    decideImport({ externalIdExists: false, localExternalIdAtMinute: null, eventExternalId: "rhid_7_1" }),
    "adopt-external-id",
  );
});

test("decideImport: batida local no minuto já com o id canônico → skip (nada a fazer)", () => {
  assert.equal(
    decideImport({ externalIdExists: false, localExternalIdAtMinute: "rhid_9_3", eventExternalId: "rhid_9_3" }),
    "skip",
  );
});

test("decideImport: nunca insere duplicata quando há batida local no mesmo minuto", () => {
  // Qualquer combinação com batida local presente NÃO deve retornar 'insert'.
  for (const localExt of [null, "123", "rhid_1_1", "outro"]) {
    const d = decideImport({ externalIdExists: false, localExternalIdAtMinute: localExt, eventExternalId: "rhid_1_1" });
    assert.notEqual(d, "insert", `não pode inserir duplicata (local=${localExt})`);
  }
});

// ============================================================================
// rhidNumericCore — dedup por ID numérico da RHID (Torres → Control iD)
// ============================================================================

test("rhidNumericCore: extrai id do formato canônico do AFD rhid_{id}_{ts}", () => {
  assert.equal(rhidNumericCore("rhid_15215_1782385200000"), "15215");
  assert.equal(rhidNumericCore("rhid_7_1"), "7");
});

test("rhidNumericCore: external_id puro do POST (numérico) volta ele mesmo", () => {
  assert.equal(rhidNumericCore("15215"), "15215");
  assert.equal(rhidNumericCore("  15215  "), "15215");
});

test("rhidNumericCore: formatos sem id numérico reconhecível → null (legado)", () => {
  assert.equal(rhidNumericCore(null), null);
  assert.equal(rhidNumericCore(undefined), null);
  assert.equal(rhidNumericCore(""), null);
  assert.equal(rhidNumericCore("manual-abc"), null);
  assert.equal(rhidNumericCore("u9-1700000000"), null); // id sintético do normalizeEvent
  assert.equal(rhidNumericCore("rhid_abc_123"), null);
});

test("dedup por id: batida manual (external_id numérico) casa com o AFD reexportado, mesmo em minuto diferente", () => {
  // Cenário André: POST cria batida 00:00 com external_id "15215".
  // A RHID "encaixa" na escala e o AFD reexporta como rhid_15215_... às 08:00.
  // O dedup por MINUTO falharia (minutos diferentes), mas o id numérico é o mesmo,
  // então reconhecemos a mesma batida e NÃO duplicamos.
  const manualExternalId = "15215";
  const afdEventId = "rhid_15215_1782385200000";
  assert.equal(
    rhidNumericCore(manualExternalId),
    rhidNumericCore(afdEventId),
    "manual e AFD devem compartilhar o mesmo id numérico (mesma batida)",
  );
});

test("dedup por id: batidas de funcionários diferentes NÃO colidem (ids distintos)", () => {
  assert.notEqual(rhidNumericCore("rhid_15215_1"), rhidNumericCore("rhid_15216_1"));
});
