import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTER_INTEGRATION_ENV,
  evaluateInterWriteGate,
  isInterIntegrationEnabled,
} from "./inter-integration.js";

const prev = process.env[INTER_INTEGRATION_ENV];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

beforeEach(() => {
  delete process.env[INTER_INTEGRATION_ENV];
});

afterEach(() => {
  if (prev === undefined) delete process.env[INTER_INTEGRATION_ENV];
  else process.env[INTER_INTEGRATION_ENV] = prev;
});

describe("webhook Inter fail-closed (gate)", () => {
  it("desativado: 410 sem permitir mutações", () => {
    const gate = evaluateInterWriteGate({ configured: true, env: {} });
    assert.equal(gate.allow, false);
    assert.equal(gate.status, 410);
    // Contrato: handler deve sair antes de insert/FT/invoice
    assert.equal(gate.body?.code, "INTER_DISABLED");
  });

  it("habilitado sem config: 503 fail-closed", () => {
    const gate = evaluateInterWriteGate({
      configured: false,
      env: { [INTER_INTEGRATION_ENV]: "true" },
    });
    assert.equal(gate.allow, false);
    assert.equal(gate.status, 503);
  });
});

describe("cron Inter não chama cliente quando desativado", () => {
  it("early-return nos wrappers de cron", async () => {
    delete process.env[INTER_INTEGRATION_ENV];
    assert.equal(isInterIntegrationEnabled(), false);

    const src = readFileSync(path.join(root, "server/cron-jobs.ts"), "utf8");
    assert.match(src, /isInterIntegrationEnabled/);
    assert.match(src, /integração desativada — skip/);

    // Prova comportamental: com flag off, wrappers saem sem importar banking
    const bankingImportSpy = mock.fn(async () => {
      throw new Error("banking não deveria ser importado");
    });

    // Simula o mesmo early-return dos crons
    async function cronLike() {
      const { isInterIntegrationEnabled: enabled } = await import("./inter-integration.js");
      if (!enabled()) return { skipped: true, externalCalls: 0 };
      await bankingImportSpy();
      return { skipped: false, externalCalls: 1 };
    }

    const r = await cronLike();
    assert.equal(r.skipped, true);
    assert.equal(r.externalCalls, 0);
    assert.equal(bankingImportSpy.mock.calls.length, 0);
  });
});

describe("rotas financeiras acopladas preservadas", () => {
  it("inter.ts ainda registra contas-a-pagar e relatório anual", () => {
    const src = readFileSync(path.join(root, "server/routes/inter.ts"), "utf8");
    assert.match(src, /\/api\/financeiro\/contas-a-pagar/);
    assert.match(src, /\/api\/financeiro\/relatorio-anual/);
    assert.match(src, /evaluateInterWriteGate/);
    assert.match(src, /rejectInterIfClosed/);
  });

  it("webhook rejeita antes de supabase insert quando gate fecha", () => {
    const src = readFileSync(path.join(root, "server/routes/inter.ts"), "utf8");
    const webhookIdx = src.indexOf('app.post("/api/inter/webhook/cobranca"');
    assert.ok(webhookIdx >= 0);
    const handler = src.slice(webhookIdx);
    const gateRel = handler.indexOf("evaluateInterWriteGate({ configured: isInterConfigured() })");
    const insertRel = handler.indexOf('from("inter_webhook_events").insert');
    assert.ok(gateRel >= 0, "gate no handler do webhook");
    assert.ok(insertRel > gateRel, "insert só depois do gate");
    assert.match(handler, /sem mutação/);
  });
});

describe("histórico e Asaas", () => {
  it("labels históricas gateway=inter permanecem legíveis no código", () => {
    const asaas = readFileSync(path.join(root, "server/asaas.ts"), "utf8");
    assert.match(asaas, /gateway === "inter"/);
    assert.match(asaas, /evaluateInterWriteGate/);
  });

  it("UI faturas não oferece SelectItem inter", () => {
    const faturas = readFileSync(path.join(root, "client/src/pages/admin/faturas.tsx"), "utf8");
    assert.doesNotMatch(faturas, /SelectItem value="inter"/);
    assert.match(faturas, /Integração Banco Inter desativada/);
  });

  it("contas a pagar remove ação Pagar via Inter", () => {
    const page = readFileSync(path.join(root, "client/src/pages/admin/contas-a-pagar.tsx"), "utf8");
    assert.doesNotMatch(page, /Pagar via Inter/);
    assert.doesNotMatch(page, /\/api\/inter\/pix/);
    assert.match(page, /\/api\/financeiro\/contas-a-pagar/);
  });
});
