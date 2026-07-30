import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseRequiredManualDirection,
  resolveAfdRecordDirection,
  buildExternalIdAdoptionPatch,
  adoptionPatchPreservesDirection,
  isRhidDirectionNormalizeEnabled,
  RHID_AFD_DIRECTION_FIELD_CANDIDATES,
  RHID_AFD_REJECTED_DIRECTION_FIELDS,
} from "./punch-direction";
import { parseRhidAfdRecords } from "./control-id-parsers";
import {
  resetDirectionMetrics,
  getDirectionMetrics,
  recordManualDirectionRejected,
  recordPunchDirectionIngest,
} from "./punch-direction-metrics";

describe("parseRequiredManualDirection", () => {
  it("aceita in e out", () => {
    assert.deepEqual(parseRequiredManualDirection("in"), { ok: true, direction: "in" });
    assert.deepEqual(parseRequiredManualDirection("OUT"), { ok: true, direction: "out" });
    assert.deepEqual(parseRequiredManualDirection(" in "), { ok: true, direction: "in" });
  });

  it("rejeita omitido, null, vazio, unknown e inválido", () => {
    for (const raw of [undefined, null, "", "   ", "unknown", "UNKNOWN", "foo", 1, {}]) {
      const r = parseRequiredManualDirection(raw as any);
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.error, /direction/i);
    }
  });
});

describe("adoption patch", () => {
  it("só altera external_id e preserva direction", () => {
    const patch = buildExternalIdAdoptionPatch("rhid_99_1");
    assert.deepEqual(patch, { external_id: "rhid_99_1" });
    assert.equal(adoptionPatchPreservesDirection(patch), true);
    assert.equal(adoptionPatchPreservesDirection({ external_id: "x", direction: "unknown" }), false);
  });
});

describe("resolveAfdRecordDirection — sem heurística inventada", () => {
  it("flag OFF → unknown + afd_no_direction_field (não lê campos)", () => {
    const r = resolveAfdRecordDirection(
      { direction: "in", flow: "entrada", tipo: 1 },
      { normalizeEnabled: false, fieldCandidates: ["direction"] },
    );
    assert.equal(r.direction, "unknown");
    assert.equal(r.missingReason, "afd_no_direction_field");
    assert.equal(r.matchedField, null);
  });

  it("flag ON mas candidatos vazios → unknown + afd_no_direction_field", () => {
    assert.equal(RHID_AFD_DIRECTION_FIELD_CANDIDATES.length, 0);
    assert.ok(RHID_AFD_REJECTED_DIRECTION_FIELDS.includes("Tipo"));
    const r = resolveAfdRecordDirection(
      { direction: "in" },
      { normalizeEnabled: true, fieldCandidates: [] },
    );
    assert.equal(r.direction, "unknown");
    assert.equal(r.missingReason, "afd_no_direction_field");
  });

  it("Tipo=3 no payload NÃO vira direction (mesmo com flag ON e candidato Tipo)", () => {
    // Evidência Parte B: Tipo=3 aparece em in, out e unknown — não é entrada/saída.
    const r = resolveAfdRecordDirection(
      { Tipo: 3 },
      { normalizeEnabled: true, fieldCandidates: ["Tipo"] },
    );
    assert.equal(r.direction, "unknown");
    assert.equal(r.missingReason, "unrecognized_direction_value");
  });

  it("flag ON + candidato documentado + alias → mapeia", () => {
    const r = resolveAfdRecordDirection(
      { customDir: "entrada" },
      { normalizeEnabled: true, fieldCandidates: ["customDir"] },
    );
    assert.equal(r.direction, "in");
    assert.equal(r.missingReason, null);
    assert.equal(r.matchedField, "customDir");
  });

  it("flag ON + valor não reconhecido → unknown + unrecognized", () => {
    const r = resolveAfdRecordDirection(
      { customDir: "xyz" },
      { normalizeEnabled: true, fieldCandidates: ["customDir"] },
    );
    assert.equal(r.direction, "unknown");
    assert.equal(r.missingReason, "unrecognized_direction_value");
  });
});

describe("parseRhidAfdRecords integração Correção 1", () => {
  it("mantém unknown e preenche directionMissingReason sem mutar raw", () => {
    const ts = Date.now() - 60_000;
    const rec = {
      id: "p1",
      dateTime: "/Date(" + ts + ")/",
      idPerson: "42",
      personName: "Anon",
      faceScore: 99,
      // campo hipotético — NÃO deve ser mapeado com flag default OFF / candidatos vazios
      direction: "in",
    };
    const events = parseRhidAfdRecords([rec], new Date(ts - 3600_000));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.direction, "unknown");
    assert.equal(events[0]!.directionMissingReason, "afd_no_direction_field");
    assert.equal(events[0]!.raw, rec);
    assert.equal((events[0]!.raw as any).direction, "in");
  });
});

describe("feature flag", () => {
  it("default desligada", () => {
    assert.equal(isRhidDirectionNormalizeEnabled({} as any), false);
    assert.equal(isRhidDirectionNormalizeEnabled({ RHID_DIRECTION_NORMALIZE: "true" } as any), true);
  });
});

describe("métricas", () => {
  it("conta rejected manual e ingest", () => {
    resetDirectionMetrics();
    recordManualDirectionRejected("test reject");
    recordPunchDirectionIngest({ direction: "in", origin: "admin_manual", deviceId: 1 });
    recordPunchDirectionIngest({
      direction: "unknown",
      origin: "afd_sync",
      deviceId: 1,
      missingReason: "afd_no_direction_field",
    });
    const m = getDirectionMetrics();
    assert.equal(m.manualRejectedUnknown, 1);
    assert.equal(m.in, 1);
    assert.equal(m.unknown, 1);
    assert.equal(m.unknownMissingField, 1);
    assert.equal(m.alerts[0]?.code, "manual_unknown_rejected");
  });
});
