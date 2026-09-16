import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import {
  actorComercialUuid,
  applyComercialCreateClientPayload,
  applyComercialPatchClientPayload,
  clientIdAllowed,
  clientInComercialScope,
  createComercialOsScopeMiddleware,
  filterClientsForComercial,
  filterComerciaisForUser,
  filterRowsByAllowedClientIds,
  isComercialScoped,
  resolveAllowedClientIds,
} from "./comercial-scope";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const COMERCIAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMERCIAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("isComercialScoped", () => {
  it("só aplica ao role comercial", () => {
    assert.equal(isComercialScoped({ role: "comercial" }), true);
    assert.equal(isComercialScoped({ role: "admin" }), false);
    assert.equal(isComercialScoped({ role: "diretoria" }), false);
    assert.equal(isComercialScoped({ role: "financeiro" }), false);
    assert.equal(isComercialScoped({ role: "funcionario" }), false);
    assert.equal(isComercialScoped(null), false);
  });
});

describe("clientInComercialScope", () => {
  const user = { id: 7, role: "comercial", comercialId: COMERCIAL_A };

  it("libera pelo UUID vinculado", () => {
    assert.equal(
      clientInComercialScope({ id: 1, responsavel_comercial_id: COMERCIAL_A }, user),
      true,
    );
  });

  it("libera pelo cadastro próprio mesmo com outro comercial", () => {
    assert.equal(
      clientInComercialScope(
        { id: 2, created_by_user_id: 7, responsavel_comercial_id: COMERCIAL_B },
        user,
      ),
      true,
    );
  });

  it("oculta cliente de outro comercial que ele não cadastrou", () => {
    assert.equal(
      clientInComercialScope(
        { id: 3, created_by_user_id: 99, responsavel_comercial_id: COMERCIAL_B },
        user,
      ),
      false,
    );
  });

  it("oculta cliente sem vínculo e sem created_by", () => {
    assert.equal(clientInComercialScope({ id: 4 }, user), false);
  });

  it("UUID inválido no user não libera por vínculo", () => {
    assert.equal(
      clientInComercialScope(
        { id: 5, responsavel_comercial_id: COMERCIAL_A },
        { id: 7, role: "comercial", comercialId: "nao-uuid" },
      ),
      false,
    );
  });
});

describe("filterClientsForComercial", () => {
  const rows = [
    { id: 1, responsavel_comercial_id: COMERCIAL_A },
    { id: 2, created_by_user_id: 7 },
    { id: 3, responsavel_comercial_id: COMERCIAL_B },
  ];

  it("admin vê todos", () => {
    assert.equal(filterClientsForComercial(rows, { id: 1, role: "admin" }).length, 3);
  });

  it("comercial vê só os seus", () => {
    const out = filterClientsForComercial(rows, {
      id: 7,
      role: "comercial",
      comercialId: COMERCIAL_A,
    });
    assert.deepEqual(out.map((r) => r.id), [1, 2]);
  });
});

describe("filterRowsByAllowedClientIds", () => {
  const rows = [
    { client_id: 1 },
    { client_id: 2 },
    { client_id: null },
  ];

  it("null allowed = sem filtro", () => {
    assert.equal(filterRowsByAllowedClientIds(rows, (r) => r.client_id, null).length, 3);
  });

  it("fail-closed: lista vazia oculta tudo", () => {
    assert.deepEqual(filterRowsByAllowedClientIds(rows, (r) => r.client_id, []), []);
  });

  it("allowNullClient preserva tabela compartilhada", () => {
    const out = filterRowsByAllowedClientIds(rows, (r) => r.client_id, [1], {
      allowNullClient: true,
    });
    assert.deepEqual(out.map((r) => r.client_id), [1, null]);
  });
});

describe("filterComerciaisForUser", () => {
  const list = [{ id: COMERCIAL_A, nome: "A" }, { id: COMERCIAL_B, nome: "B" }];

  it("comercial só vê o próprio UUID", () => {
    const out = filterComerciaisForUser(list, { role: "comercial", comercialId: COMERCIAL_A });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, COMERCIAL_A);
  });

  it("comercial sem UUID não vê lista (não escolhe outro)", () => {
    assert.deepEqual(filterComerciaisForUser(list, { role: "comercial" }), []);
  });
});

describe("resolveAllowedClientIds", () => {
  it("não comercial retorna null (irrestrito)", async () => {
    const ids = await resolveAllowedClientIds({ id: 1, role: "financeiro" }, async () => {
      throw new Error("não deve buscar");
    });
    assert.equal(ids, null);
  });

  it("comercial sem matches retorna [] (fail-closed)", async () => {
    const ids = await resolveAllowedClientIds(
      { id: 7, role: "comercial", comercialId: COMERCIAL_A },
      async () => [],
    );
    assert.deepEqual(ids, []);
  });

  it("comercial recebe ids únicos", async () => {
    const ids = await resolveAllowedClientIds(
      { id: 7, role: "comercial", comercialId: COMERCIAL_A },
      async () => [1, 1, 2],
    );
    assert.deepEqual(ids?.sort(), [1, 2]);
  });
});

describe("clientIdAllowed", () => {
  it("irrestrito aceita qualquer id válido", () => {
    assert.equal(clientIdAllowed(99, null), true);
  });

  it("escopo vazio nega", () => {
    assert.equal(clientIdAllowed(1, []), false);
  });
});

describe("payload create/patch comercial", () => {
  it("força created_by e UUID do comercial no create", () => {
    const out = applyComercialCreateClientPayload(
      { id: 7, role: "comercial", comercialId: COMERCIAL_A },
      { name: "X", responsavelComercialId: COMERCIAL_B, createdByUserId: 99 },
    );
    assert.equal(out.createdByUserId, 7);
    assert.equal(out.responsavelComercialId, COMERCIAL_A);
  });

  it("admin no create grava created_by mas não força comercial", () => {
    const out = applyComercialCreateClientPayload(
      { id: 1, role: "admin" },
      { name: "X", responsavelComercialId: COMERCIAL_B },
    );
    assert.equal(out.createdByUserId, 1);
    assert.equal(out.responsavelComercialId, COMERCIAL_B);
  });

  it("comercial no patch não transfere o vínculo", () => {
    const out = applyComercialPatchClientPayload(
      { id: 7, role: "comercial", comercialId: COMERCIAL_A },
      { responsavelComercialId: COMERCIAL_B, createdByUserId: 99 },
    );
    assert.equal(out.responsavelComercialId, COMERCIAL_A);
    assert.equal(out.createdByUserId, undefined);
  });
});

describe("parseOptionalComercialUuid / contratos de rota", () => {
  it("parseOptionalComercialUuid trata vazio, inválido e UUID", async () => {
    const { parseOptionalComercialUuid } = await import("./comercial-scope");
    assert.deepEqual(parseOptionalComercialUuid(undefined), { present: false });
    assert.deepEqual(parseOptionalComercialUuid(""), { present: true, value: null });
    assert.equal("error" in parseOptionalComercialUuid("abc"), true);
    const ok = parseOptionalComercialUuid(COMERCIAL_A);
    assert.equal(ok.present, true);
    if (ok.present && !("error" in ok)) assert.equal(ok.value, COMERCIAL_A);
  });

  it("rotas de cliente, OS e escort aplicam o escopo", () => {
    const clients = readFileSync(path.join(root, "server/routes/clients.ts"), "utf8");
    const so = readFileSync(path.join(root, "server/routes/service-orders.ts"), "utf8");
    const escort = readFileSync(path.join(root, "server/routes/escort.ts"), "utf8");
    assert.match(clients, /allowedClientIdsFromRequest/);
    assert.match(clients, /denyIfComercialClientOutOfScope/);
    assert.match(so, /createComercialOsScopeMiddleware/);
    assert.match(so, /allowedClientIdsFromRequest/);
    assert.match(escort, /allowedClientIdsFromRequest/);
  });
});

describe("createComercialOsScopeMiddleware", () => {
  function mockRes() {
    const res: Partial<Response> & { statusCode?: number; body?: any } = {};
    res.status = ((code: number) => {
      res.statusCode = code;
      return res as Response;
    }) as Response["status"];
    res.json = ((body: any) => {
      res.body = body;
      return res as Response;
    }) as Response["json"];
    return res as Response & { statusCode?: number; body?: any };
  }

  it("funcionário passa sem carregar OS", async () => {
    let loaded = false;
    const mw = createComercialOsScopeMiddleware(async () => {
      loaded = true;
      return { clientId: 1 };
    });
    let nextCalled = false;
    await mw(
      { user: { id: 2, role: "funcionario" }, params: { id: "9" } } as unknown as Request,
      mockRes(),
      () => {
        nextCalled = true;
      },
    );
    assert.equal(loaded, false);
    assert.equal(nextCalled, true);
  });

  it("comercial fora do escopo recebe 404", async () => {
    const mw = createComercialOsScopeMiddleware(async () => ({ clientId: 99 }));
    const res = mockRes();
    let nextCalled = false;
    await mw(
      {
        user: { id: 7, role: "comercial", comercialId: COMERCIAL_A },
        params: { id: "3" },
        _comercialAllowedClientIds: [1],
      } as unknown as Request,
      res,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(res.statusCode, 404);
    assert.equal(nextCalled, false);
  });
});
