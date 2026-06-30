import { test } from "node:test";
import assert from "node:assert/strict";
import { decideImport, rhidNumericCore, dedupPunchesByCore } from "./lib/control-id-parsers";

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

// ============================================================================
// dedupPunchesByCore — colapso de exibição (espelho/folha) da duplicata "hard"
// ============================================================================

const ids = (rows: any[]) => rows.map((r) => r.id);

test("dedupPunchesByCore: descarta a reexportação do AFD do mesmo id no mesmo dia, mantém a batida da Torres (POST)", () => {
  // mesma batida 05:00 gravada 2x: POST "14506" + AFD rhid_14506_...
  const rows = [
    { id: 1, punch_at: "2026-05-04T08:00:00.000Z", external_id: "14506" },            // 05:00 BRT (POST)
    { id: 2, punch_at: "2026-05-04T08:00:00.000Z", external_id: "rhid_14506_1777881600000" }, // 05:00 BRT (AFD)
  ];
  const out = dedupPunchesByCore(rows);
  assert.deepEqual(ids(out), [1], "mantém só a batida da Torres (puro-numérica)");
});

test("dedupPunchesByCore: pega a duplicata 'drift' (AFD encaixado noutro minuto do MESMO dia)", () => {
  // core 14184: POST 00:01 BRT vs AFD 12:15 BRT — minuto diferente, dedup por minuto falharia.
  const rows = [
    { id: 10, punch_at: "2026-05-12T03:01:00.000Z", external_id: "14184" },           // 00:01 BRT
    { id: 11, punch_at: "2026-05-12T15:15:00.000Z", external_id: "rhid_14184_1778598900000" }, // 12:15 BRT
  ];
  const out = dedupPunchesByCore(rows);
  assert.deepEqual(ids(out), [10], "mantém o horário digitado da Torres e descarta o fantasma do AFD");
});

test("dedupPunchesByCore: NÃO toca grupos só-AFD (core pode ser personId compartilhado)", () => {
  // sem batida puro-numérica → nada a colapsar (evita apagar batida real distinta).
  const rows = [
    { id: 20, punch_at: "2026-05-04T08:00:00.000Z", external_id: "rhid_999_1" },
    { id: 21, punch_at: "2026-05-04T20:00:00.000Z", external_id: "rhid_999_2" },
  ];
  const out = dedupPunchesByCore(rows);
  assert.deepEqual(ids(out), [20, 21], "grupos só-AFD permanecem intactos");
});

test("dedupPunchesByCore: reexportação em OUTRO dia NÃO é descartada (segurança contra colisão de personId)", () => {
  const rows = [
    { id: 30, punch_at: "2026-05-04T08:00:00.000Z", external_id: "14506" },            // 05/04
    { id: 31, punch_at: "2026-05-09T08:00:00.000Z", external_id: "rhid_14506_999" },   // 09/05 (dia diferente)
  ];
  const out = dedupPunchesByCore(rows);
  assert.deepEqual(ids(out), [30, 31], "só colapsa quando é o mesmo dia BRT");
});

test("dedupPunchesByCore: dados limpos (sem duplicata) = no-op, não altera nada", () => {
  const rows = [
    { id: 40, punch_at: "2026-05-04T08:00:00.000Z", external_id: "14506" },
    { id: 41, punch_at: "2026-05-04T16:20:00.000Z", external_id: "14507" },
    { id: 42, punch_at: "2026-05-05T08:00:00.000Z", external_id: "rhid_14600_1" },
  ];
  const out = dedupPunchesByCore(rows);
  assert.deepEqual(ids(out), [40, 41, 42]);
});

test("dedupPunchesByCore: múltiplos rhid_{mesmoCore} no mesmo dia + 1 puro-numérico → todas as reexportações somem (comportamento da duplicata 'hard')", () => {
  // Trava do comportamento esperado p/ o caso real: a RHID reexporta a MESMA
  // batida várias vezes no mesmo dia (rhid_14506_t1, _t2). Existindo a canônica
  // puro-numérica "14506", todas as cópias rhid_14506_* daquele dia são descartadas.
  // (As batidas REAIS distintas têm cores numéricos próprios — não colidem aqui.)
  const rows = [
    { id: 60, punch_at: "2026-05-04T08:00:00.000Z", external_id: "14506" },          // canônica (POST)
    { id: 61, punch_at: "2026-05-04T08:00:00.000Z", external_id: "rhid_14506_1" },   // reexportação 1
    { id: 62, punch_at: "2026-05-04T11:00:00.000Z", external_id: "rhid_14506_2" },   // reexportação 2 (mesmo dia)
    { id: 63, punch_at: "2026-05-04T20:00:00.000Z", external_id: "14507" },          // OUTRA batida real (core próprio)
  ];
  const out = dedupPunchesByCore(rows);
  assert.deepEqual(ids(out), [60, 63], "mantém a canônica e a outra batida real; some toda reexportação do core 14506 no dia");
});

test("dedupPunchesByCore: external_id null/legado é preservado", () => {
  const rows = [
    { id: 50, punch_at: "2026-05-04T08:00:00.000Z", external_id: null },
    { id: 51, punch_at: "2026-05-04T08:00:00.000Z", external_id: "14506" },
    { id: 52, punch_at: "2026-05-04T08:00:00.000Z", external_id: "rhid_14506_1" },
  ];
  const out = dedupPunchesByCore(rows);
  assert.deepEqual(ids(out), [50, 51], "mantém legado + canônica, descarta só a reexportação");
});
