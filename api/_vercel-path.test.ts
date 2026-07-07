import { test } from "node:test";
import assert from "node:assert/strict";
import type { VercelRequest } from "@vercel/node";
import { isHealthzPath, patchReqUrl, resolveExpressPath } from "./_vercel-path.ts";

function mockReq(overrides: Partial<VercelRequest> & { url?: string }): VercelRequest {
  return {
    url: "/api",
    headers: {},
    query: {},
    ...overrides,
  } as VercelRequest;
}

test("resolveExpressPath: catch-all slug vira /api/whatsapp/webhook", () => {
  const req = mockReq({ query: { slug: ["whatsapp", "webhook"] } });
  assert.equal(resolveExpressPath(req), "/api/whatsapp/webhook");
});

test("patchReqUrl: restaura path para o Express rotear o webhook", () => {
  const req = mockReq({ url: "/api?slug=whatsapp&slug=webhook", query: { slug: ["whatsapp", "webhook"] } });
  assert.equal(patchReqUrl(req), "/api/whatsapp/webhook");
  assert.equal(req.url, "/api/whatsapp/webhook");
});

test("patchReqUrl: /api/healthz reescrito vira /healthz", () => {
  const req = mockReq({ query: { slug: ["healthz"] } });
  assert.equal(patchReqUrl(req), "/healthz");
  assert.equal(req.url, "/healthz");
});

test("isHealthzPath", () => {
  assert.equal(isHealthzPath("/healthz"), true);
  assert.equal(isHealthzPath("/api/healthz"), true);
  assert.equal(isHealthzPath("/api/whatsapp/webhook"), false);
});
