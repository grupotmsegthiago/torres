import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyClientListFilter,
  blockingDocumentClient,
  buildClientDuplicateIndex,
  clearedClientIdentity,
  clientDocumentKey,
  digitsDoc,
  isClientActive,
  otherClientsWithSameDocument,
  parseClientStatus,
} from "./client-duplicates.ts";

const LCE = [
  { id: 19, name: "LCE", cnpj: "55.426.455/0001-65", status: "ativo" },
  { id: 20, name: "LCE TRANSPORTES", cnpj: "55426455000165", status: "ativo" },
];
const TVM = [
  { id: 57, name: "TVM LOG", cnpj: "30.854.765/0001-50", status: "ativo" },
  { id: 62, name: "TVM LOGISTICA", cnpj: "30854765000150", status: "inativo" },
  { id: 64, name: "TVM", cnpj: "30.854.765/0001-50", status: "ativo" },
];
const GO_LOG = [
  { id: 63, name: "GO LOG", cnpj: "17.848.915/0001-54", status: "ativo" },
  { id: 66, name: "GO LOGISTICA", cnpj: "17848915000154", status: "ativo" },
];
const UNIQUE = { id: 1, name: "Único", cnpj: "36.982.392/0001-89", status: "ativo" };
const NO_DOC = { id: 99, name: "Sem documento", cnpj: null, cpf: null, status: "ativo" };

test("digitsDoc ignora máscara de CNPJ/CPF", () => {
  assert.equal(digitsDoc("55.426.455/0001-65"), "55426455000165");
  assert.equal(digitsDoc("123.456.789-09"), "12345678909");
  assert.equal(digitsDoc(null), "");
});

test("clientDocumentKey usa CNPJ de 14 dígitos e senão CPF de 11", () => {
  assert.equal(clientDocumentKey(LCE[0]), "cnpj:55426455000165");
  assert.equal(clientDocumentKey({ id: 2, cpf: "123.456.789-09" }), "cpf:12345678909");
  assert.equal(clientDocumentKey(NO_DOC), null);
  assert.equal(clientDocumentKey({ id: 3, cnpj: "123", cpf: "123.456.789-09" }), "cpf:12345678909");
});

test("isClientActive trata status ausente como ativo (compatível com cadastros antigos)", () => {
  assert.equal(isClientActive({}), true);
  assert.equal(isClientActive({ status: null }), true);
  assert.equal(isClientActive({ status: "ativo" }), true);
  assert.equal(isClientActive({ status: "INATIVO" }), false);
  assert.equal(isClientActive({ status: "inativo" }), false);
});

test("parseClientStatus só aceita ativo/inativo", () => {
  assert.equal(parseClientStatus("ativo"), "ativo");
  assert.equal(parseClientStatus(" Inativo "), "inativo");
  assert.equal(parseClientStatus("excluido"), null);
  assert.equal(parseClientStatus(""), null);
});

test("buildClientDuplicateIndex agrupa LCE, TVM e GO LOG por CNPJ e ignora único/sem documento", () => {
  const all = [...LCE, ...TVM, ...GO_LOG, UNIQUE, NO_DOC];
  const index = buildClientDuplicateIndex(all);

  assert.equal(index.size, 7);
  assert.equal(index.has(UNIQUE.id), false);
  assert.equal(index.has(NO_DOC.id), false);

  assert.deepEqual(index.get(19), { key: "cnpj:55426455000165", index: 1, total: 2 });
  assert.deepEqual(index.get(20), { key: "cnpj:55426455000165", index: 2, total: 2 });
  assert.deepEqual(index.get(57), { key: "cnpj:30854765000150", index: 1, total: 3 });
  assert.deepEqual(index.get(62), { key: "cnpj:30854765000150", index: 2, total: 3 });
  assert.deepEqual(index.get(64), { key: "cnpj:30854765000150", index: 3, total: 3 });
  assert.deepEqual(index.get(63), { key: "cnpj:17848915000154", index: 1, total: 2 });
  assert.deepEqual(index.get(66), { key: "cnpj:17848915000154", index: 2, total: 2 });
});

test("filtro duplicados junta o mesmo CNPJ e preserva numeração Dup n/m", () => {
  const all = [...TVM, UNIQUE, ...LCE];
  const index = buildClientDuplicateIndex(all);
  const visible = applyClientListFilter(all, "duplicados", index);
  assert.deepEqual(visible.map((c) => c.id), [57, 62, 64, 19, 20]);
  visible.forEach((c, i) => {
    assert.equal(i + 1 >= 1, true);
    assert.ok(index.get(c.id));
  });
});

test("novo cadastro é bloqueado se o CNPJ já existe, com ou sem máscara, ativo ou inativo", () => {
  const rows = [...TVM, ...GO_LOG];
  const masked = otherClientsWithSameDocument(rows, { id: 0, cnpj: "30.854.765/0001-50" });
  assert.deepEqual(masked.map((c) => c.id), [57, 62, 64]);
  assert.equal(blockingDocumentClient(masked, "create")?.id, 57);

  const inactiveOnly = otherClientsWithSameDocument(
    [{ id: 63, name: "GO LOG", cnpj: "17848915000154", status: "inativo" }],
    { id: 0, cnpj: "17.848.915/0001-54" },
  );
  assert.equal(blockingDocumentClient(inactiveOnly, "create")?.id, 63);
  assert.equal(blockingDocumentClient([], "create"), null);
});

test("reativar só bloqueia quando já existe outro CNPJ ativo", () => {
  const others = otherClientsWithSameDocument(TVM, { id: 62, cnpj: "30854765000150" }, 62);
  assert.equal(blockingDocumentClient(others, "activate")?.id, 57);
  const onlyInactive = otherClientsWithSameDocument(
    [{ id: 64, cnpj: "30.854.765/0001-50", status: "inativo" }],
    { id: 62, cnpj: "30854765000150" },
    62,
  );
  assert.equal(blockingDocumentClient(onlyInactive, "activate"), null);
});

test("patch não pode apagar nome ou documento já gravados", () => {
  const current = { name: "TVM LOG", cnpj: "30.854.765/0001-50" };
  assert.equal(clearedClientIdentity(current, { name: "  " }), "nome");
  assert.equal(clearedClientIdentity(current, { cnpj: "" }), "CNPJ/CPF");
  assert.equal(clearedClientIdentity(current, { responsavelComercialId: null }), null);
  assert.equal(clearedClientIdentity(current, { phone: "11999999999" }), null);
});

test("filtros ativos/inativos/todos", () => {
  const all = [...TVM, UNIQUE];
  const index = buildClientDuplicateIndex(all);
  assert.deepEqual(applyClientListFilter(all, "inativos", index).map((c) => c.id), [62]);
  assert.deepEqual(applyClientListFilter(all, "ativos", index).map((c) => c.id), [57, 64, 1]);
  assert.equal(applyClientListFilter(all, "todos", index).length, 4);
});
