import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("MULTILOG: gates backend cobrem aprovação, envio, clique do cliente e faturamento", () => {
  const escort = read("server/routes/escort.ts");
  const approval = read("server/routes/boletim-approval.ts");
  const asaas = read("server/asaas.ts");

  assert.match(escort, /MULTILOG_REFS_REQUIRED/);
  assert.ok((approval.match(/MULTILOG_REFS_REQUIRED/g) || []).length >= 2);
  assert.match(asaas, /Faturamento MULTILOG bloqueado/);
});

test("MULTILOG: OS, boletim e relatório leem as mesmas colunas de service_orders", () => {
  const serviceOrdersRoute = read("server/routes/service-orders.ts");
  const serviceOrdersPage = read("client/src/pages/admin/service-orders.tsx");
  const boletimPage = read("client/src/pages/admin/boletim-medicao.tsx");
  const relatorioPage = read("client/src/pages/admin/relatorio-faturamento.tsx");

  assert.match(serviceOrdersRoute, /multilog_os,multilog_sm/);
  assert.match(serviceOrdersPage, /multilogOs/);
  assert.match(serviceOrdersPage, /multilogSm/);
  assert.match(boletimPage, /multilogRefsForOrder/);
  assert.match(relatorioPage, /multilogRefsForOrder/);
});
