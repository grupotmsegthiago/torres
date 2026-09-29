/**
 * Guarda: operações financeiras/operacionais nunca usam cadastro inativo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_INACTIVE_BLOCK_MSG,
  isClientActive,
  pickActiveClient,
} from "../../shared/client-duplicates.ts";

test("CLIENT_INACTIVE_BLOCK_MSG é explícita", () => {
  assert.match(CLIENT_INACTIVE_BLOCK_MSG, /inativo/i);
  assert.match(CLIENT_INACTIVE_BLOCK_MSG, /ativo/i);
});

test("emit/gerar-fatura: clientId inativo deve ser rejeitado antes de Asaas", () => {
  const inactive = { id: 63, status: "inativo", name: "GO LOG" };
  const active = { id: 66, status: "ativo", name: "GO LOG" };
  assert.equal(isClientActive(inactive), false);
  assert.equal(isClientActive(active), true);
  // Simula o early-return de gerar-fatura / emitInvoiceAuto
  const gate = (row: { status?: string | null } | null) => {
    if (!row) return { ok: false, message: "Cliente não encontrado" };
    if (!isClientActive(row)) return { ok: false, message: CLIENT_INACTIVE_BLOCK_MSG };
    return { ok: true, message: null };
  };
  assert.deepEqual(gate(inactive), { ok: false, message: CLIENT_INACTIVE_BLOCK_MSG });
  assert.deepEqual(gate(active), { ok: true, message: null });
});

test("lookup por nome: só ativo — fallback inativo é proibido", () => {
  const onlyInactive = [{ id: 63, name: "GO LOG", status: "inativo" }];
  const mixed = [
    { id: 63, name: "GO LOG", status: "inativo" },
    { id: 66, name: "GO LOG", status: "ativo" },
  ];
  assert.equal(pickActiveClient(onlyInactive), null);
  assert.equal(pickActiveClient(mixed)?.id, 66);
});
