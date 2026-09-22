import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPatrimonialProposalPdf } from "./patrimonial-proposal-pdf.ts";

test("pdf da proposta leva o preço do cliente e não a margem interna", () => {
  const doc = buildPatrimonialProposalPdf({
    clientName: "VELOGIC LOGISTICA LTDA",
    city: "Cajamar",
    uf: "SP",
    total: 11250.72,
    lines: [{ funcao: "Vigilante diurno", escala: "6 x 1", postos: 1, total: 11250.72 }],
  });
  const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  assert.match(raw, /VELOGIC LOGISTICA LTDA/);
  assert.match(raw, /Vigilante diurno/);
  assert.match(raw, /11\.250,72/);
  assert.doesNotMatch(raw, /margem/i);
  assert.doesNotMatch(raw, /diretoria/i);
});
