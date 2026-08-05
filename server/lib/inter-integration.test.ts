import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  INTER_INTEGRATION_ENV,
  isInterIntegrationEnabled,
  evaluateInterWriteGate,
  isInterGatewayAllowedForNewCharge,
  interStatusWhenDisabled,
} from "./inter-integration.js";

const prev = process.env[INTER_INTEGRATION_ENV];

beforeEach(() => {
  delete process.env[INTER_INTEGRATION_ENV];
});

afterEach(() => {
  if (prev === undefined) delete process.env[INTER_INTEGRATION_ENV];
  else process.env[INTER_INTEGRATION_ENV] = prev;
});

describe("isInterIntegrationEnabled", () => {
  it("flag ausente = desativada", () => {
    assert.equal(isInterIntegrationEnabled({}), false);
  });

  it("flag false/0/empty = desativada", () => {
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "false" }), false);
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "0" }), false);
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "" }), false);
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "no" }), false);
  });

  it("somente true/1/yes/on habilita", () => {
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "true" }), true);
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "TRUE" }), true);
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "1" }), true);
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "yes" }), true);
    assert.equal(isInterIntegrationEnabled({ [INTER_INTEGRATION_ENV]: "on" }), true);
  });

  it("credenciais INTER_* sozinhas não habilitam", () => {
    assert.equal(
      isInterIntegrationEnabled({
        INTER_CLIENT_ID: "x",
        INTER_CLIENT_SECRET: "y",
        INTER_CERT_CRT: "z",
        INTER_CERT_KEY: "k",
      }),
      false,
    );
  });
});

describe("evaluateInterWriteGate", () => {
  it("desativado → 410, sem allow", () => {
    const g = evaluateInterWriteGate({ configured: true, env: {} });
    assert.equal(g.allow, false);
    assert.equal(g.status, 410);
    assert.equal(g.body?.code, "INTER_DISABLED");
    assert.ok(!JSON.stringify(g.body).includes("SECRET"));
    assert.ok(!JSON.stringify(g.body).includes("CERT"));
  });

  it("habilitado sem config → 503 fail-closed", () => {
    const g = evaluateInterWriteGate({
      configured: false,
      env: { [INTER_INTEGRATION_ENV]: "true" },
    });
    assert.equal(g.allow, false);
    assert.equal(g.status, 503);
    assert.equal(g.body?.code, "INTER_NOT_CONFIGURED");
  });

  it("habilitado e configurado → allow", () => {
    const g = evaluateInterWriteGate({
      configured: true,
      env: { [INTER_INTEGRATION_ENV]: "true" },
    });
    assert.equal(g.allow, true);
    assert.equal(g.body, null);
  });
});

describe("gateway inter nova cobrança", () => {
  it("rejeita quando desativado", () => {
    assert.equal(
      isInterGatewayAllowedForNewCharge({ configured: true, env: {} }),
      false,
    );
  });

  it("aceita só com flag + config", () => {
    assert.equal(
      isInterGatewayAllowedForNewCharge({
        configured: true,
        env: { [INTER_INTEGRATION_ENV]: "1" },
      }),
      true,
    );
  });
});

describe("interStatusWhenDisabled", () => {
  it("não expõe secrets", () => {
    const s = interStatusWhenDisabled();
    assert.equal(s.connected, false);
    assert.equal(s.disabled, true);
    assert.ok(!JSON.stringify(s).toLowerCase().includes("secret"));
    assert.ok(!JSON.stringify(s).toLowerCase().includes("cert"));
  });
});
