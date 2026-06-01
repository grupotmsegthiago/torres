import { test } from "node:test";
import assert from "node:assert/strict";
import { decideImport } from "./lib/control-id-parsers";

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
